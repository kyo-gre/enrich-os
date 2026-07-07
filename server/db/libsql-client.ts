import path from "node:path";
import fs from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "./migrate";

/**
 * The database connection layer (docs/DEPLOYMENT_HARDENING.md). Every
 * repository imports `libsqlClient` from this module.
 *
 * Selects a local file URL when TURSO_DATABASE_URL is unset (so
 * `pnpm dev` keeps working with zero .env config), and the real Turso
 * URL + auth token when set.
 */

const LOCAL_DB_PATH = path.join(process.cwd(), "data", "enrich-os.db");
const LOCAL_DB_URL = `file:${LOCAL_DB_PATH.replace(/\\/g, "/")}`;

declare global {
  var __enrichOsLibsqlClient: Client | undefined;
}

function createConnection(): Client {
  const url = process.env.TURSO_DATABASE_URL || LOCAL_DB_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!process.env.TURSO_DATABASE_URL) {
    fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  }

  const client = createClient(authToken ? { url, authToken } : { url });

  // In tests, the same local file is also opened by multiple parallel
  // workers. Without an explicit busy timeout, a write hitting a
  // momentary lock fails immediately with SQLITE_BUSY instead of
  // retrying briefly. Only applies to the local file driver — hosted
  // Turso's remote protocol rejects PRAGMA busy_timeout outright
  // (SQL_PARSE_ERROR), and doesn't need it since it isn't a local
  // multi-process WAL file (verified Phase 7, docs/DEPLOYMENT_HARDENING.md §7).
  if (!process.env.TURSO_DATABASE_URL) {
    void client.execute("PRAGMA busy_timeout = 5000");
  }

  return client;
}

declare global {
  var __enrichOsMigrationsReady: Promise<void> | undefined;
}

/**
 * Cached on globalThis for the same reason as the connection itself: Next.js
 * Fast Refresh re-evaluates this module on every edit in dev mode, and
 * migrations must run exactly once per process, not once per reload.
 */
const rawClient: Client =
  globalThis.__enrichOsLibsqlClient ??
  (globalThis.__enrichOsLibsqlClient = createConnection());

const migrationsReady: Promise<void> =
  globalThis.__enrichOsMigrationsReady ??
  (globalThis.__enrichOsMigrationsReady = runMigrations(rawClient));

/**
 * Every repository calls `libsqlClient.execute(...)` / `.batch(...)`
 * without first awaiting readiness — in the original better-sqlite3
 * design, migrations ran synchronously at module load, so this was
 * automatic. Under libSQL's async client, that guarantee has to be
 * enforced explicitly: this wrapper makes every read/write transparently
 * wait for `migrationsReady` first, so no repo call can ever race ahead of
 * schema setup — including a cold start against a real Turso database,
 * where the first request after a deploy can't assume anything has
 * already warmed the connection.
 */
export const libsqlClient: Client = new Proxy(rawClient, {
  get(target, prop, receiver) {
    if (prop === "execute" || prop === "batch") {
      const original = Reflect.get(target, prop, receiver) as (
        ...args: unknown[]
      ) => Promise<unknown>;
      return async (...args: unknown[]) => {
        await migrationsReady;
        return original.apply(target, args);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});
