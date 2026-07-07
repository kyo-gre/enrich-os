import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedIdentity, NormalizedCreator } from "../../shared/types";

vi.mock("../../server/db/repositories/identity-cache.repo", () => ({
  findIdentityByKey: vi.fn(),
  createIdentityCache: vi.fn(),
  addIdentityCacheKey: vi.fn(),
}));

const repo = await import("../../server/db/repositories/identity-cache.repo");
const { lookupCachedIdentity, upsertIdentityCache } = await import(
  "../../server/services/identity-cache.service"
);

const findIdentityByKey = vi.mocked(repo.findIdentityByKey);
const createIdentityCache = vi.mocked(repo.createIdentityCache);
const addIdentityCacheKey = vi.mocked(repo.addIdentityCacheKey);

beforeEach(() => {
  findIdentityByKey.mockReset();
  createIdentityCache.mockReset();
  addIdentityCacheKey.mockReset();
});

describe("lookupCachedIdentity", () => {
  it("checks every available key, not just the first that hits", () => {
    findIdentityByKey.mockReturnValueOnce({ id: "cached-1" } as never); // email

    const normalized: NormalizedCreator = {
      email: "Mia.Shpirer@Gmail.com",
      username: "mia",
      profileUrl: "https://instagram.com/mia",
    };
    const result = lookupCachedIdentity(normalized);

    expect(result).toEqual({ status: "hit", identity: { id: "cached-1" } });
    // All three keys still get checked, even though email already hit —
    // that's what lets a divergent match on another key be detected.
    expect(findIdentityByKey).toHaveBeenCalledTimes(3);
  });

  it("returns a miss when no key matches anything", () => {
    findIdentityByKey.mockReturnValue(undefined);
    const normalized: NormalizedCreator = { email: "a@b.com", username: "mia" };
    expect(lookupCachedIdentity(normalized)).toEqual({ status: "miss" });
  });

  it("returns miss when there is nothing to look up", () => {
    const result = lookupCachedIdentity({});
    expect(result).toEqual({ status: "miss" });
    expect(findIdentityByKey).not.toHaveBeenCalled();
  });

  it("flags a conflict when different keys match different cached identities", () => {
    findIdentityByKey.mockImplementation((keyType) =>
      (keyType === "email"
        ? { id: "identity-a" }
        : keyType === "username"
          ? { id: "identity-b" }
          : undefined) as never,
    );

    const normalized: NormalizedCreator = {
      email: "a@b.com",
      username: "mia",
    };
    const result = lookupCachedIdentity(normalized);

    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.identities.map((i) => i.id).sort()).toEqual([
        "identity-a",
        "identity-b",
      ]);
    }
  });

  it("does not report a conflict when two keys agree on the same identity", () => {
    findIdentityByKey.mockReturnValue({ id: "same-identity" } as never);
    const normalized: NormalizedCreator = { email: "a@b.com", username: "mia" };
    expect(lookupCachedIdentity(normalized)).toEqual({
      status: "hit",
      identity: { id: "same-identity" },
    });
  });
});

describe("upsertIdentityCache", () => {
  const baseResolved: ResolvedIdentity = {
    firstName: "Mia",
    lastName: "Shpirer",
    confidenceScore: 95,
    confidenceSource: "email",
    processingStatus: "enriched",
    pipelineVersion: "1.0.0",
    needsReview: false,
  };

  it("does not cache results that need review or failed", () => {
    upsertIdentityCache(
      { ...baseResolved, processingStatus: "needs_review", needsReview: true },
      {},
    );
    upsertIdentityCache({ ...baseResolved, processingStatus: "failed" }, {});
    expect(createIdentityCache).not.toHaveBeenCalled();
    expect(findIdentityByKey).not.toHaveBeenCalled();
  });

  it("does not cache a result with no identity keys at all", () => {
    const result = upsertIdentityCache(baseResolved, {});
    expect(result).toBeUndefined();
    expect(createIdentityCache).not.toHaveBeenCalled();
  });

  it("creates a new cache entry when no existing key matches", () => {
    findIdentityByKey.mockReturnValue(undefined);
    createIdentityCache.mockReturnValueOnce({ id: "new-1" } as never);

    const resolved: ResolvedIdentity = { ...baseResolved, email: "a@b.com" };
    const result = upsertIdentityCache(resolved, {});

    expect(createIdentityCache).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Mia",
        lastName: "Shpirer",
        email: "a@b.com",
        confidenceScore: 95,
        confidenceSource: "email",
        keys: [{ keyType: "email", keyValue: "a@b.com" }],
      }),
    );
    expect(result).toEqual({ id: "new-1" });
  });

  it("reuses an existing cache entry and adds missing keys instead of overwriting it", () => {
    findIdentityByKey.mockReturnValue({ id: "existing-1" } as never);

    const resolved: ResolvedIdentity = {
      ...baseResolved,
      email: "a@b.com",
      socialHandle: "mia",
    };
    const result = upsertIdentityCache(resolved, {});

    expect(createIdentityCache).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "existing-1" });
    expect(addIdentityCacheKey).toHaveBeenCalledWith(
      "existing-1",
      "email",
      "a@b.com",
    );
    expect(addIdentityCacheKey).toHaveBeenCalledWith(
      "existing-1",
      "username",
      "mia",
    );
  });

  it("falls back to normalized input fields when resolved doesn't carry them", () => {
    findIdentityByKey.mockReturnValue(undefined);
    createIdentityCache.mockReturnValueOnce({ id: "new-2" } as never);

    upsertIdentityCache(baseResolved, {
      email: "fallback@b.com",
      username: "fallbackuser",
      profileUrl: "https://tiktok.com/@fallbackuser",
    });

    expect(createIdentityCache).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "fallback@b.com",
        socialHandle: "fallbackuser",
        profileUrl: "https://tiktok.com/@fallbackuser",
      }),
    );
  });

  it("skips the write when the record's keys point to more than one existing identity", () => {
    findIdentityByKey.mockImplementation((keyType) =>
      (keyType === "email"
        ? { id: "identity-a" }
        : keyType === "username"
          ? { id: "identity-b" }
          : undefined) as never,
    );

    const resolved: ResolvedIdentity = {
      ...baseResolved,
      email: "a@b.com",
      socialHandle: "mia",
    };
    const result = upsertIdentityCache(resolved, {});

    expect(result).toBeUndefined();
    expect(createIdentityCache).not.toHaveBeenCalled();
    expect(addIdentityCacheKey).not.toHaveBeenCalled();
  });
});
