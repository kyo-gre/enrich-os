import { stripEmoji } from "./strip-emoji";
import { stripDescriptors } from "./descriptor-list";
import type { MappedCreatorInput, NormalizedCreator } from "../../shared/types";

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

function cleanName(raw: string): string {
  let value = stripEmoji(raw);
  value = collapseRepeatedPunctuation(value);
  value = collapseWhitespace(value);
  value = stripDescriptors(value);
  value = stripOfCount(value);
  value = trimSeparators(value);
  return collapseWhitespace(value);
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
