import { describe, expect, it } from "vitest";
import { findDuplicateGroups } from "../../core/dedupe/find-duplicate-groups";

describe("findDuplicateGroups", () => {
  it("flags an exact email match", () => {
    const groups = findDuplicateGroups([
      { id: "a", email: "Jane@Example.com" },
      { id: "b", email: "jane@example.com" },
    ]);
    expect(groups).toEqual([
      { keyType: "email", keyValue: "jane@example.com", creatorIds: ["a", "b"] },
    ]);
  });

  it("flags an exact username match", () => {
    const groups = findDuplicateGroups([
      { id: "a", username: "@JennV" },
      { id: "b", username: "jennv" },
    ]);
    expect(groups).toEqual([
      { keyType: "username", keyValue: "jennv", creatorIds: ["a", "b"] },
    ]);
  });

  it("flags an exact profile URL match", () => {
    const groups = findDuplicateGroups([
      { id: "a", profileUrl: "https://www.instagram.com/jennv/" },
      { id: "b", profileUrl: "http://instagram.com/jennv" },
    ]);
    expect(groups).toEqual([
      {
        keyType: "profile_url",
        keyValue: "instagram.com/jennv",
        creatorIds: ["a", "b"],
      },
    ]);
  });

  it("does not flag similar-but-not-identical names as duplicates (no fuzzy matching)", () => {
    // "John D." / "John Doe" / "Johnny" are the explicitly rejected fuzzy
    // case — findDuplicateGroups has no name-based matching at all, so
    // records with only names (no shared email/username/url) are never
    // grouped, no matter how similar.
    const groups = findDuplicateGroups([
      { id: "a" },
      { id: "b" },
    ]);
    expect(groups).toEqual([]);
  });

  it("does not flag records that only partially share unrelated keys", () => {
    const groups = findDuplicateGroups([
      { id: "a", email: "a@example.com", username: "alice" },
      { id: "b", email: "b@example.com", username: "bob" },
    ]);
    expect(groups).toEqual([]);
  });

  it("can produce multiple groups across different key types", () => {
    const groups = findDuplicateGroups([
      { id: "a", email: "shared@example.com" },
      { id: "b", email: "shared@example.com" },
      { id: "c", username: "shared-handle" },
      { id: "d", username: "shared-handle" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.keyType).sort()).toEqual(["email", "username"]);
  });

  it("groups three or more records sharing the same key", () => {
    const groups = findDuplicateGroups([
      { id: "a", email: "x@example.com" },
      { id: "b", email: "x@example.com" },
      { id: "c", email: "x@example.com" },
    ]);
    expect(groups).toEqual([
      { keyType: "email", keyValue: "x@example.com", creatorIds: ["a", "b", "c"] },
    ]);
  });
});
