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

  it("strips a business descriptor suffix even with no delimiter", () => {
    const result = extractFromUsername({ username: "hailyeahpilates" });
    expect(result?.firstName).toBe("Hailyeah");
    expect(result?.lastName).toBeUndefined();
  });

  it("strips a descriptor suffix and still finds a clean single name", () => {
    const result = extractFromUsername({ username: "juliannepilates" });
    expect(result?.firstName).toBe("Julianne");
  });

  it("falls back to the whole cleaned handle when no split point is found", () => {
    const result = extractFromUsername({ username: "blevwanders" });
    expect(result?.firstName).toBe("Blevwanders");
    expect(result?.lastName).toBeUndefined();
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
