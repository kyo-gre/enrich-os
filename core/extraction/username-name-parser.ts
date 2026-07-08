import confidenceWeights from "../../config/confidence-weights.json";
import { isCommonFirstName } from "./common-first-names";
import { cleanName } from "../normalization/normalize";
import { stripDescriptorSuffix, isDescriptorWord } from "../normalization/descriptor-list";
import type { NameCandidate, NormalizedCreator } from "../../shared/types";

function tokenizeUsername(username: string): string[] {
  return username
    .split(/[._-]+/)
    .map((token) => token.replace(/^\d+|\d+$/g, ""))
    .filter(Boolean);
}

/**
 * Finds the longest known-first-name prefix of a run-on string and splits
 * there — e.g. "kaylaprincipato" -> "kayla" + "principato". Falls back to
 * treating the whole string as a single token when no prefix matches, same
 * as the email parser's single-token case.
 *
 * Both bounds matter with a large (40k+) name dictionary: the remainder must
 * be at least 4 characters (real surnames are rarely shorter — without this,
 * "julianne" gets cut at the "julia"/"julian" prefix it happens to contain,
 * leaving a nonsense 2-3 letter "surname"), and the prefix must be at least
 * 5 characters. A comprehensive dictionary inevitably contains real but
 * very short names ("Kay", "Hai", "Juli") that would otherwise trigger a
 * confident-looking split at the first few letters of a longer name that
 * isn't actually cut there at all ("Kayla" -> "Kay" + "la"). Scanning
 * longest-first (rather than shortest-first) means a real longer name is
 * always found before a shorter one it happens to start with.
 */
const MIN_PREFIX_LENGTH = 5;
const MIN_REMAINDER_LENGTH = 4;

function splitConcatenatedName(token: string): {
  firstName: string;
  lastName?: string;
  split: boolean;
} {
  for (let i = token.length - MIN_REMAINDER_LENGTH; i >= MIN_PREFIX_LENGTH; i--) {
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
  const rawTokens = tokenizeUsername(withoutDescriptor);
  if (rawTokens.length === 0) return null;

  // A title/honorific ("mrs", "dr") is a whole separate token once the
  // handle is delimited ("mrs_krysta_" -> ["mrs", "krysta"]) — it isn't a
  // name and shouldn't compete for the firstName/lastName slots below.
  const tokens = rawTokens.length > 1 ? rawTokens.filter((t) => !isDescriptorWord(t)) : rawTokens;
  if (tokens.length === 0) return null;

  const confidence = confidenceWeights.username;

  if (tokens.length === 1) {
    // The token itself might already be a clean, complete name ("krysta",
    // left over after an "mrs_" title was filtered out above) — no
    // concatenation to untangle, so check this before trying to split it.
    if (isCommonFirstName(tokens[0])) {
      const cleaned = cleanName(tokens[0]);
      if (!cleaned) return null;
      return {
        source: "username",
        firstName: cleaned,
        confidence,
        meta: { tokenCount: 1 },
      };
    }

    const { firstName, lastName, split } = splitConcatenatedName(tokens[0]);
    if (!split) {
      // No known-name prefix found — we're not deriving anything, just
      // echoing the handle back. Say so explicitly rather than presenting
      // an unconfirmed guess as if it were a real name.
      return {
        source: "username",
        firstName: `@${username}`,
        confidence,
        meta: { tokenCount: 1, splitFromConcatenated: false, isHandleFallback: true },
      };
    }
    const cleanedFirst = cleanName(firstName);
    if (!cleanedFirst) return null;
    const cleanedLast = lastName ? cleanName(lastName) : undefined;
    return {
      source: "username",
      firstName: cleanedFirst,
      lastName: cleanedLast || undefined,
      confidence,
      meta: { tokenCount: 1, splitFromConcatenated: true },
    };
  }

  // A delimited handle ("jane.doe") could genuinely be firstname.lastname,
  // or could just as easily be two unrelated words ("strands.oflove") with
  // no name in them at all. Unlike the single-token case above, there's no
  // value in guessing blindly here — only trust a first/last split when at
  // least one token is a recognized first name, and put whichever one is
  // recognized in the firstName slot rather than assuming positional order
  // (a title token filtered out above could otherwise leave the *name*
  // sitting in the "last" position, as in "mrs_krysta_").
  const [first, ...rest] = tokens;
  const last = rest[rest.length - 1];
  const firstIsCommon = isCommonFirstName(first);
  const lastIsCommon = isCommonFirstName(last);
  if (!firstIsCommon && !lastIsCommon) {
    return {
      source: "username",
      firstName: `@${username}`,
      confidence,
      meta: { tokenCount: tokens.length, isHandleFallback: true },
    };
  }

  const [resolvedFirst, resolvedLast] = lastIsCommon && !firstIsCommon ? [last, first] : [first, last];
  const cleanedFirst = cleanName(resolvedFirst);
  if (!cleanedFirst) return null;
  return {
    source: "username",
    firstName: cleanedFirst,
    lastName: cleanName(resolvedLast) || undefined,
    confidence,
    meta: { tokenCount: tokens.length },
  };
}
