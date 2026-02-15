export const config = {
  port: Number(process.env.PORT) || 3002,
  /** OpenAI-compatible API base (e.g. OpenAI, Azure, local LLM) */
  defaultUpstream: process.env.AI_GATEWAY_UPSTREAM || "https://api.openai.com/v1",
  /** API key for upstream (or use header from client) */
  upstreamApiKey: process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY,
  /** Rate limit: max requests per minute per key (or IP if no key) */
  rateLimitRpm: Number(process.env.AI_GATEWAY_RATE_LIMIT_RPM) || 60,
  /** Retry: max attempts for transient failures */
  retryAttempts: Number(process.env.AI_GATEWAY_RETRY_ATTEMPTS) || 3,
  /** Retry: base delay in ms */
  retryDelayMs: Number(process.env.AI_GATEWAY_RETRY_DELAY_MS) || 1000,
  /** Enable prompt/response logging */
  promptLogging: process.env.AI_GATEWAY_PROMPT_LOGGING !== "false",
} as const;

export type ModelRoute = {
  modelId: string;
  upstream: string;
  apiKey?: string;
};

/** Model routing: map model id to upstream. Empty = use default. */
export const modelRoutes: ModelRoute[] = (process.env.AI_GATEWAY_MODEL_ROUTES || "")
  .split(",")
  .filter(Boolean)
  .map((s) => {
    const [modelId, upstream] = s.split(":").map((x) => x.trim());
    return { modelId, upstream };
  })
  .filter((r) => r.modelId && r.upstream);
