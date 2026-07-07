import { describe, expect, it } from "vitest";
import { extractFromFullName } from "../../core/extraction/full-name-parser";

describe("extractFromFullName", () => {
  it("returns null when there is no full name", () => {
    expect(extractFromFullName({})).toBeNull();
  });

  it("splits a two-token name into first/last with full confidence", () => {
    const candidate = extractFromFullName({ fullName: "Jane Doe" });
    expect(candidate).toMatchObject({
      source: "full_name",
      firstName: "Jane",
      lastName: "Doe",
      confidence: 100,
    });
  });

  it("treats a single token as first-name-only", () => {
    const candidate = extractFromFullName({ fullName: "Madonna" });
    expect(candidate).toMatchObject({ firstName: "Madonna" });
    expect(candidate?.lastName).toBeUndefined();
  });

  it("drops middle tokens on 3+ word names and flags them", () => {
    const candidate = extractFromFullName({ fullName: "Mary Jane Watson" });
    expect(candidate).toMatchObject({
      firstName: "Mary",
      lastName: "Watson",
    });
    expect(candidate?.meta?.droppedMiddleTokens).toEqual(["Jane"]);
  });
});
