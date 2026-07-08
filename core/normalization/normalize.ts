import { stripEmoji } from "./strip-emoji";
import { stripDescriptors, stripDescriptorSuffix } from "./descriptor-list";
import { foldStylizedUnicode } from "./unicode-fold";
import { titleCaseIfShouty } from "./title-case";
import type { MappedCreatorInput, NormalizedCreator } from "../../shared/types";

/** A bio-style display name ("Name | tag | tag") puts the actual name first — keep only that segment. */
function stripBioTags(text: string): string {
  const pipeIndex = text.indexOf("|");
  return pipeIndex === -1 ? text : text.slice(0, pipeIndex);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Collapses repeated punctuation (e.g. "--", "||", "..") down to a single separator. */
function collapseRepeatedPunctuation(text: string): string {
  return text.replace(/([.,;:|/_\-–—])\1+/g, "$1");
}

/** Trims leftover separator punctuation left behind after descriptor removal (e.g. "Jane Doe -" -> "Jane Doe"). */
function trimSeparators(text: string): string {
  return text.replace(/^[\s.,;:|/_\-–—]+|[\s.,;:|/_\-–—]+$/g, "");
}

/** Strips "of <number>" bio phrases (e.g. "Mom of 3", "Dad of 2") that descriptor stripping alone leaves behind. */
function stripOfCount(text: string): string {
  return text.replace(/\bof\s+\d+\b/gi, "");
}

/**
 * Shared cleanup for any name-like string, whether it came from a Full Name
 * column or was scraped off a profile page: folds decorative "fancy font"
 * Unicode and strips emoji/descriptors/stray punctuation, then normalizes
 * SHOUTY or all-lowercase casing to Title Case (mixed-case input is left
 * alone, since that's more likely intentional than a mistake to fix).
 */
export function cleanName(raw: string): string {
  let value = stripBioTags(raw);
  value = foldStylizedUnicode(value);
  value = stripEmoji(value);
  value = collapseRepeatedPunctuation(value);
  value = collapseWhitespace(value);
  value = stripDescriptors(value);
  value = stripOfCount(value);
  value = trimSeparators(value);
  value = collapseWhitespace(value);
  // Word-boundary stripping above can't see a descriptor glued onto the end
  // of a single run-on word (e.g. "Hailyeahpilates") — try a suffix match
  // too, but only when the whole cleaned value is one word: a multi-word
  // name legitimately ending in a descriptor-like word was already handled
  // above, and suffix-matching a multi-word phrase risks eating real text.
  if (!/\s/.test(value)) {
    value = stripDescriptorSuffix(value);
  }
  return titleCaseIfShouty(value);
}

export function normalizeCreator(
  input: MappedCreatorInput,
): NormalizedCreator {
  const normalized: NormalizedCreator = {};

  if (input.rawFullName) {
    const cleaned = cleanName(input.rawFullName);
    if (cleaned) normalized.fullName = cleaned;
  }
  if (input.rawUsername) {
    const cleaned = collapseWhitespace(input.rawUsername).replace(/^@/, "");
    if (cleaned) normalized.username = cleaned;
  }
  if (input.rawEmail) {
    const cleaned = collapseWhitespace(input.rawEmail).toLowerCase();
    if (cleaned) normalized.email = cleaned;
  }
  if (input.rawProfileUrl) {
    const cleaned = collapseWhitespace(input.rawProfileUrl);
    if (cleaned) normalized.profileUrl = cleaned;
  }
  if (input.rawPlatform) {
    const cleaned = collapseWhitespace(input.rawPlatform);
    if (cleaned) normalized.platform = cleaned;
  }

  return normalized;
}
