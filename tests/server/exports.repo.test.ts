import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Exercises exports.repo.ts against a real libSQL connection (not a mock)
 * — part of the small-repository migration wave (Phase 3,
 * docs/DEPLOYMENT_HARDENING.md). See tests/server/jobs.repo.test.ts for
 * why "../../server/db/client" is imported first.
 */

let exportsRepo: typeof import("../../server/db/repositories/exports.repo");

beforeAll(async () => {
  await import("../../server/db/client");
  exportsRepo = await import("../../server/db/repositories/exports.repo");
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

describe("exports.repo (libSQL)", () => {
  it("records an export and lists it back most-recent-first", async () => {
    const importId = await seedImport();

    const recorded = await exportsRepo.recordExport({
      importId,
      exportType: "quick",
      fileName: "export-quick.csv",
      rowCount: 3,
    });

    expect(recorded.export_type).toBe("quick");
    expect(recorded.row_count).toBe(3);

    const list = await exportsRepo.listExports(10);
    expect(list.some((e) => e.id === recorded.id)).toBe(true);
    // most recent (just-inserted) export should be first
    expect(list[0].id).toBe(recorded.id);
  });

  it("stores a JSON filter snapshot when provided", async () => {
    const importId = await seedImport();

    const recorded = await exportsRepo.recordExport({
      importId,
      exportType: "full",
      filterSnapshot: { confidenceBucket: "high" },
      fileName: "export-full.csv",
      rowCount: 1,
    });

    expect(JSON.parse(recorded.filter_snapshot!)).toEqual({
      confidenceBucket: "high",
    });
  });

  it("respects the limit passed to listExports", async () => {
    const importId = await seedImport();
    for (let i = 0; i < 3; i++) {
      await exportsRepo.recordExport({
        importId,
        exportType: "quick",
        fileName: `export-${i}.csv`,
        rowCount: 1,
      });
    }

    const list = await exportsRepo.listExports(2);
    expect(list).toHaveLength(2);
  });
});
