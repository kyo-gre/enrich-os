import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CreatorRow } from "../../server/db/repositories/creators.repo";

vi.mock("../../server/db/repositories/creators.repo", () => ({
  listCreatorsByImport: vi.fn(),
}));

const creatorsRepo = await import("../../server/db/repositories/creators.repo");
const { findDuplicateCandidates } = await import(
  "../../server/services/dedupe.service"
);

const listCreatorsByImport = vi.mocked(creatorsRepo.listCreatorsByImport);

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
    resolved_first_name: null,
    resolved_last_name: null,
    resolved_display_name: null,
    resolved_platform: null,
    resolved_profile_url: null,
    resolved_email: null,
    resolved_social_handle: null,
    confidence_score: null,
    confidence_source: null,
    processing_status: "failed",
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
});

describe("findDuplicateCandidates", () => {
  it("flags two creators in the same import sharing an email", () => {
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "a", resolved_first_name: "Jane", resolved_email: "jane@example.com" }),
      makeCreator({ id: "b", resolved_first_name: "J.", resolved_email: "jane@example.com" }),
    ]);

    const groups = findDuplicateCandidates("import-1");

    expect(groups).toHaveLength(1);
    expect(groups[0].keyType).toBe("email");
    expect(groups[0].creators.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("falls back to raw fields when resolved fields are missing", () => {
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "a", raw_username: "@jenn" }),
      makeCreator({ id: "b", raw_username: "jenn" }),
    ]);

    const groups = findDuplicateCandidates("import-1");
    expect(groups).toHaveLength(1);
    expect(groups[0].keyType).toBe("username");
  });

  it("excludes creators already marked as a duplicate of another", () => {
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "a", resolved_email: "jane@example.com" }),
      makeCreator({
        id: "b",
        resolved_email: "jane@example.com",
        duplicate_of_creator_id: "a",
      }),
      makeCreator({ id: "c", resolved_email: "jane@example.com" }),
    ]);

    const groups = findDuplicateCandidates("import-1");

    // "b" already resolved via a prior merge — only "a" and "c" remain
    // as unresolved candidates for the same email.
    expect(groups).toHaveLength(1);
    expect(groups[0].creators.map((c) => c.id).sort()).toEqual(["a", "c"]);
  });

  it("does not flag records with no shared keys, even with similar names", () => {
    listCreatorsByImport.mockReturnValueOnce([
      makeCreator({ id: "a", resolved_first_name: "John", resolved_last_name: "Doe" }),
      makeCreator({ id: "b", resolved_first_name: "Johnny" }),
    ]);

    expect(findDuplicateCandidates("import-1")).toEqual([]);
  });
});
