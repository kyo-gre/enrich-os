import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Exercises jobs.repo.ts against a real libSQL connection (not a mock) —
 * the first repository migrated in the deployment hardening effort
 * (docs/DEPLOYMENT_HARDENING.md, Phase 2). Importing "../../server/db/client"
 * first mirrors production module load order: the app's libSQL connection
 * (server/db/libsql-client.ts) gates every query behind migration
 * completion, so the schema is guaranteed to exist by the time any
 * repository — including this one — is used.
 */

let jobsRepo: typeof import("../../server/db/repositories/jobs.repo");

beforeAll(async () => {
  await import("../../server/db/client");
  jobsRepo = await import("../../server/db/repositories/jobs.repo");
});

async function seedImport(rowCount: number): Promise<string> {
  const { db } = await import("../../server/db/client");
  const importId = randomUUID();
  await db.execute({
    sql: `INSERT INTO import_history (id, file_name, file_type, row_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    args: [importId, "sample.csv", "csv", rowCount, "uploaded", Date.now()],
  });
  return importId;
}

describe("jobs.repo (libSQL)", () => {
  it("creates and reads back a job", async () => {
    // import_history FK requires a real row for the insert to succeed.
    const importId = await seedImport(1);

    const job = await jobsRepo.createJob({
      importId,
      totalRows: 3,
      pipelineVersion: "1.0.0",
    });

    expect(job.status).toBe("queued");

    const fetched = await jobsRepo.getJob(job.id);
    expect(fetched?.id).toBe(job.id);
    expect(fetched?.import_id).toBe(importId);
    expect(fetched?.total_rows).toBe(3);
  });

  it("returns undefined for a job that does not exist", async () => {
    const fetched = await jobsRepo.getJob(randomUUID());
    expect(fetched).toBeUndefined();
  });

  it("advances job progress and updates status", async () => {
    const importId = await seedImport(1);

    const job = await jobsRepo.createJob({
      importId,
      totalRows: 2,
      pipelineVersion: "1.0.0",
    });

    await jobsRepo.setJobStatus(job.id, "running");
    await jobsRepo.advanceJobProgress(job.id, 1, 0, null);
    await jobsRepo.setJobStatus(job.id, "completed");

    const fetched = await jobsRepo.getJob(job.id);
    expect(fetched?.status).toBe("completed");
    expect(fetched?.processed_rows).toBe(1);
    expect(fetched?.started_at).not.toBeNull();
    expect(fetched?.completed_at).not.toBeNull();
  });

  it("creates job items and finds the next pending one in row order", async () => {
    const importId = await seedImport(2);
    const { db } = await import("../../server/db/client");

    const job = await jobsRepo.createJob({
      importId,
      totalRows: 2,
      pipelineVersion: "1.0.0",
    });

    const creatorId1 = randomUUID();
    const creatorId2 = randomUUID();
    for (const creatorId of [creatorId1, creatorId2]) {
      await db.execute({
        sql: `INSERT INTO creators (id, import_id, row_index, processing_status, pipeline_version, created_at, updated_at)
         VALUES (?, ?, ?, 'failed', '1.0.0', ?, ?)`,
        args: [
          creatorId,
          importId,
          creatorId === creatorId1 ? 0 : 1,
          Date.now(),
          Date.now(),
        ],
      });
    }

    await jobsRepo.createJobItem({ jobId: job.id, creatorId: creatorId1, rowIndex: 0 });
    const item2 = await jobsRepo.createJobItem({
      jobId: job.id,
      creatorId: creatorId2,
      rowIndex: 1,
    });

    const first = await jobsRepo.nextPendingJobItem(job.id);
    expect(first?.row_index).toBe(0);

    await jobsRepo.updateJobItemStatus(first!.id, "done");

    const next = await jobsRepo.nextPendingJobItem(job.id);
    expect(next?.id).toBe(item2.id);
  });
});
