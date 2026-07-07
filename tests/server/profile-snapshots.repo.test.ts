import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Exercises profile-snapshots.repo.ts against a real libSQL connection
 * (not a mock) — part of the small-repository migration wave (Phase 3,
 * docs/DEPLOYMENT_HARDENING.md). See tests/server/jobs.repo.test.ts for
 * why "../../server/db/client" is imported first.
 */

let profileSnapshotsRepo: typeof import("../../server/db/repositories/profile-snapshots.repo");

beforeAll(async () => {
  await import("../../server/db/client");
  profileSnapshotsRepo = await import(
    "../../server/db/repositories/profile-snapshots.repo"
  );
});

async function seedCreator(): Promise<string> {
  const { db } = await import("../../server/db/client");
  const importId = randomUUID();
  await db.execute({
    sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    args: [importId, "sample.csv", "csv", 1, "uploaded", Date.now()],
  });

  const creatorId = randomUUID();
  await db.execute({
    sql: `INSERT INTO creators (id, import_id, row_index, processing_status, pipeline_version, created_at, updated_at)
     VALUES (?, ?, 0, 'failed', '1.0.0', ?, ?)`,
    args: [creatorId, importId, Date.now(), Date.now()],
  });

  return creatorId;
}

describe("profile-snapshots.repo (libSQL)", () => {
  it("saves a profile snapshot and reads it back", async () => {
    const creatorId = await seedCreator();

    const saved = await profileSnapshotsRepo.saveProfileSnapshot({
      creatorId,
      platform: "instagram",
      fetchedVia: "static",
      rawSnapshot: { displayName: "Jane", bio: "hi" },
    });

    expect(saved.platform).toBe("instagram");
    expect(saved.fetched_via).toBe("static");

    const snapshots = await profileSnapshotsRepo.listProfileSnapshotsForCreator(
      creatorId,
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe(saved.id);
    expect(JSON.parse(snapshots[0].raw_snapshot)).toEqual({
      displayName: "Jane",
      bio: "hi",
    });
  });

  it("returns snapshots for a creator in fetched_at order", async () => {
    const creatorId = await seedCreator();

    await profileSnapshotsRepo.saveProfileSnapshot({
      creatorId,
      platform: "instagram",
      fetchedVia: "static",
      rawSnapshot: { order: 1 },
    });
    await profileSnapshotsRepo.saveProfileSnapshot({
      creatorId,
      platform: "tiktok",
      fetchedVia: "browser",
      rawSnapshot: { order: 2 },
    });

    const snapshots = await profileSnapshotsRepo.listProfileSnapshotsForCreator(
      creatorId,
    );
    expect(snapshots.map((s) => s.platform)).toEqual(["instagram", "tiktok"]);
  });

  it("returns an empty array for a creator with no snapshots", async () => {
    const creatorId = await seedCreator();
    const snapshots = await profileSnapshotsRepo.listProfileSnapshotsForCreator(
      creatorId,
    );
    expect(snapshots).toEqual([]);
  });
});
