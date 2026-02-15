import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { config } from "./config.js";
import { checkRateLimit } from "./rateLimit.js";
import { resolveUpstream } from "./router.js";
import { withRetry } from "./retry.js";
import { pipeStream } from "./streaming.js";
import { estimateCost, recordCost, getCostByKey, getAllCosts } from "./cost.js";
import { appendPromptLog, getPromptLog } from "./promptLog.js";

const app = express();
app.use(cors());
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

/** OpenAI-style chat completions proxy */
app.all("/v1/chat/completions", async (req, res) => {
  const body = req.body as { model?: string; stream?: boolean; messages?: unknown[] };
  const model = body?.model ?? "gpt-3.5-turbo";
  const stream = body?.stream === true;
  const { baseUrl, apiKey } = resolveUpstream(model);

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    ...(req.headers["x-api-key"] && { "X-API-Key": req.headers["x-api-key"] as string }),
  };

  const keyHint = getKeyHint(req);
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

app.listen(config.port, () => {
  console.log(`AI Gateway listening on http://localhost:${config.port}`);
});
