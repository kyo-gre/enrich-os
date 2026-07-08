import { describe, expect, it } from "vitest";
import { scoreCandidates } from "../../core/confidence/scorer";
import type { ConfidenceWeights, NameCandidate } from "../../shared/types";

const weights: ConfidenceWeights = {
  full_name: 100,
  display_name: 98,
  email: 95,
  username: 60,
  instagram: 80,
  tiktok: 80,
  facebook: 80,
  youtube: 80,
  generic_scrape: 55,
  emailAmbiguousPenalty: 15,
  reviewThreshold: 70,
};

describe("scoreCandidates", () => {
  it("marks the record failed when there are no candidates at all", () => {
    const result = scoreCandidates([], weights, "1.0.0");
    expect(result).toMatchObject({
      confidenceScore: 0,
      processingStatus: "failed",
      needsReview: true,
    });
    expect(result.confidenceSource).toBeUndefined();
  });

  it("picks the strongest evidence when multiple sources agree", () => {
    const candidates: NameCandidate[] = [
      { source: "email", firstName: "Jane", lastName: "Doe", confidence: 95 },
      { source: "full_name", firstName: "Jane", lastName: "Doe", confidence: 100 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.confidenceSource).toBe("full_name");
    expect(result.confidenceScore).toBe(100);
    expect(result.processingStatus).toBe("enriched");
    expect(result.needsReview).toBe(false);
  });

  it("does not need review when the strongest evidence clears the threshold and isn't ambiguous", () => {
    const candidates: NameCandidate[] = [
      { source: "email", firstName: "Mia", lastName: "Shpirer", confidence: 95 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.processingStatus).toBe("enriched");
    expect(result.needsReview).toBe(false);
  });

  it("flags needs_review when the strongest evidence is below the threshold", () => {
    const candidates: NameCandidate[] = [
      { source: "username", firstName: "mia123", confidence: 60 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.processingStatus).toBe("needs_review");
    expect(result.needsReview).toBe(true);
  });

  /**
   * Regression: ambiguous evidence must force review even when its
   * (already-penalized) score still clears reviewThreshold — evidence
   * strength and "safe to trust" are not the same thing.
   */
  it("flags needs_review for ambiguous evidence even when its score clears the threshold", () => {
    const candidates: NameCandidate[] = [
      {
        source: "email",
        firstName: "James",
        lastName: "Taylor",
        confidence: 80, // 95 - 15 penalty, still above reviewThreshold of 70
        meta: { ambiguous: true },
      },
    ];
    expect(80).toBeGreaterThanOrEqual(weights.reviewThreshold);
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.processingStatus).toBe("needs_review");
    expect(result.needsReview).toBe(true);
  });

  it("prefers a profile scrape over an email guess even when email scores higher", () => {
    const candidates: NameCandidate[] = [
      { source: "email", firstName: "Jenn", lastName: "V", confidence: 95 },
      {
        source: "instagram",
        displayName: "Jenn V",
        platform: "instagram",
        profileUrl: "https://www.instagram.com/jennv/",
        socialHandle: "jennv",
        confidence: 80,
      },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    // Email is a last resort, not evidence competing on equal footing — any
    // real profile scrape wins regardless of its numeric confidence.
    expect(result.confidenceSource).toBe("instagram");
    expect(result.platform).toBe("instagram");
    expect(result.profileUrl).toBe("https://www.instagram.com/jennv/");
    expect(result.socialHandle).toBe("jennv");
  });

  it("falls back to email only when no non-email candidate exists", () => {
    const candidates: NameCandidate[] = [
      { source: "email", firstName: "Mia", lastName: "Shpirer", confidence: 95 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.confidenceSource).toBe("email");
  });

  /**
   * Regression: a stylized/truncated Instagram display name like "K A Y"
   * splits into a one-letter firstName ("K"). That must never win over a
   * plausible guess from a weaker source, even though it's a real scrape
   * and outranks email/username on raw source priority.
   */
  it("skips an implausible single-letter scrape result in favor of a plausible username guess", () => {
    const candidates: NameCandidate[] = [
      {
        source: "instagram",
        firstName: "K",
        displayName: "K",
        platform: "instagram",
        confidence: 80,
      },
      {
        source: "username",
        firstName: "Kayla",
        lastName: "Principato",
        confidence: 60,
      },
      { source: "email", firstName: "kaylaprincipato", confidence: 80 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.confidenceSource).toBe("username");
    expect(result.firstName).toBe("Kayla");
    expect(result.lastName).toBe("Principato");
  });

  it("still uses the implausible candidate when nothing plausible exists at all", () => {
    const candidates: NameCandidate[] = [
      { source: "instagram", firstName: "K", displayName: "K", confidence: 80 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.confidenceSource).toBe("instagram");
    expect(result.firstName).toBe("K");
  });

  it("surfaces platform/profileUrl/socialHandle when a profile scrape is the winning evidence", () => {
    const candidates: NameCandidate[] = [
      {
        source: "instagram",
        displayName: "Jenn V",
        platform: "instagram",
        profileUrl: "https://www.instagram.com/jennv/",
        socialHandle: "jennv",
        confidence: 80,
      },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.platform).toBe("instagram");
    expect(result.profileUrl).toBe("https://www.instagram.com/jennv/");
    expect(result.socialHandle).toBe("jennv");
  });

  it("surfaces email when the email candidate is the winning evidence", () => {
    const candidates: NameCandidate[] = [
      {
        source: "email",
        firstName: "Mia",
        lastName: "Shpirer",
        email: "mia.shpirer@gmail.com",
        confidence: 95,
      },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.email).toBe("mia.shpirer@gmail.com");
  });

  it("does not backfill email from a losing candidate", () => {
    const candidates: NameCandidate[] = [
      { source: "full_name", firstName: "Jane", lastName: "Doe", confidence: 100 },
      { source: "email", firstName: "Jane", lastName: "Doe", email: "jane.doe@gmail.com", confidence: 95 },
    ];
    const result = scoreCandidates(candidates, weights, "1.0.0");
    expect(result.confidenceSource).toBe("full_name");
    expect(result.email).toBeUndefined();
  });
});
