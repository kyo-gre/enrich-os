import { describe, expect, it } from "vitest";
import { extractFromUsername } from "../../core/extraction/username-name-parser";

describe("extractFromUsername", () => {
  it("returns null when there is no username", () => {
    expect(extractFromUsername({})).toBeNull();
  });

  it("splits a concatenated handle at a known first-name prefix", () => {
    const result = extractFromUsername({ username: "kaylaprincipato" });
    expect(result?.firstName).toBe("Kayla");
    expect(result?.lastName).toBe("Principato");
    expect(result?.source).toBe("username");
  });

  it("splits another concatenated handle the same way", () => {
    const result = extractFromUsername({ username: "michelleaduvall" });
    expect(result?.firstName).toBe("Michelle");
    expect(result?.lastName).toBe("Aduvall");
  });

  /**
   * "hailyeah" isn't in the name dictionary, so even after stripping the
   * descriptor there's no real confirmation it's a name — this is the exact
   * case the @handle fallback exists for. When a real scrape is available it
   * usually wins this row anyway (see profile-adapters.test.ts); this is
   * only what the username candidate looks like on its own.
   */
  it("falls back to @handle when a descriptor is stripped but no name is confirmed", () => {
    const result = extractFromUsername({ username: "hailyeahpilates" });
    expect(result?.firstName).toBe("@hailyeahpilates");
    expect(result?.meta?.isHandleFallback).toBe(true);
  });

  it("falls back to @handle for another unconfirmed descriptor-suffixed handle", () => {
    const result = extractFromUsername({ username: "juliannepilates" });
    expect(result?.firstName).toBe("@juliannepilates");
  });

  it("falls back to @handle when no split point is found at all", () => {
    const result = extractFromUsername({ username: "blevwanders" });
    expect(result?.firstName).toBe("@blevwanders");
    expect(result?.lastName).toBeUndefined();
    expect(result?.meta?.isHandleFallback).toBe(true);
  });

  it("splits a delimited handle into first/last directly", () => {
    const result = extractFromUsername({ username: "jane.doe" });
    expect(result?.firstName).toBe("Jane");
    expect(result?.lastName).toBe("Doe");
  });

  it("uses a lower confidence than email or a real scrape", () => {
    const result = extractFromUsername({ username: "kaylaprincipato" });
    expect(result?.confidence).toBe(60);
  });
});
