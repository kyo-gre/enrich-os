import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../server/db/migrate";
import { randomUUID } from "node:crypto";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("db migrations + repo CRUD smoke test", () => {
  it("creates all expected tables", () => {
    const db = createTestDb();
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "creators",
        "export_history",
        "identity_cache",
        "identity_cache_keys",
        "import_history",
        "job_items",
        "jobs",
        "manual_overrides",
        "processing_logs",
        "profile_snapshots",
      ]),
    );
  });

  it("inserts and reads back an import -> creator -> identity_cache chain", () => {
    const db = createTestDb();
    const now = Date.now();

    const importId = randomUUID();
    db.prepare(
      `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(importId, "sample.csv", "csv", 1, "uploaded", now);

    const identityId = randomUUID();
    db.prepare(
      `INSERT INTO identity_cache (id, first_name, pipeline_version, verified, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).run(identityId, "Mia", "1.0.0", now, now);

    db.prepare(
      `INSERT INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at)
       VALUES (?, ?, 'email', 'mia.shpirer@gmail.com', ?)`,
    ).run(randomUUID(), identityId, now);

    const creatorId = randomUUID();
    db.prepare(
      `INSERT INTO creators (
        id, import_id, row_index, raw_email, resolved_first_name, confidence_score, confidence_source,
        processing_status, pipeline_version, identity_cache_id, created_at, updated_at
      ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      creatorId,
      importId,
      "mia.shpirer@gmail.com",
      "Mia",
      95,
      "email",
      "enriched",
      "1.0.0",
      identityId,
      now,
      now,
    );

    const creator = db
      .prepare("SELECT * FROM creators WHERE id = ?")
      .get(creatorId) as { resolved_first_name: string; import_id: string };

    expect(creator.resolved_first_name).toBe("Mia");
    expect(creator.import_id).toBe(importId);

    const cached = db
      .prepare(
        `SELECT ic.first_name FROM identity_cache ic
         JOIN identity_cache_keys k ON k.identity_cache_id = ic.id
         WHERE k.key_type = 'email' AND k.key_value = 'mia.shpirer@gmail.com'`,
      )
      .get() as { first_name: string };

    expect(cached.first_name).toBe("Mia");
  });

  it("enforces unique identity_cache_keys per key_type/key_value", () => {
    const db = createTestDb();
    const now = Date.now();
    const identityId = randomUUID();
    db.prepare(
      `INSERT INTO identity_cache (id, pipeline_version, verified, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`,
    ).run(identityId, "1.0.0", now, now);
    db.prepare(
      `INSERT INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at) VALUES (?, ?, 'username', 'mia', ?)`,
    ).run(randomUUID(), identityId, now);

    expect(() =>
      db
        .prepare(
          `INSERT INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at) VALUES (?, ?, 'username', 'mia', ?)`,
        )
        .run(randomUUID(), identityId, now),
    ).toThrow();
  });

  it("aggregates processed/needs_review/cache_hits/duplicates per import (getCreatorStats query)", () => {
    const db = createTestDb();
    const now = Date.now();
    const importId = randomUUID();
    db.prepare(
      `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(importId, "sample.csv", "csv", 4, "uploaded", now);

    const insertCreator = db.prepare(
      `INSERT INTO creators (
        id, import_id, row_index, processing_status, pipeline_version,
        needs_review, duplicate_of_creator_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '1.0.0', ?, ?, ?, ?)`,
    );
    const target = randomUUID();
    insertCreator.run(target, importId, 0, "enriched", 0, null, now, now);
    insertCreator.run(randomUUID(), importId, 1, "needs_review", 1, null, now, now);
    insertCreator.run(randomUUID(), importId, 2, "cache_hit", 0, null, now, now);
    insertCreator.run(randomUUID(), importId, 3, "enriched", 0, target, now, now);

    const stats = db
      .prepare(
        `SELECT
          COUNT(*) AS processed,
          SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review,
          SUM(CASE WHEN processing_status = 'cache_hit' THEN 1 ELSE 0 END) AS cache_hits,
          SUM(CASE WHEN duplicate_of_creator_id IS NOT NULL THEN 1 ELSE 0 END) AS duplicates
         FROM creators WHERE import_id = ?`,
      )
      .get(importId) as {
      processed: number;
      needs_review: number;
      cache_hits: number;
      duplicates: number;
    };

    expect(stats).toEqual({
      processed: 4,
      needs_review: 1,
      cache_hits: 1,
      duplicates: 1,
    });
  });
});
