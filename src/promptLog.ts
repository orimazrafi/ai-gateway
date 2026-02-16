/** Prompt log. Backed by in-memory or SQLite when DATABASE_PATH is set. */
export type { LogEntry } from "./db.js";
export { appendPromptLog, getPromptLog } from "./db.js";
