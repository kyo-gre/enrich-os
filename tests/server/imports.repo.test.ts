import { describe, expect, it, beforeAll } from "vitest";

/**
 * Exercises imports.repo.ts against a real libSQL connection (not a mock)
 * — part of the remaining non-transactional repository migration (Phase
 * 4, docs/DEPLOYMENT_HARDENING.md). See tests/server/jobs.repo.test.ts for
 * why "../../server/db/client" is imported first.
 */

let importsRepo: typeof import("../../server/db/repositories/imports.repo");

beforeAll(async () => {
  await import("../../server/db/client");
  importsRepo = await import("../../server/db/repositories/imports.repo");
});

describe("imports.repo (libSQL)", () => {
  it("creates an import and reads it back", async () => {
    const created = await importsRepo.createImport({
      fileName: "sample.csv",
      fileType: "csv",
    });

    expect(created.status).toBe("uploaded");
    expect(created.row_count).toBe(0);

    const fetched = await importsRepo.getImport(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.file_name).toBe("sample.csv");
  });

  it("returns undefined for an import that does not exist", async () => {
    const fetched = await importsRepo.getImport("does-not-exist");
    expect(fetched).toBeUndefined();
  });

  it("updates the column mapping, row count, and status", async () => {
    const created = await importsRepo.createImport({
      fileName: "sample.csv",
      fileType: "csv",
    });

    await importsRepo.updateImportMapping(
      created.id,
      { firstName: "First Name", email: "Email" },
      42,
    );

    const fetched = await importsRepo.getImport(created.id);
    expect(fetched?.status).toBe("mapped");
    expect(fetched?.row_count).toBe(42);
    expect(JSON.parse(fetched!.column_mapping!)).toEqual({
      firstName: "First Name",
      email: "Email",
    });
  });

  it("updates status and sets completed_at only for terminal statuses", async () => {
    const created = await importsRepo.createImport({
      fileName: "sample.csv",
      fileType: "csv",
    });

    await importsRepo.updateImportStatus(created.id, "processing", "job-1");
    let fetched = await importsRepo.getImport(created.id);
    expect(fetched?.status).toBe("processing");
    expect(fetched?.job_id).toBe("job-1");
    expect(fetched?.completed_at).toBeNull();

    await importsRepo.updateImportStatus(created.id, "completed");
    fetched = await importsRepo.getImport(created.id);
    expect(fetched?.status).toBe("completed");
    expect(fetched?.completed_at).not.toBeNull();
    // job_id preserved via COALESCE when not passed again
    expect(fetched?.job_id).toBe("job-1");
  });

  it("lists imports most-recent-first", async () => {
    const first = await importsRepo.createImport({
      fileName: "a.csv",
      fileType: "csv",
    });
    // Guarantee a distinct created_at (ms resolution) so DESC ordering is deterministic.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await importsRepo.createImport({
      fileName: "b.csv",
      fileType: "csv",
    });

    // The local db file persists across every test run (unlike an in-memory
    // db), so import_history accumulates indefinitely across sessions — a
    // small LIMIT window can miss this test's own rows entirely once enough
    // history piles up. Use a limit generous enough to always include them.
    const list = await importsRepo.listImports(1000);
    const ids = list.map((i) => i.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });
});
