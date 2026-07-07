import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  "server",
  "db",
  "migrations",
);

export function runMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`,
  );

  const applied = new Set(
    db
      .prepare<[], { name: string }>("SELECT name FROM _migrations")
      .all()
      .map((row) => row.name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const insertMigration = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file, Date.now());
    });
    applyMigration();
  }
}
