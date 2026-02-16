import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { config } from "./config.js";
import { initDb, isUsingDatabase } from "./db.js";
import { checkRateLimit } from "./rateLimit.js";
import { resolveUpstream } from "./router.js";
import { withRetry } from "./retry.js";
import { pipeStream } from "./streaming.js";
import { estimateCost, recordCost, getCostByKey, getAllCosts } from "./cost.js";
import { appendPromptLog, getPromptLog } from "./promptLog.js";
import {
  isAuthEnabled,
  getLoginRedirectUrl,
  exchangeCodeForUser,
  verifyGoogleIdToken,
  signToken,
  verifyToken,
  getDashboardRedirectWithToken,
} from "./auth.js";
import { getUserSettings, setUserSettings } from "./authStore.js";

initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:5173";

const app = express();
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (origin === DASHBOARD_URL) return cb(null, true);
      if (origin.endsWith(".vercel.app")) return cb(null, true);
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))
        return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

/** Observability: request id and timing */
app.use((req, res, next) => {
  const id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as express.Request & { requestId: string }).requestId = id;
  res.setHeader("X-Request-Id", id);
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms [${id}]`
    );
  });
  next();
});

function getKeyHint(req: express.Request): string {
  const key = req.headers["x-api-key"] ?? req.headers["authorization"]?.toString().slice(0, 20);
  return key ? `${String(key)}…` : (req.ip ?? "anonymous");
}

/** Rate limit middleware */
app.use((req, res, next) => {
  const { allowed, remaining, resetInMs } = checkRateLimit(req);
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset-Ms", String(resetInMs));
  if (!allowed) {
    res.status(429).json({ error: "rate_limit_exceeded", message: "Too many requests" });
    return;
  }
  next();
});

/** Auth: SSO config for dashboard */
app.get("/auth/config", (_req, res) => {
  const enabled = isAuthEnabled();
  const baseUrl = process.env.GATEWAY_PUBLIC_URL || `http://localhost:${config.port}`;
  res.json({
    ssoEnabled: enabled,
    loginUrl: enabled ? `${baseUrl}/auth/login` : null,
  });
});

/** Auth: verify Google One Tap ID token, return our JWT */
app.post("/auth/verify-id-token", express.json(), async (req, res) => {
  if (!isAuthEnabled()) {
    res.status(503).json({ error: "SSO not configured" });
    return;
  }
  const credential = (req.body as { credential?: string })?.credential;
  if (!credential || typeof credential !== "string") {
    res.status(400).json({ error: "Missing credential" });
    return;
  }
  const user = await verifyGoogleIdToken(credential);
  if (!user) {
    res.status(401).json({ error: "Invalid credential" });
    return;
  }
  const token = signToken(user);
  res.json({ token });
});

