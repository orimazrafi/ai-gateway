/** Per-user saved credentials. Backed by in-memory or SQLite when DATABASE_PATH is set. */
export type { UserSettings } from "./db.js";
export { getUserSettings, setUserSettings, hasApiKey } from "./db.js";
