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

  it("folds decorative 'fancy font' Unicode down to plain letters", () => {
    const result = normalizeCreator({
      rawFullName: "\u{1D4A5}\u{1D4CA}\u{1D4C1}\u{1D4BE}\u{1D4B6}\u{1D4C3}\u{1D4C3}\u{1D452}",
      raw: {},
    });
    expect(result.fullName).toBe("Julianne");
  });

  it("title-cases an ALL-CAPS name", () => {
    const result = normalizeCreator({ rawFullName: "BLEV", raw: {} });
    expect(result.fullName).toBe("Blev");
  });

  it("title-cases an all-lowercase name", () => {
    const result = normalizeCreator({ rawFullName: "hailyeah", raw: {} });
    expect(result.fullName).toBe("Hailyeah");
  });

  it("leaves already mixed-case names untouched", () => {
    const result = normalizeCreator({ rawFullName: "McDonald", raw: {} });
    expect(result.fullName).toBe("McDonald");
  });
});
