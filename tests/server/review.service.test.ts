import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CreatorRow } from "../../server/db/repositories/creators.repo";

vi.mock("../../server/db/repositories/creators.repo", () => ({
  getCreator: vi.fn(),
  applyResolvedIdentity: vi.fn(),
  setReviewStatus: vi.fn(),
  markDuplicateOf: vi.fn(),
  clearDuplicateOf: vi.fn(),
}));

vi.mock("../../server/db/repositories/identity-cache.repo", () => ({
  applyManualOverride: vi.fn(),
  createIdentityCache: vi.fn(),
}));

vi.mock("../../server/db/repositories/processing-logs.repo", () => ({
  addProcessingLog: vi.fn(),
  listProcessingLogsForCreator: vi.fn(),
}));

const creatorsRepo = await import("../../server/db/repositories/creators.repo");
const identityCacheRepo = await import(
  "../../server/db/repositories/identity-cache.repo"
);
const processingLogsRepo = await import(
  "../../server/db/repositories/processing-logs.repo"
);
const {
  approveCreator,
  ignoreCreator,
  applyCreatorOverride,
  mergeDuplicateCreators,
  unmergeCreator,
} = await import("../../server/services/review.service");

const getCreator = vi.mocked(creatorsRepo.getCreator);
const applyResolvedIdentity = vi.mocked(creatorsRepo.applyResolvedIdentity);
const setReviewStatus = vi.mocked(creatorsRepo.setReviewStatus);
const markDuplicateOf = vi.mocked(creatorsRepo.markDuplicateOf);
const clearDuplicateOf = vi.mocked(creatorsRepo.clearDuplicateOf);
const applyManualOverride = vi.mocked(identityCacheRepo.applyManualOverride);
const createIdentityCache = vi.mocked(identityCacheRepo.createIdentityCache);
const listProcessingLogsForCreator = vi.mocked(
  processingLogsRepo.listProcessingLogsForCreator,
);

function makeCreator(overrides: Partial<CreatorRow> = {}): CreatorRow {
  return {
    id: "creator-1",
    import_id: "import-1",
    row_index: 0,
    raw_full_name: null,
    raw_username: null,
    raw_email: "jane@example.com",
    raw_profile_url: null,
    raw_platform: null,
    raw_payload: null,
    resolved_first_name: "Jane",
    resolved_last_name: "Doe",
    resolved_display_name: null,
    resolved_platform: null,
    resolved_profile_url: null,
    resolved_email: "jane@example.com",
    resolved_social_handle: null,
    confidence_score: 60,
    confidence_source: "username",
    processing_status: "needs_review",
    pipeline_version: "1.0.0",
    needs_review: 1,
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
  getCreator.mockReset();
  applyResolvedIdentity.mockReset();
  setReviewStatus.mockReset();
  markDuplicateOf.mockReset();
  clearDuplicateOf.mockReset();
  applyManualOverride.mockReset();
  createIdentityCache.mockReset();
  listProcessingLogsForCreator.mockReset();
});

describe("approveCreator / ignoreCreator", () => {
  it("sets the review status and logs it", () => {
    approveCreator("creator-1");
    expect(setReviewStatus).toHaveBeenCalledWith("creator-1", "approved");

    ignoreCreator("creator-1");
    expect(setReviewStatus).toHaveBeenCalledWith("creator-1", "ignored");
  });
});

