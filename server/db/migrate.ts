import fs from "node:fs";
import path from "node:path";
import type { Client } from "@libsql/client";

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  "server",
  "db",
  "migrations",
);

/**
 * Applies each unapplied .sql file in server/db/migrations, tracked in
 * _migrations. Each file's schema statements and its own bookkeeping
 * insert are wrapped in one explicit BEGIN/COMMIT via executeMultiple —
 * libSQL's documented mechanism for running existing SQL scripts — so a
 * failed migration never leaves a partially-applied file recorded as
 * applied (or vice versa). executeMultiple takes a single raw SQL string
 * (no parameter binding), so the bookkeeping values are inlined as
 * literals; both are internally controlled (filenames on disk, a
 * timestamp), not user input.
 *
 * The bookkeeping insert uses OR IGNORE: every migration file's DDL is
 * itself idempotent (CREATE TABLE/INDEX IF NOT EXISTS), but this function
 * can run concurrently from multiple processes against the same physical
 * file (e.g. multiple serverless cold starts, or — as verified directly —
 * multiple parallel test workers). Two processes can both read "not yet
 * applied" before either commits, and without OR IGNORE the second's
 * bookkeeping insert fails with a UNIQUE violation even though its DDL
 * already succeeded harmlessly. This was caught by deliberately deleting
 * the local db file and re-running the full suite repeatedly.
 */
export async function runMigrations(client: Client): Promise<void> {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`,
  );

  const appliedResult = await client.execute(
    "SELECT name FROM _migrations",
  );
  const applied = new Set(
    (appliedResult.rows as unknown as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const escapedName = file.replace(/'/g, "''");
    await client.executeMultiple(
      `BEGIN;\n${sql}\nINSERT OR IGNORE INTO _migrations (name, applied_at) VALUES ('${escapedName}', ${Date.now()});\nCOMMIT;`,
    );
  }
}
