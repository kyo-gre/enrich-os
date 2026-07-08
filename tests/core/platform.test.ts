import { describe, expect, it } from "vitest";
import { classifyProfileUrl } from "../../core/profiles/fetcher/platform";

describe("classifyProfileUrl", () => {
  it("classifies instagram.com URLs", () => {
    expect(classifyProfileUrl("https://www.instagram.com/janedoe/")).toBe(
      "instagram",
    );
  });

  it("classifies tiktok.com URLs", () => {
    expect(classifyProfileUrl("https://www.tiktok.com/@janedoe")).toBe(
      "tiktok",
    );
  });

  it("classifies facebook.com URLs", () => {
    expect(classifyProfileUrl("https://www.facebook.com/janedoe")).toBe(
      "facebook",
    );
  });

  it("classifies youtube.com and youtu.be URLs", () => {
    expect(classifyProfileUrl("https://www.youtube.com/@janedoe")).toBe(
      "youtube",
    );
    expect(classifyProfileUrl("https://youtu.be/abc123")).toBe("youtube");
  });

  it("falls back to generic for other hosts", () => {
    expect(classifyProfileUrl("https://linktr.ee/janedoe")).toBe("generic");
  });

  it("falls back to generic for unparsable input", () => {
    expect(classifyProfileUrl("not a url")).toBe("generic");
  });

  it("falls back to generic when undefined", () => {
    expect(classifyProfileUrl(undefined)).toBe("generic");
  });
});