describe("applyCreatorOverride", () => {
  it("throws when the creator doesn't exist", () => {
    getCreator.mockReturnValueOnce(undefined);
    expect(() => applyCreatorOverride("missing", "firstName", "Jane")).toThrow(
      "Creator not found",
    );
  });

  it("creates a fallback identity_cache entry when the creator was never cached", () => {
    getCreator.mockReturnValue(makeCreator({ identity_cache_id: null }));
    createIdentityCache.mockReturnValueOnce({ id: "new-cache-1" } as never);

    applyCreatorOverride("creator-1", "firstName", "Janet", "typo fix");

    expect(createIdentityCache).toHaveBeenCalledTimes(1);
    expect(applyManualOverride).toHaveBeenCalledWith(
      "new-cache-1",
      "firstName",
      "Jane",
      "Janet",
      "typo fix",
    );
  });

  it("reuses the existing identity_cache entry when the creator already has one", () => {
    getCreator.mockReturnValue(makeCreator({ identity_cache_id: "cache-existing" }));

    applyCreatorOverride("creator-1", "lastName", "Smith");

    expect(createIdentityCache).not.toHaveBeenCalled();
    expect(applyManualOverride).toHaveBeenCalledWith(
      "cache-existing",
      "lastName",
      "Doe",
      "Smith",
      undefined,
    );
  });

  it("marks the override as manual_override with full confidence and clears needsReview", () => {
    getCreator.mockReturnValue(makeCreator({ identity_cache_id: "cache-1" }));

    applyCreatorOverride("creator-1", "firstName", "Janet");

    expect(applyResolvedIdentity).toHaveBeenCalledWith(
      "creator-1",
      expect.objectContaining({
        resolvedFirstName: "Janet",
        resolvedLastName: "Doe", // untouched field preserved
        confidenceScore: 100,
        confidenceSource: "manual_override",
        processingStatus: "enriched",
        needsReview: false,
        identityCacheId: "cache-1",
      }),
    );
    expect(setReviewStatus).toHaveBeenCalledWith("creator-1", "approved");
  });
});

describe("mergeDuplicateCreators", () => {
  it("throws when merging a creator into itself", () => {
    expect(() => mergeDuplicateCreators("a", "a")).toThrow(
      "Cannot merge a creator into itself",
    );
  });

  it("throws when the source doesn't exist", () => {
    getCreator.mockReturnValueOnce(undefined); // source lookup
    expect(() => mergeDuplicateCreators("a", "b")).toThrow("Creator not found");
  });

  it("throws when the target doesn't exist", () => {
    getCreator.mockReturnValueOnce(makeCreator({ id: "a" })); // source lookup
    getCreator.mockReturnValueOnce(undefined); // target lookup
    expect(() => mergeDuplicateCreators("a", "b")).toThrow(
      "Target creator not found",
    );
  });

  it("marks the source as a duplicate and adopts the target's resolved identity", () => {
    getCreator.mockReturnValueOnce(
      makeCreator({ id: "source-1", resolved_first_name: "Jane" }),
    );
    getCreator.mockReturnValueOnce(
      makeCreator({
        id: "target-1",
        resolved_first_name: "Target",
        processing_status: "enriched",
      }),
    );

    mergeDuplicateCreators("source-1", "target-1");

    expect(markDuplicateOf).toHaveBeenCalledWith("source-1", "target-1");
    expect(applyResolvedIdentity).toHaveBeenCalledWith(
      "source-1",
      expect.objectContaining({
        resolvedFirstName: "Target",
        needsReview: false,
      }),
    );
    expect(setReviewStatus).toHaveBeenCalledWith("source-1", "approved");
  });

  it("records a pre-merge snapshot of the source so the merge can be undone", () => {
    getCreator.mockReturnValueOnce(
      makeCreator({
        id: "source-1",
        resolved_first_name: "Jane",
        resolved_last_name: "Doe",
        confidence_score: 60,
        confidence_source: "username",
        processing_status: "needs_review",
        needs_review: 1,
        review_status: "pending",
      }),
    );
    getCreator.mockReturnValueOnce(makeCreator({ id: "target-1" }));

    mergeDuplicateCreators("source-1", "target-1");

    const { addProcessingLog } = processingLogsRepo;
    expect(addProcessingLog).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: "source-1",
        step: "merged_duplicate",
        detail: expect.objectContaining({
          targetCreatorId: "target-1",
          preMergeSnapshot: expect.objectContaining({
            resolvedFirstName: "Jane",
            resolvedLastName: "Doe",
            confidenceScore: 60,
            confidenceSource: "username",
            processingStatus: "needs_review",
            needsReview: true,
            reviewStatus: "pending",
          }),
        }),
      }),
    );
  });
});

