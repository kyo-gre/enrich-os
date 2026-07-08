import { describe, expect, it } from "vitest";
import { extractFromEmail } from "../../core/extraction/email-name-parser";

describe("extractFromEmail — worked examples", () => {
  it("mia.shpirer@gmail.com -> Mia Shpirer (first.last, mia is the common name)", () => {
    const candidate = extractFromEmail({ email: "mia.shpirer@gmail.com" });
    expect(candidate).toMatchObject({
      source: "email",
      firstName: "mia",
      lastName: "shpirer",
      email: "mia.shpirer@gmail.com",
      confidence: 95,
    });
    expect(candidate?.meta?.ambiguous).toBe(false);
  });

  // "Robertson" is itself a rare-but-real recognized first name in the
  // expanded name dictionary, so this is genuinely ambiguous (both tokens
  // could be the first name) rather than a confident first.last — the
  // resulting names are unaffected, only the confidence/review flag is.
  it("bonnie.robertson13@gmail.com -> Bonnie Robertson (trailing digits stripped)", () => {
    const candidate = extractFromEmail({
      email: "bonnie.robertson13@gmail.com",
    });
    expect(candidate).toMatchObject({
      firstName: "bonnie",
      lastName: "robertson",
      confidence: 80,
    });
  });

  it("vasquez.jennifer94@yahoo.com -> Jennifer Vasquez (last.first order detected)", () => {
    const candidate = extractFromEmail({
      email: "vasquez.jennifer94@yahoo.com",
    });
    expect(candidate).toMatchObject({
      firstName: "jennifer",
      lastName: "vasquez",
      confidence: 95,
    });
    expect(candidate?.meta?.orderDetection).toBe("last_first");
  });
});

describe("extractFromEmail — ambiguous and edge cases", () => {
  it("returns null when there is no email", () => {
    expect(extractFromEmail({})).toBeNull();
  });

  it("defaults to first.last with a confidence penalty when neither token is a common name", () => {
    const candidate = extractFromEmail({ email: "shpirer.vasquez@gmail.com" });
    expect(candidate).toMatchObject({
      firstName: "shpirer",
      lastName: "vasquez",
      confidence: 80,
    });
    expect(candidate?.meta?.ambiguous).toBe(true);
  });

  it("applies a confidence penalty when both tokens are common first names", () => {
    const candidate = extractFromEmail({ email: "james.taylor@gmail.com" });
    expect(candidate?.confidence).toBe(80);
    expect(candidate?.meta?.ambiguous).toBe(true);
  });

  it("treats a single-token local part as username-like with a penalty", () => {
    const candidate = extractFromEmail({ email: "mia123@gmail.com" });
    expect(candidate).toMatchObject({
      firstName: "mia",
      email: "mia123@gmail.com",
      confidence: 80,
    });
    expect(candidate?.lastName).toBeUndefined();
    expect(candidate?.meta?.ambiguous).toBe(true);
  });

  it("keeps first/last and drops the middle token on 3+ token local parts", () => {
    const candidate = extractFromEmail({
      email: "mary.jane.watson@gmail.com",
    });
    expect(candidate).toMatchObject({
      firstName: "mary",
      lastName: "watson",
      confidence: 80,
    });
    expect(candidate?.meta?.droppedMiddleTokens).toEqual(["jane"]);
  });
});
