import { describe, expect, it } from "vitest";
import {
  buildIdentityKeys,
  canonicalizeEmail,
  canonicalizeProfileUrl,
  canonicalizeUsername,
} from "../../core/dedupe/canonicalize-key";

describe("canonicalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(canonicalizeEmail("  Mia.Shpirer@Gmail.com ")).toBe(
      "mia.shpirer@gmail.com",
    );
  });
});

describe("canonicalizeUsername", () => {
  it("trims, lowercases, and strips a leading @", () => {
    expect(canonicalizeUsername("@JennV")).toBe("jennv");
  });
});

describe("canonicalizeProfileUrl", () => {
  it("strips protocol, www, and trailing slash, and lowercases", () => {
    expect(canonicalizeProfileUrl("https://WWW.Instagram.com/JennV/")).toBe(
      "instagram.com/jennv",
    );
  });

  it("treats http and https the same host+path as equal", () => {
    expect(canonicalizeProfileUrl("http://instagram.com/jennv")).toBe(
      canonicalizeProfileUrl("https://www.instagram.com/jennv/"),
    );
  });

  it("falls back to a plain lowercase/trim for unparsable input", () => {
    expect(canonicalizeProfileUrl("  @jennv/ ")).toBe("@jennv");
  });
});

describe("buildIdentityKeys", () => {
  it("only includes keys for fields that are present", () => {
    expect(buildIdentityKeys({ email: "a@b.com" })).toEqual([
      { keyType: "email", keyValue: "a@b.com" },
    ]);
  });

  it("builds all three keys when all fields are present", () => {
    const keys = buildIdentityKeys({
      email: "A@B.com",
      username: "@Jenn",
      profileUrl: "https://www.instagram.com/jenn/",
    });
    expect(keys).toEqual([
      { keyType: "email", keyValue: "a@b.com" },
      { keyType: "username", keyValue: "jenn" },
      { keyType: "profile_url", keyValue: "instagram.com/jenn" },
    ]);
  });

  it("returns an empty array when nothing is present", () => {
    expect(buildIdentityKeys({})).toEqual([]);
  });
});
