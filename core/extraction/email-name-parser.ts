import confidenceWeights from "../../config/confidence-weights.json";
import { isCommonFirstName } from "./common-first-names";
import type { NameCandidate, NormalizedCreator } from "../../shared/types";

function tokenizeLocalPart(localPart: string): string[] {
  return localPart
    .split(/[._-]+/)
    .map((token) => token.replace(/^\d+|\d+$/g, ""))
    .filter(Boolean);
}

/**
 * Email name-order heuristic (first.last vs last.first). Genuinely ambiguous
 * in general — see plan doc "Email name-order heuristic" for the full
 * rationale. Falls back to first.last with a confidence penalty rather than
 * silently asserting a possibly-wrong order.
 */
export function extractFromEmail(
  normalized: NormalizedCreator,
): NameCandidate | null {
  const email = normalized.email?.trim();
  if (!email) return null;

  const atIndex = email.indexOf("@");
  const localPart = atIndex === -1 ? email : email.slice(0, atIndex);
  const tokens = tokenizeLocalPart(localPart);

  if (tokens.length === 0) return null;

  const base = confidenceWeights.email;
  const penalty = confidenceWeights.emailAmbiguousPenalty;

  if (tokens.length === 1) {
    // No delimiter to split first/last — this is really username-shaped.
    return {
      source: "email",
      firstName: tokens[0],
      email,
      confidence: base - penalty,
      meta: { tokenCount: 1, ambiguous: true },
    };
  }

  if (tokens.length >= 3) {
    // Keep first/last, drop the middle (likely a middle name/initial).
    const [first, ...rest] = tokens;
    const last = rest[rest.length - 1];
    return {
      source: "email",
      firstName: first,
      lastName: last,
      email,
      confidence: base - penalty,
      meta: {
        tokenCount: tokens.length,
        ambiguous: true,
        droppedMiddleTokens: rest.slice(0, -1),
      },
    };
  }

  // Exactly 2 tokens — the core order-detection case.
  const [tokenA, tokenB] = tokens;
  const aIsCommon = isCommonFirstName(tokenA);
  const bIsCommon = isCommonFirstName(tokenB);

  if (aIsCommon && !bIsCommon) {
    // e.g. mia.shpirer -> first.last
    return {
      source: "email",
      firstName: tokenA,
      lastName: tokenB,
      email,
      confidence: base,
      meta: { orderDetection: "first_last", ambiguous: false },
    };
  }

  if (bIsCommon && !aIsCommon) {
    // e.g. vasquez.jennifer -> last.first
    return {
      source: "email",
      firstName: tokenB,
      lastName: tokenA,
      email,
      confidence: base,
      meta: { orderDetection: "last_first", ambiguous: false },
    };
  }

  // Both or neither token is a recognized first name — genuinely ambiguous.
  return {
    source: "email",
    firstName: tokenA,
    lastName: tokenB,
    email,
    confidence: base - penalty,
    meta: { orderDetection: "first_last_default", ambiguous: true },
  };
}
