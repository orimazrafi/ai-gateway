import { config } from "./config.js";

export type LogEntry = {
  id: string;
  ts: number;
  model: string;
  keyHint: string;
  promptTokens?: number;
  completionTokens?: number;
  requestPreview?: string;
  responsePreview?: string;
};

const log: LogEntry[] = [];
const MAX_ENTRIES = 1000;

export function appendPromptLog(entry: Omit<LogEntry, "id" | "ts">): void {
  if (!config.promptLogging) return;
  const full: LogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    ts: Date.now(),
  };
  log.push(full);
  if (log.length > MAX_ENTRIES) log.shift();
}

export function getPromptLog(limit = 100): LogEntry[] {
  return [...log].reverse().slice(0, limit);
}
