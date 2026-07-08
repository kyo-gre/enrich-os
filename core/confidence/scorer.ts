import { titleCaseIfShouty } from "../normalization/title-case";
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

  // A one-letter fragment ("K", "M") is what a stylized/truncated display
  // name splits into — it's not a name, and letting it win just because it
  // came from a "stronger" source (a real scrape) produces a worse result
  // than a plausible guess from a weaker source. A "businessLike" flag (see
  // profiles/adapters/index.ts) is the same kind of problem in disguise: the
  // remaining text after a job-title word is stripped ("San Diego" from "San
  // Diego Hairstylist") looks perfectly plausible on its own, even though
  // it's a location, not a name. Both get the same treatment: prefer
  // plausible, non-business-flagged evidence over the alternative,
  // regardless of source, before ranking by confidence.
  const isPlausible = (candidate: NameCandidate): boolean => {
    if (candidate.meta?.businessLike === true) return false;
    const name = (candidate.firstName ?? candidate.displayName ?? "").trim();
    return name.length >= 2 && /[a-zA-Z]/.test(name);
  };
  const plausibleCandidates = candidates.filter(isPlausible);
  const plausiblePool = plausibleCandidates.length > 0 ? plausibleCandidates : candidates;

  // Email is a last-resort guess, not evidence to be weighed on equal terms:
  // a real full-name column, a username-derived guess, or a successful
  // profile scrape must always win over an email-derived guess, even one
  // with a numerically higher or tied confidence score. Only fall back to
  // email when nothing else is available.
  const nonEmailCandidates = plausiblePool.filter((c) => c.source !== "email");
  const pool = nonEmailCandidates.length > 0 ? nonEmailCandidates : plausiblePool;

  const winner = pool.reduce((strongest, candidate) =>
    candidate.confidence > strongest.confidence ? candidate : strongest,
  );

  const isAmbiguous = winner.meta?.ambiguous === true;
  const belowThreshold = winner.confidence < weights.reviewThreshold;
  const needsReview = isAmbiguous || belowThreshold;

  // Only the email/full-name extractors return lowercase tokens verbatim
  // (they're pure string-splitting, with no display-quality cleanup applied
  // — see their own tests, which assert exactly that). Whichever candidate
  // wins, the field the operator actually sees should look like a name
  // ("Jessikah", not "jessikah") regardless of which source produced it.
  const firstName = winner.firstName ? titleCaseIfShouty(winner.firstName) : winner.firstName;
  const lastName = winner.lastName ? titleCaseIfShouty(winner.lastName) : winner.lastName;

  return {
    firstName,
    lastName,
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
