import commonFirstNames from "../../config/common-first-names.json";

/**
 * Bundled, offline list of common first names used by the email/username
 * name-order heuristics and the confidence scorer's "verified" tier.
 * Deliberately static/local rather than an API call — matches the
 * no-cloud-dependency mandate and keeps the heuristic deterministic and
 * testable.
 *
 * Sourced from U.S. Social Security Administration birth-record data
 * (public domain), filtered to names with at least 100 recorded births
 * historically — comprehensive enough to catch real but uncommon names
 * (e.g. "Krysta", "Jessikah") without pulling in one-off/typo-level
 * entries. See scratch-extract-names.mjs in project history for the
 * extraction method if this ever needs regenerating.
 *
 * Known limitation: skews toward names registered in the U.S., since
 * that's what SSA records. A name outside this list simply falls through
 * to the "ambiguous"/unverified path (lower confidence, not a confident
 * wrong guess) rather than being rejected outright — see
 * email-name-parser.ts and username-name-parser.ts.
 */
export const commonFirstNamesSet: ReadonlySet<string> = new Set(
  commonFirstNames as string[],
);

export function isCommonFirstName(token: string): boolean {
  return commonFirstNamesSet.has(token.toLowerCase());
}
