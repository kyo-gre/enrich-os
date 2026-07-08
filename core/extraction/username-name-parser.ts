import confidenceWeights from "../../config/confidence-weights.json";
import { isCommonFirstName } from "./common-first-names";
import { cleanName } from "../normalization/normalize";
import { stripDescriptorSuffix } from "../normalization/descriptor-list";
import type { NameCandidate, NormalizedCreator } from "../../shared/types";

function tokenizeUsername(username: string): string[] {
  return username
    .split(/[._-]+/)
    .map((token) => token.replace(/^\d+|\d+$/g, ""))
    .filter(Boolean);
}

/**
 * Finds the shortest known-first-name prefix of a run-on string and splits
 * there — e.g. "kaylaprincipato" -> "kayla" + "principato". Falls back to
 * treating the whole string as a single token when no prefix matches, same
 * as the email parser's single-token case.
 *
 * The remainder must be at least 4 characters: real surnames are rarely
 * shorter, and without that floor a name like "julianne" gets wrongly cut
 * at the "julia" or "julian" prefix it happens to contain, leaving a
 * nonsense 2-3 letter "surname" behind.
 */
const MIN_REMAINDER_LENGTH = 4;

function splitConcatenatedName(token: string): {
  firstName: string;
  lastName?: string;
  split: boolean;
} {
  for (let i = 3; i <= token.length - MIN_REMAINDER_LENGTH; i++) {
    if (isCommonFirstName(token.slice(0, i))) {
      return { firstName: token.slice(0, i), lastName: token.slice(i), split: true };
    }
  }
  return { firstName: token, split: false };
}

/**
 * Extracts a name candidate from a username/handle. Weaker evidence than an
 * explicit Full Name column or a successful profile scrape (see
 * confidence-weights.json — "username" sits below both) but stronger than
 * nothing, and it's what's left to try when scraping is blocked. Handles the
 * one case emails don't need: many handles are two real words run together
 * with no delimiter, so a known-first-name prefix scan is tried before
 * giving up and returning the whole cleaned string as one token.
 */
export function extractFromUsername(
  normalized: NormalizedCreator,
): NameCandidate | null {
  const username = normalized.username?.trim();
  if (!username) return null;

  const withoutDescriptor = stripDescriptorSuffix(username);
  const tokens = tokenizeUsername(withoutDescriptor);
  if (tokens.length === 0) return null;

  const confidence = confidenceWeights.username;

  if (tokens.length === 1) {
    const { firstName, lastName, split } = splitConcatenatedName(tokens[0]);
    const cleanedFirst = cleanName(firstName);
    if (!cleanedFirst) return null;
    const cleanedLast = lastName ? cleanName(lastName) : undefined;
    return {
      source: "username",
      firstName: cleanedFirst,
      lastName: cleanedLast || undefined,
      confidence,
      meta: { tokenCount: 1, splitFromConcatenated: split },
    };
  }

  // A delimited handle ("jane.doe") could genuinely be firstname.lastname,
  // or could just as easily be two unrelated words ("strands.oflove") with
  // no name in them at all. Unlike the single-token case above, there's no
  // fallback value in guessing blindly here — only produce a candidate when
  // at least one token is a recognized first name, so an ungrounded split
  // doesn't get to outrank a same-tier email guess for no real reason.
  const [first, ...rest] = tokens;
  const last = rest[rest.length - 1];
  if (!isCommonFirstName(first) && !isCommonFirstName(last)) return null;

  const cleanedFirst = cleanName(first);
  if (!cleanedFirst) return null;
  return {
    source: "username",
    firstName: cleanedFirst,
    lastName: cleanName(last) || undefined,
    confidence,
    meta: { tokenCount: tokens.length },
  };
}
