import { config } from "./config.js";

/** In-memory rate limit: key -> count in current window, window start */
const store = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000; // 1 minute

function getKey(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const key = req.headers["x-api-key"] ?? req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "") ?? req.ip ?? "anonymous";
  return String(key);
}

function getWindow(key: string): { count: number; windowStart: number } {
  const now = Date.now();
  const cur = store.get(key);
  if (!cur) {
    const w = { count: 1, windowStart: now };
    store.set(key, w);
    return w;
  }
  if (now - cur.windowStart >= WINDOW_MS) {
    const w = { count: 1, windowStart: now };
    store.set(key, w);
    return w;
  }
  cur.count += 1;
  return cur;
}

export function checkRateLimit(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): { allowed: boolean; remaining: number; resetInMs: number } {
  const key = getKey(req);
  const w = getWindow(key);
  const limit = config.rateLimitRpm;
  const remaining = Math.max(0, limit - w.count);
  const resetInMs = WINDOW_MS - (Date.now() - w.windowStart);
  return {
    allowed: w.count <= limit,
    remaining,
    resetInMs,
  };
}