describe("unmergeCreator", () => {
  it("throws when the creator doesn't exist", () => {
    getCreator.mockReturnValueOnce(undefined);
    expect(() => unmergeCreator("missing")).toThrow("Creator not found");
  });

  it("throws when the creator isn't marked as a duplicate", () => {
    getCreator.mockReturnValueOnce(makeCreator({ duplicate_of_creator_id: null }));
    expect(() => unmergeCreator("creator-1")).toThrow(
      "not marked as a duplicate",
    );
  });

  it("throws when no merge snapshot can be found", () => {
    getCreator.mockReturnValueOnce(
      makeCreator({ duplicate_of_creator_id: "target-1" }),
    );
    listProcessingLogsForCreator.mockReturnValueOnce([]);
    expect(() => unmergeCreator("creator-1")).toThrow("No merge snapshot found");
  });

  it("restores the pre-merge snapshot and clears the duplicate link", () => {
    getCreator.mockReturnValue(
      makeCreator({ id: "creator-1", duplicate_of_creator_id: "target-1" }),
    );
    listProcessingLogsForCreator.mockReturnValueOnce([
      {
        id: "log-1",
        creator_id: "creator-1",
        job_id: null,
        step: "merged_duplicate",
        status: "success",
        detail: JSON.stringify({
          targetCreatorId: "target-1",
          preMergeSnapshot: {
            resolvedFirstName: "Jane",
            confidenceScore: 60,
            confidenceSource: "username",
            processingStatus: "needs_review",
            pipelineVersion: "1.0.0",
            needsReview: true,
            reviewStatus: "pending",
          },
        }),
        created_at: 1,
      },
    ]);

    unmergeCreator("creator-1");

    expect(clearDuplicateOf).toHaveBeenCalledWith("creator-1");
    expect(applyResolvedIdentity).toHaveBeenCalledWith(
      "creator-1",
      expect.objectContaining({
        resolvedFirstName: "Jane",
        confidenceScore: 60,
        confidenceSource: "username",
        processingStatus: "needs_review",
        needsReview: true,
      }),
    );
    expect(setReviewStatus).toHaveBeenCalledWith("creator-1", "pending");
  });

  it("uses the most recent merge snapshot when there are multiple merge log entries", () => {
    getCreator.mockReturnValue(
      makeCreator({ id: "creator-1", duplicate_of_creator_id: "target-2" }),
    );
    listProcessingLogsForCreator.mockReturnValueOnce([
      {
        id: "log-old",
        creator_id: "creator-1",
        job_id: null,
        step: "merged_duplicate",
        status: "success",
        detail: JSON.stringify({
          targetCreatorId: "target-1",
          preMergeSnapshot: { resolvedFirstName: "Old", confidenceScore: 10, processingStatus: "failed", pipelineVersion: "1.0.0", needsReview: true, reviewStatus: "pending" },
        }),
        created_at: 1,
      },
      {
        id: "log-new",
        creator_id: "creator-1",
        job_id: null,
        step: "merged_duplicate",
        status: "success",
        detail: JSON.stringify({
          targetCreatorId: "target-2",
          preMergeSnapshot: { resolvedFirstName: "New", confidenceScore: 20, processingStatus: "failed", pipelineVersion: "1.0.0", needsReview: true, reviewStatus: "pending" },
        }),
        created_at: 2,
      },
    ]);

    unmergeCreator("creator-1");

    expect(applyResolvedIdentity).toHaveBeenCalledWith(
      "creator-1",
      expect.objectContaining({ resolvedFirstName: "New" }),
    );
  });
});
