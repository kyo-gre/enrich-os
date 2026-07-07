import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate";

const DB_PATH = path.join(process.cwd(), "data", "enrich-os.db");

declare global {
  var __enrichOsDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/**
 * Next.js Fast Refresh re-evaluates this module on every edit in dev mode.
 * Caching the connection on globalThis prevents accumulating open file
 * handles / hitting SQLITE_BUSY across hot reloads.
 */
export const db: Database.Database =
  globalThis.__enrichOsDb ?? (globalThis.__enrichOsDb = createConnection());
