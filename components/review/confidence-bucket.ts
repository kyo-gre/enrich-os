export type ConfidenceBucket = "high" | "medium" | "low";

/**
 * UI-only grouping over the existing confidenceScore field for filtering
 * the review table. This is NOT a new confidence-scoring concept — it
 * reads a value the backend already computed and produces nothing that's
 * stored or sent back. Thresholds are a display convenience, not a
 * business rule; they intentionally don't reuse config/confidence-weights.json's
 * reviewThreshold (that threshold drives needsReview, a different concern).
 */
export function confidenceBucket(score: number | null): ConfidenceBucket | null {
  if (score === null) return null;
  if (score >= 90) return "high";
  if (score >= 70) return "medium";
  return "low";
}

export const CONFIDENCE_BUCKET_LABELS: Record<ConfidenceBucket, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
