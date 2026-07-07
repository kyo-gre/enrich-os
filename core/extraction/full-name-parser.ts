import confidenceWeights from "../../config/confidence-weights.json";
import type { NameCandidate, NormalizedCreator } from "../../shared/types";

/**
 * Extracts a first/last name candidate from an already-normalized full name.
 * Middle tokens (3+ words) are dropped rather than guessed at, and the
 * candidate is marked ambiguous so it can surface for review.
 */
export function extractFromFullName(
  normalized: NormalizedCreator,
): NameCandidate | null {
  const fullName = normalized.fullName?.trim();
  if (!fullName) return null;

  const tokens = fullName.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  if (tokens.length === 1) {
    return {
      source: "full_name",
      firstName: tokens[0],
      confidence: confidenceWeights.full_name,
      meta: { tokenCount: 1 },
    };
  }

  const firstName = tokens[0];
  const lastName = tokens[tokens.length - 1];
  const droppedMiddle = tokens.length > 2;

  return {
    source: "full_name",
    firstName,
    lastName,
    confidence: confidenceWeights.full_name,
    meta: droppedMiddle
      ? { tokenCount: tokens.length, droppedMiddleTokens: tokens.slice(1, -1) }
      : { tokenCount: tokens.length },
  };
}
