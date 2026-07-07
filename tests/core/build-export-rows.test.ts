import { describe, expect, it } from "vitest";
import { toFullExportRow, toQuickExportRow } from "../../core/export/build-export-rows";

describe("toQuickExportRow", () => {
  it("only includes firstName/email/socialHandle", () => {
    const row = toQuickExportRow({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      socialHandle: "janedoe",
      confidenceScore: 95,
    });
    expect(row).toEqual({
      firstName: "Jane",
      email: "jane@example.com",
      socialHandle: "janedoe",
    });
  });
});

describe("toFullExportRow", () => {
  it("includes resolved identity, confidence, status, and review state", () => {
    const row = toFullExportRow(
      {
        firstName: "Jane",
        lastName: "Doe",
        displayName: "Jane D.",
        platform: "instagram",
        profileUrl: "https://instagram.com/janedoe",
        email: "jane@example.com",
        socialHandle: "janedoe",
        confidenceScore: 95,
        confidenceSource: "email",
        processingStatus: "enriched",
        needsReview: false,
        reviewStatus: "approved",
        pipelineVersion: "1.0.0",
        notes: "looks good",
      },
      1700000000000,
    );

    expect(row).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      displayName: "Jane D.",
      platform: "instagram",
      profileUrl: "https://instagram.com/janedoe",
      email: "jane@example.com",
      socialHandle: "janedoe",
      confidenceScore: 95,
      confidenceSource: "email",
      processingStatus: "enriched",
      needsReview: false,
      reviewStatus: "approved",
      pipelineVersion: "1.0.0",
      exportedAt: 1700000000000,
      notes: "looks good",
    });
  });

  it("stamps the same exportedAt passed in, regardless of record contents", () => {
    const row = toFullExportRow({}, 42);
    expect(row.exportedAt).toBe(42);
  });
});
