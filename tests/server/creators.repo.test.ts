import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Exercises creators.repo.ts against a real libSQL connection (not a
 * mock) — part of the remaining non-transactional repository migration
 * (Phase 4, docs/DEPLOYMENT_HARDENING.md). See tests/server/jobs.repo.test.ts
 * for why "../../server/db/client" is imported first.
 */

let creatorsRepo: typeof import("../../server/db/repositories/creators.repo");

beforeAll(async () => {
  await import("../../server/db/client");
  creatorsRepo = await import("../../server/db/repositories/creators.repo");
});

async function seedImport(): Promise<string> {
  const { db } = await import("../../server/db/client");
  const importId = randomUUID();
  await db.execute({
    sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    args: [importId, "sample.csv", "csv", 1, "uploaded", Date.now()],
  });
  return importId;
}

async function seedIdentityCache(): Promise<string> {
  const { db } = await import("../../server/db/client");
  const id = randomUUID();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO identity_cache (id, pipeline_version, verified, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?)`,
    args: [id, "1.0.0", now, now],
  });
  return id;
}

describe("creators.repo (libSQL)", () => {
  it("creates a creator and reads it back", async () => {
    const importId = await seedImport();

    const created = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawFullName: "Jane Doe",
      rawPayload: { fullName: "Jane Doe" },
      pipelineVersion: "1.0.0",
    });

    expect(created.processing_status).toBe("failed");
    expect(created.review_status).toBe("pending");

    const fetched = await creatorsRepo.getCreator(created.id);
    expect(fetched?.raw_full_name).toBe("Jane Doe");
    expect(JSON.parse(fetched!.raw_payload!)).toEqual({ fullName: "Jane Doe" });
  });

  it("returns undefined for a creator that does not exist", async () => {
    const fetched = await creatorsRepo.getCreator("does-not-exist");
    expect(fetched).toBeUndefined();
  });

  it("lists creators for an import in row_index order", async () => {
    const importId = await seedImport();
    const second = await creatorsRepo.createCreator({
      importId,
      rowIndex: 1,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });
    const first = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });

    const list = await creatorsRepo.listCreatorsByImport(importId);
    expect(list.map((c) => c.id)).toEqual([first.id, second.id]);
  });

  it("applies a resolved identity update", async () => {
    const importId = await seedImport();
    const created = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });

    const identityCacheId = await seedIdentityCache();
    await creatorsRepo.applyResolvedIdentity(created.id, {
      resolvedFirstName: "Jane",
      resolvedEmail: "jane@example.com",
      confidenceScore: 95,
      confidenceSource: "email",
      processingStatus: "enriched",
      pipelineVersion: "1.0.0",
      needsReview: false,
      identityCacheId,
    });

    const fetched = await creatorsRepo.getCreator(created.id);
    expect(fetched?.resolved_first_name).toBe("Jane");
    expect(fetched?.confidence_score).toBe(95);
    expect(fetched?.processing_status).toBe("enriched");
    expect(fetched?.identity_cache_id).toBe(identityCacheId);
  });

  it("preserves the existing identity_cache_id when the update omits it (COALESCE)", async () => {
    const importId = await seedImport();
    const created = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });

    const identityCacheId = await seedIdentityCache();
    await creatorsRepo.applyResolvedIdentity(created.id, {
      confidenceScore: 90,
      processingStatus: "enriched",
      pipelineVersion: "1.0.0",
      needsReview: false,
      identityCacheId,
    });
    await creatorsRepo.applyResolvedIdentity(created.id, {
      resolvedFirstName: "Updated",
      confidenceScore: 91,
      processingStatus: "enriched",
      pipelineVersion: "1.0.0",
      needsReview: false,
      // identityCacheId omitted this time
    });

    const fetched = await creatorsRepo.getCreator(created.id);
    expect(fetched?.identity_cache_id).toBe(identityCacheId);
    expect(fetched?.resolved_first_name).toBe("Updated");
  });

  it("sets raw mapped fields", async () => {
    const importId = await seedImport();
    const created = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });

    await creatorsRepo.setRawMappedFields(created.id, {
      rawFullName: "Jane Doe",
      rawEmail: "jane@example.com",
    });

    const fetched = await creatorsRepo.getCreator(created.id);
    expect(fetched?.raw_full_name).toBe("Jane Doe");
    expect(fetched?.raw_email).toBe("jane@example.com");
  });

  it("sets review status, marks and clears duplicate-of", async () => {
    const importId = await seedImport();
    const target = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });
    const source = await creatorsRepo.createCreator({
      importId,
      rowIndex: 1,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });

    await creatorsRepo.setReviewStatus(source.id, "approved");
    let fetched = await creatorsRepo.getCreator(source.id);
    expect(fetched?.review_status).toBe("approved");

    await creatorsRepo.markDuplicateOf(source.id, target.id);
    fetched = await creatorsRepo.getCreator(source.id);
    expect(fetched?.duplicate_of_creator_id).toBe(target.id);

    await creatorsRepo.clearDuplicateOf(source.id);
    fetched = await creatorsRepo.getCreator(source.id);
    expect(fetched?.duplicate_of_creator_id).toBeNull();
  });

  it("aggregates stats for an import", async () => {
    const importId = await seedImport();
    const target = await creatorsRepo.createCreator({
      importId,
      rowIndex: 0,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });
    await creatorsRepo.applyResolvedIdentity(target.id, {
      confidenceScore: 90,
      processingStatus: "enriched",
      pipelineVersion: "1.0.0",
      needsReview: false,
    });

    const needsReview = await creatorsRepo.createCreator({
      importId,
      rowIndex: 1,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });
    await creatorsRepo.applyResolvedIdentity(needsReview.id, {
      confidenceScore: 40,
      processingStatus: "needs_review",
      pipelineVersion: "1.0.0",
      needsReview: true,
    });

    const cacheHit = await creatorsRepo.createCreator({
      importId,
      rowIndex: 2,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });
    await creatorsRepo.applyResolvedIdentity(cacheHit.id, {
      confidenceScore: 100,
      processingStatus: "cache_hit",
      pipelineVersion: "1.0.0",
      needsReview: false,
    });

    const duplicate = await creatorsRepo.createCreator({
      importId,
      rowIndex: 3,
      rawPayload: {},
      pipelineVersion: "1.0.0",
    });
    await creatorsRepo.markDuplicateOf(duplicate.id, target.id);

    const stats = await creatorsRepo.getCreatorStats(importId);
    expect(stats).toEqual({
      processed: 4,
      needsReview: 1,
      cacheHits: 1,
      duplicates: 1,
    });
  });
});
