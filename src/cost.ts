/** Rough cost per 1K tokens (USD) for common models. Extend as needed. */
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const cost = COST_PER_1K[model] ?? { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * cost.input + (outputTokens / 1000) * cost.output;
}

/** Cost store: key (e.g. api key) -> total cost USD. Backed by in-memory or SQLite when DATABASE_PATH is set. */
export { recordCost, getCostByKey, getAllCosts } from "./db.js";