/** Auth: SSO login redirect */
app.get("/auth/login", (_req, res) => {
  if (!isAuthEnabled()) {
    res.status(503).json({ error: "SSO not configured", message: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" });
    return;
  }
  res.redirect(getLoginRedirectUrl());
});

/** Auth: OAuth callback → JWT → redirect to dashboard */
app.get("/auth/callback", async (req, res) => {
  if (!isAuthEnabled()) {
    res.redirect(process.env.DASHBOARD_URL || "http://localhost:5173");
    return;
  }
  const code = req.query.code as string | undefined;
  if (!code) {
    res.redirect((process.env.DASHBOARD_URL || "http://localhost:5173") + "?error=no_code");
    return;
  }
  const user = await exchangeCodeForUser(code);
  if (!user) {
    res.redirect((process.env.DASHBOARD_URL || "http://localhost:5173") + "?error=auth_failed");
    return;
  }
  const token = signToken(user);
  res.redirect(getDashboardRedirectWithToken(token));
});

function getSessionToken(req: express.Request): string | undefined {
  const raw = req.headers["x-session-token"] ?? req.headers["authorization"];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return typeof s === "string" ? s.replace(/^Bearer\s+/i, "").trim() : undefined;
}

/** Auth: current user + saved settings (masked) */
app.get("/auth/me", (req, res) => {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Missing session token" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }
  const settings = getUserSettings(user.id);
  res.json({
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture },
    settings: settings
      ? {
          provider: settings.provider ?? "",
          upstream: settings.upstream ?? "",
          model: settings.model ?? "gpt-3.5-turbo",
          hasApiKey: Boolean(settings.apiKey?.trim()),
        }
      : { provider: "", upstream: "", model: "gpt-3.5-turbo", hasApiKey: false },
  });
});

/** Auth: save user settings (provider, model, apiKey) */
app.post("/auth/settings", (req, res) => {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as { provider?: string; upstream?: string; model?: string; apiKey?: string };
  setUserSettings(user.id, {
    provider: body.provider,
    upstream: body.upstream,
    model: body.model,
    apiKey: body.apiKey,
  });
  res.json({ ok: true });
});

/** OpenAI-style chat completions proxy */
app.all("/v1/chat/completions", async (req, res) => {
  const body = req.body as { model?: string; stream?: boolean; messages?: unknown[] };
  let model = body?.model ?? "gpt-3.5-turbo";
  const stream = body?.stream === true;

  const sessionToken = (req.headers["x-session-token"] as string)?.trim();
  const authUser = sessionToken ? verifyToken(sessionToken) : null;

  let dynamicUpstream = (req.headers["x-ai-gateway-upstream"] as string)?.trim();
  let apiKey: string | undefined;
  let keyHint = getKeyHint(req);

  if (authUser) {
    const stored = getUserSettings(authUser.id);
    if (stored?.apiKey?.trim()) {
      apiKey = stored.apiKey.trim();
      keyHint = `user:${authUser.email}`;
      if (!dynamicUpstream && stored.upstream?.trim()) dynamicUpstream = stored.upstream.trim();
      if (stored.model?.trim()) model = stored.model;
    }
  }

  if (!apiKey) {
    const serverApiKey = resolveUpstream(model).apiKey;
    const authHeader = req.headers["authorization"] as string | undefined;
    const clientKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;
    apiKey = clientKey || serverApiKey;
  }

  const baseUrl = dynamicUpstream
    ? dynamicUpstream.replace(/\/$/, "")
    : resolveUpstream(model).baseUrl.replace(/\/$/, "");

  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    ...(req.headers["x-api-key"] && { "X-API-Key": req.headers["x-api-key"] as string }),
  };

  const requestPreview = body.messages
    ? JSON.stringify(body.messages).slice(0, 200)
    : undefined;

  const doFetch = () =>
    fetch(url, {
      method: req.method,
      headers,
      body: req.method !== "GET" ? JSON.stringify(body) : undefined,
    });

  try {
    const upstreamRes = await withRetry(doFetch);
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text();
      res.status(upstreamRes.status).send(text || upstreamRes.statusText);
      return;
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      pipeStream(
        {
          body: upstreamRes.body,
          headers: { get: (name: string) => upstreamRes.headers.get(name) },
          status: upstreamRes.status,
        },
        res
      );
      appendPromptLog({
        model,
        keyHint,
        requestPreview,
        responsePreview: "[streaming]",
      });
      return;
    }

    const data = (await upstreamRes.json()) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: { message?: { content?: string } }[];
    };
    const usage = data?.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const cost = estimateCost(model, inputTokens, outputTokens);
    recordCost(keyHint, cost);
    appendPromptLog({
      model,
      keyHint,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      requestPreview,
      responsePreview: data?.choices?.[0]?.message?.content?.slice(0, 200),
    });
    res.setHeader("X-Cost-USD", cost.toFixed(6));
    res.json(data);
  } catch (e) {
    console.error("Upstream error:", e);
    res.status(502).json({
      error: "upstream_error",
      message: (e as Error).message,
    });
  }
});

/** Cost and observability endpoints */
app.get("/api/costs", (_req, res) => {
  res.json(getAllCosts());
});

app.get("/api/costs/:key", (req, res) => {
  const key = decodeURIComponent(req.params.key);
  res.json({ key, costUsd: getCostByKey(key) });
});

app.get("/api/prompt-log", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(getPromptLog(limit));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

/** API info for clients that want endpoint list */
app.get("/api", (_req, res) => {
  res.json({
    name: "AI Gateway",
    endpoints: {
      health: "GET /health",
      chat: "POST /v1/chat/completions",
      costs: "GET /api/costs",
      promptLog: "GET /api/prompt-log?limit=100",
    },
  });
});

/** Dashboard UI (serves public/index.html at /) — after API/auth so /auth/config etc. are never served as static */
app.use(express.static(publicDir));

app.listen(config.port, "0.0.0.0", () => {
  console.log(`AI Gateway listening on http://localhost:${config.port}`);
  if (isUsingDatabase()) {
    console.log("Storage: SQLite (persistent)");
  } else {
    console.log("Storage: in-memory (set DATABASE_PATH for persistence)");
  }
});
