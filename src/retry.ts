import { config } from "./config.js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; delayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? config.retryAttempts;
  const delayMs = opts?.delayMs ?? config.retryDelayMs;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number })?.status;
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
        throw e;
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}
