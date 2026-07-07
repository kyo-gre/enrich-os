import { describe, expect, it } from "vitest";
import { normalizeCreator } from "../../core/normalization/normalize";

describe("normalizeCreator", () => {
  it("strips emoji, collapses whitespace, and removes creator descriptors", () => {
    const result = normalizeCreator({
      rawFullName: "Jane   Doe 🌟 | Lifestyle Creator",
      raw: {},
    });
    expect(result.fullName).toBe("Jane Doe");
  });

  it("collapses repeated punctuation", () => {
    const result = normalizeCreator({
      rawFullName: "John////Smith -- CEO",
      raw: {},
    });
    expect(result.fullName).toBe("John/Smith");
  });

  it("strips descriptors regardless of separator style", () => {
    const result = normalizeCreator({
      rawFullName: "Alex Rivera, Founder",
      raw: {},
    });
    expect(result.fullName).toBe("Alex Rivera");
  });

  it("lowercases email and strips leading @ from username", () => {
    const result = normalizeCreator({
      rawEmail: "  Mia.Shpirer@Gmail.com ",
      rawUsername: "@mia.shpirer",
      raw: {},
    });
    expect(result.email).toBe("mia.shpirer@gmail.com");
    expect(result.username).toBe("mia.shpirer");
  });

  it("returns an empty object when no raw fields are present", () => {
    const result = normalizeCreator({ raw: {} });
    expect(result).toEqual({});
  });
});
