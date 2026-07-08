import type {
  ConfidenceWeights,
  NameCandidate,
  ResolvedIdentity,
} from "../../shared/types";

/**
 * Confidence is a measure of evidence strength, not a guess at correctness.
 * A Full Name column is stronger evidence than an email-derived guess not
 * because it's "more likely right" in some abstract sense, but because the
 * source itself is more direct/reliable — that's what the configured
 * weights encode. Scoring is therefore just: pick the strongest evidence
 * available, and don't let ambiguous evidence pass as trustworthy even if
 * its (already-penalized) score happens to clear the review threshold.
 */
export function scoreCandidates(
  candidates: NameCandidate[],
  weights: ConfidenceWeights,
  pipelineVersion: string,
): ResolvedIdentity {
  if (candidates.length === 0) {
    return {
      confidenceScore: 0,
      processingStatus: "failed",
      pipelineVersion,
      needsReview: true,
    };
  }

  // Email is a last-resort guess, not evidence to be weighed on equal terms:
  // a real full-name column or a successful profile scrape must always win
  // over an email-derived guess, even one with a numerically higher or tied
  // confidence score. Only fall back to email when nothing else is available.
  const nonEmailCandidates = candidates.filter((c) => c.source !== "email");
  const pool = nonEmailCandidates.length > 0 ? nonEmailCandidates : candidates;

  const winner = pool.reduce((strongest, candidate) =>
    candidate.confidence > strongest.confidence ? candidate : strongest,
  );

  const isAmbiguous = winner.meta?.ambiguous === true;
  const belowThreshold = winner.confidence < weights.reviewThreshold;
  const needsReview = isAmbiguous || belowThreshold;

  return {
    firstName: winner.firstName,
    lastName: winner.lastName,
    displayName: winner.displayName,
    platform: winner.platform,
    profileUrl: winner.profileUrl,
    socialHandle: winner.socialHandle,
    email: winner.email,
    confidenceScore: winner.confidence,
    confidenceSource: winner.source,
    processingStatus: needsReview ? "needs_review" : "enriched",
    pipelineVersion,
    needsReview,
  };
}
