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

  it("carries platform/profileUrl/socialHandle from the winning candidate", () => {
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
    // email (95) still wins over instagram (80) as the stronger name evidence...
    expect(result.confidenceSource).toBe("email");
    // ...so platform/profileUrl/socialHandle are absent here, not backfilled
    // from a losing candidate — enrichOne is responsible for falling back
    // to the record's own normalized input in that case.
    expect(result.platform).toBeUndefined();
    expect(result.profileUrl).toBeUndefined();
    expect(result.socialHandle).toBeUndefined();
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
