import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Exercises processing-logs.repo.ts against a real libSQL connection (not
 * a mock) — part of the small-repository migration wave (Phase 3,
 * docs/DEPLOYMENT_HARDENING.md). See tests/server/jobs.repo.test.ts for
 * why "../../server/db/client" is imported first: it mirrors production
 * module load order and guarantees the shared local db file has the
 * expected schema before this repo connects to it.
 */

let processingLogsRepo: typeof import("../../server/db/repositories/processing-logs.repo");

beforeAll(async () => {
  await import("../../server/db/client");
  processingLogsRepo = await import(
    "../../server/db/repositories/processing-logs.repo"
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

describe("processing-logs.repo (libSQL)", () => {
  it("adds a processing log entry with a JSON detail payload", async () => {
    const creatorId = await seedCreator();

    await processingLogsRepo.addProcessingLog({
      creatorId,
      step: "normalized",
      status: "success",
      detail: { firstName: "Jane" },
    });

    const logs = await processingLogsRepo.listProcessingLogsForCreator(creatorId);
    expect(logs).toHaveLength(1);
    expect(logs[0].step).toBe("normalized");
    expect(logs[0].status).toBe("success");
    expect(JSON.parse(logs[0].detail!)).toEqual({ firstName: "Jane" });
  });

  it("returns logs for a creator in insertion (created_at) order", async () => {
    const creatorId = await seedCreator();

    await processingLogsRepo.addProcessingLog({
      creatorId,
      step: "step_one",
      status: "success",
    });
    await processingLogsRepo.addProcessingLog({
      creatorId,
      step: "step_two",
      status: "skipped",
    });

    const logs = await processingLogsRepo.listProcessingLogsForCreator(creatorId);
    expect(logs.map((l) => l.step)).toEqual(["step_one", "step_two"]);
  });

  it("returns an empty array for a creator with no logs", async () => {
    const creatorId = await seedCreator();
    const logs = await processingLogsRepo.listProcessingLogsForCreator(creatorId);
    expect(logs).toEqual([]);
  });

  it("stores a null detail when none is provided", async () => {
    const creatorId = await seedCreator();
    await processingLogsRepo.addProcessingLog({
      creatorId,
      step: "review_approved",
      status: "success",
    });
    const logs = await processingLogsRepo.listProcessingLogsForCreator(creatorId);
    expect(logs[0].detail).toBeNull();
  });
});
