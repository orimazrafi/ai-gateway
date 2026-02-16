/**
 * Optional database layer. If DATABASE_PATH is set, uses SQLite for persistence.
 * Otherwise uses in-memory storage (data lost on restart).
 * Requires: npm install better-sqlite3 (optional; install for DB support).
 */

import { config } from "./config.js";

interface SqliteDb {
  prepare(sql: string): { run: (...args: unknown[]) => unknown; get: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] };
  exec(sql: string): void;
  pragma(sql: string): void;
}

export interface UserSettings {
  apiKey: string;
  provider?: string;
  upstream?: string;
  model?: string;
}

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

// --- In-memory fallback ---
const memoryUserStore = new Map<string, UserSettings>();
const memoryCostStore = new Map<string, number>();
const memoryLog: LogEntry[] = [];
const MAX_LOG = 1000;

// --- SQLite (lazy) ---
let sqlite: SqliteDb | null = null;

function getDbPath(): string | undefined {
  return process.env.DATABASE_PATH || process.env.DB_PATH;
}

function initSqlite(path: string): SqliteDb | null {
  try {
    const Database = require("better-sqlite3") as new (path: string) => SqliteDb;
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL DEFAULT '',
      provider TEXT,
      upstream TEXT,
      model TEXT
    );
    CREATE TABLE IF NOT EXISTS costs (
      key TEXT PRIMARY KEY,
      total_usd REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS prompt_log (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      key_hint TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      request_preview TEXT,
      response_preview TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_prompt_log_ts ON prompt_log(ts DESC);
  `);

    return db;
  } catch {
    console.warn("DATABASE_PATH is set but better-sqlite3 is not installed. Run: npm install better-sqlite3. Using in-memory storage.");
    return null;
  }
}

/** Call at startup. If DATABASE_PATH/DB_PATH is set, uses SQLite; otherwise in-memory. */
export function initDb(): void {
  const path = getDbPath();
  if (path) {
    const db = initSqlite(path);
    if (db) sqlite = db;
  }
}

// --- User settings ---
export function getUserSettings(userId: string): UserSettings | undefined {
  if (sqlite) {
    const row = sqlite.prepare("SELECT api_key AS apiKey, provider, upstream, model FROM user_settings WHERE user_id = ?").get(userId) as { apiKey: string; provider?: string; upstream?: string; model?: string } | undefined;
    if (!row) return undefined;
    return { apiKey: row.apiKey ?? "", provider: row.provider, upstream: row.upstream, model: row.model };
  }
  return memoryUserStore.get(userId);
}

export function setUserSettings(userId: string, settings: Partial<UserSettings>): void {
  const existing = getUserSettings(userId) ?? { apiKey: "" };
  const next: UserSettings = { ...existing, ...settings };

  if (sqlite) {
    sqlite
      .prepare(
        "INSERT INTO user_settings (user_id, api_key, provider, upstream, model) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET api_key=excluded.api_key, provider=excluded.provider, upstream=excluded.upstream, model=excluded.model"
      )
      .run(userId, next.apiKey ?? "", next.provider ?? null, next.upstream ?? null, next.model ?? null);
    return;
  }
  memoryUserStore.set(userId, next);
}

export function hasApiKey(userId: string): boolean {
  const s = getUserSettings(userId);
  return Boolean(s?.apiKey?.trim());
}

// --- Costs ---
export function recordCost(key: string, usd: number): void {
  if (sqlite) {
    sqlite.prepare("INSERT INTO costs (key, total_usd) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET total_usd = total_usd + excluded.total_usd").run(key, usd);
    return;
  }
  memoryCostStore.set(key, (memoryCostStore.get(key) ?? 0) + usd);
}

export function getCostByKey(key: string): number {
  if (sqlite) {
    const row = sqlite.prepare("SELECT total_usd FROM costs WHERE key = ?").get(key) as { total_usd: number } | undefined;
    return row ? row.total_usd : 0;
  }
  return memoryCostStore.get(key) ?? 0;
}

export function getAllCosts(): Record<string, number> {
  if (sqlite) {
    const rows = sqlite.prepare("SELECT key, total_usd FROM costs").all() as { key: string; total_usd: number }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.total_usd]));
  }
  return Object.fromEntries(memoryCostStore);
}

// --- Prompt log ---
export function appendPromptLog(entry: Omit<LogEntry, "id" | "ts">): void {
  if (!config.promptLogging) return;
  const full: LogEntry = { ...entry, id: crypto.randomUUID(), ts: Date.now() };

  if (sqlite) {
    sqlite
      .prepare(
        "INSERT INTO prompt_log (id, ts, model, key_hint, prompt_tokens, completion_tokens, request_preview, response_preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        full.id,
        full.ts,
        full.model,
        full.keyHint,
        full.promptTokens ?? null,
        full.completionTokens ?? null,
        full.requestPreview ?? null,
        full.responsePreview ?? null
      );
    return;
  }
  memoryLog.push(full);
  if (memoryLog.length > MAX_LOG) memoryLog.shift();
}

export function getPromptLog(limit = 100): LogEntry[] {
  if (sqlite) {
    const rows = sqlite.prepare("SELECT id, ts, model, key_hint AS keyHint, prompt_tokens AS promptTokens, completion_tokens AS completionTokens, request_preview AS requestPreview, response_preview AS responsePreview FROM prompt_log ORDER BY ts DESC LIMIT ?").all(limit) as LogEntry[];
    return rows;
  }
  return [...memoryLog].reverse().slice(0, limit);
}

export function isUsingDatabase(): boolean {
  return sqlite !== null;
}
