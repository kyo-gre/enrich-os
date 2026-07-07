import { describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "../../server/db/migrate";
import { randomUUID } from "node:crypto";

/**
 * Rewritten against the libSQL client (docs/DEPLOYMENT_HARDENING.md §5) —
 * same schema-verification + FK-cascade/uniqueness assertions as the
 * original better-sqlite3 version, run through the actual production
 * client/dialect (server/db/migrate.ts's async runMigrations) rather than
 * a different driver.
 */
async function createTestDb(): Promise<Client> {
  const db = createClient({ url: ":memory:" });
  await db.execute("PRAGMA foreign_keys = ON");
  await runMigrations(db);
  return db;
}

describe("db migrations + repo CRUD smoke test", () => {
  it("creates all expected tables", async () => {
    const db = await createTestDb();
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const tables = (result.rows as unknown as Array<{ name: string }>).map(
      (row) => row.name,
    );

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

  it("inserts and reads back an import -> creator -> identity_cache chain", async () => {
    const db = await createTestDb();
    const now = Date.now();

    const importId = randomUUID();
    await db.execute({
      sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      args: [importId, "sample.csv", "csv", 1, "uploaded", now],
    });

    const identityId = randomUUID();
    await db.execute({
      sql: `INSERT INTO identity_cache (id, first_name, pipeline_version, verified, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      args: [identityId, "Mia", "1.0.0", now, now],
    });

    await db.execute({
      sql: `INSERT INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at)
       VALUES (?, ?, 'email', 'mia.shpirer@gmail.com', ?)`,
      args: [randomUUID(), identityId, now],
    });

    const creatorId = randomUUID();
    await db.execute({
      sql: `INSERT INTO creators (
        id, import_id, row_index, raw_email, resolved_first_name, confidence_score, confidence_source,
        processing_status, pipeline_version, identity_cache_id, created_at, updated_at
      ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
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
      ],
    });

    const creatorResult = await db.execute({
      sql: "SELECT * FROM creators WHERE id = ?",
      args: [creatorId],
    });
    const creator = creatorResult.rows[0] as unknown as {
      resolved_first_name: string;
      import_id: string;
    };

    expect(creator.resolved_first_name).toBe("Mia");
    expect(creator.import_id).toBe(importId);

    const cachedResult = await db.execute(
      `SELECT ic.first_name FROM identity_cache ic
         JOIN identity_cache_keys k ON k.identity_cache_id = ic.id
         WHERE k.key_type = 'email' AND k.key_value = 'mia.shpirer@gmail.com'`,
    );
    const cached = cachedResult.rows[0] as unknown as { first_name: string };

    expect(cached.first_name).toBe("Mia");
  });

  it("enforces unique identity_cache_keys per key_type/key_value", async () => {
    const db = await createTestDb();
    const now = Date.now();
    const identityId = randomUUID();
    await db.execute({
      sql: `INSERT INTO identity_cache (id, pipeline_version, verified, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`,
      args: [identityId, "1.0.0", now, now],
    });
    await db.execute({
      sql: `INSERT INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at) VALUES (?, ?, 'username', 'mia', ?)`,
      args: [randomUUID(), identityId, now],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at) VALUES (?, ?, 'username', 'mia', ?)`,
        args: [randomUUID(), identityId, now],
      }),
    ).rejects.toThrow();
  });

  it("aggregates processed/needs_review/cache_hits/duplicates per import (getCreatorStats query)", async () => {
    const db = await createTestDb();
    const now = Date.now();
    const importId = randomUUID();
    await db.execute({
      sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [importId, "sample.csv", "csv", 4, "uploaded", now],
    });

    const insertCreator = async (
      id: string,
      rowIndex: number,
      status: string,
      needsReview: number,
      duplicateOf: string | null,
    ) =>
      db.execute({
        sql: `INSERT INTO creators (
        id, import_id, row_index, processing_status, pipeline_version,
        needs_review, duplicate_of_creator_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '1.0.0', ?, ?, ?, ?)`,
        args: [id, importId, rowIndex, status, needsReview, duplicateOf, now, now],
      });

    const target = randomUUID();
    await insertCreator(target, 0, "enriched", 0, null);
    await insertCreator(randomUUID(), 1, "needs_review", 1, null);
    await insertCreator(randomUUID(), 2, "cache_hit", 0, null);
    await insertCreator(randomUUID(), 3, "enriched", 0, target);

    const statsResult = await db.execute({
      sql: `SELECT
          COUNT(*) AS processed,
          SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review,
          SUM(CASE WHEN processing_status = 'cache_hit' THEN 1 ELSE 0 END) AS cache_hits,
          SUM(CASE WHEN duplicate_of_creator_id IS NOT NULL THEN 1 ELSE 0 END) AS duplicates
         FROM creators WHERE import_id = ?`,
      args: [importId],
    });
    const stats = statsResult.rows[0] as unknown as {
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

  it("cascades a deleted import_history row to its creators", async () => {
    const db = await createTestDb();
    const now = Date.now();
    const importId = randomUUID();
    await db.execute({
      sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [importId, "sample.csv", "csv", 1, "uploaded", now],
    });
    const creatorId = randomUUID();
    await db.execute({
      sql: `INSERT INTO creators (id, import_id, row_index, processing_status, pipeline_version, created_at, updated_at)
       VALUES (?, ?, 0, 'failed', '1.0.0', ?, ?)`,
      args: [creatorId, importId, now, now],
    });

    await db.execute({ sql: "DELETE FROM import_history WHERE id = ?", args: [importId] });

    const remaining = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM creators WHERE id = ?",
      args: [creatorId],
    });
    expect(Number((remaining.rows[0] as unknown as { n: number }).n)).toBe(0);
  });

  it("sets creators.identity_cache_id to NULL (not cascade delete) when the identity_cache row is deleted", async () => {
    const db = await createTestDb();
    const now = Date.now();
    const importId = randomUUID();
    await db.execute({
      sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [importId, "sample.csv", "csv", 1, "uploaded", now],
    });
    const identityId = randomUUID();
    await db.execute({
      sql: `INSERT INTO identity_cache (id, pipeline_version, verified, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`,
      args: [identityId, "1.0.0", now, now],
    });
    const creatorId = randomUUID();
    await db.execute({
      sql: `INSERT INTO creators (id, import_id, row_index, processing_status, pipeline_version, identity_cache_id, created_at, updated_at)
       VALUES (?, ?, 0, 'enriched', '1.0.0', ?, ?, ?)`,
      args: [creatorId, importId, identityId, now, now],
    });

    await db.execute({ sql: "DELETE FROM identity_cache WHERE id = ?", args: [identityId] });

    const creator = await db.execute({
      sql: "SELECT identity_cache_id FROM creators WHERE id = ?",
      args: [creatorId],
    });
    expect(
      (creator.rows[0] as unknown as { identity_cache_id: string | null })
        .identity_cache_id,
    ).toBeNull();
  });
});
