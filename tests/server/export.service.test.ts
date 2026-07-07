import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CreatorRow } from "../../server/db/repositories/creators.repo";

vi.mock("../../server/db/repositories/creators.repo", () => ({
  listCreatorsByImport: vi.fn(),
}));

vi.mock("../../server/db/repositories/exports.repo", () => ({
  recordExport: vi.fn(),
}));

const creatorsRepo = await import("../../server/db/repositories/creators.repo");
const exportsRepo = await import("../../server/db/repositories/exports.repo");
const { exportCreators } = await import("../../server/services/export.service");

const listCreatorsByImport = vi.mocked(creatorsRepo.listCreatorsByImport);
const recordExport = vi.mocked(exportsRepo.recordExport);

function makeCreator(overrides: Partial<CreatorRow> = {}): CreatorRow {
  return {
    id: "creator-1",
    import_id: "import-1",
    row_index: 0,
    raw_full_name: null,
    raw_username: null,
    raw_email: null,
    raw_profile_url: null,
    raw_platform: null,
    raw_payload: null,
    resolved_first_name: "Jane",
    resolved_last_name: "Doe",
    resolved_display_name: null,
    resolved_platform: null,
    resolved_profile_url: null,
    resolved_email: "jane@example.com",
    resolved_social_handle: "janedoe",
    confidence_score: 95,
    confidence_source: "email",
    processing_status: "enriched",
    pipeline_version: "1.0.0",
    needs_review: 0,
    review_status: "pending",
    notes: null,
    identity_cache_id: null,
    duplicate_of_creator_id: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

beforeEach(() => {
  listCreatorsByImport.mockReset();
  recordExport.mockReset();
});

describe("exportCreators", () => {
  it("produces a quick export with only firstName/email/socialHandle columns", () => {
    listCreatorsByImport.mockReturnValueOnce([makeCreator()]);
    const result = exportCreators("import-1", "quick");
    expect(result.csv).toContain("firstName,email,socialHandle");
    expect(result.csv).toContain("Jane,jane@example.com,janedoe");
    expect(result.rowCount).toBe(1);
  });

  it("produces a full export including confidence, status, review state, and pipeline version", () => {
    listCreatorsByImport.mockReturnValueOnce([makeCreator()]);
    const result = exportCreators("import-1", "full");
    expect(result.csv).toContain("confidenceScore");
    expect(result.csv).toContain("processingStatus");
    expect(result.csv).toContain("reviewStatus");
    expect(result.csv).toContain("pipelineVersion");
    expect(result.csv).toContain("exportedAt");
    expect(result.csv).toContain("enriched");
  });

  it("excludes ignored records", () => {
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "kept", review_status: "pending" }),
      makeCreator({ id: "dropped", review_status: "ignored" }),
    ]);
    const result = exportCreators("import-1", "quick");
    expect(result.rowCount).toBe(1);
  });

  it("excludes creators that are duplicates of another record", () => {
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "kept" }),
      makeCreator({ id: "dropped", duplicate_of_creator_id: "kept" }),
    ]);
    const result = exportCreators("import-1", "quick");
    expect(result.rowCount).toBe(1);
  });

  it("does NOT exclude a record merely flagged as a duplicate candidate — only confirmed merges", () => {
    // duplicate_of_creator_id is only ever set by mergeDuplicateCreators
    // (a human confirming a merge). findDuplicateCandidates never writes
    // it, so a record that's a duplicate *candidate* but hasn't been
    // merged yet still has duplicate_of_creator_id === null and must
    // still export normally.
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "a", duplicate_of_creator_id: null }),
      makeCreator({ id: "b", duplicate_of_creator_id: null }),
    ]);
    const result = exportCreators("import-1", "quick");
    expect(result.rowCount).toBe(2);
  });

  it("records the export in export_history", () => {
    listCreatorsByImport.mockReturnValueOnce([makeCreator()]);
    exportCreators("import-1", "full");
    expect(recordExport).toHaveBeenCalledWith(
      expect.objectContaining({ importId: "import-1", exportType: "full", rowCount: 1 }),
    );
  });
});
