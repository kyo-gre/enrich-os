import descriptors from "../../config/descriptor-list.json";

const DESCRIPTOR_WORD_SET = new Set(descriptors.map((d) => d.toLowerCase()));

/** True if the whole (lowercased) word is exactly a known descriptor/title — not a substring match. */
export function isDescriptorWord(word: string): boolean {
  return DESCRIPTOR_WORD_SET.has(word.toLowerCase());
}

const DESCRIPTOR_PATTERN = new RegExp(
  `\\b(${descriptors
    .map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length) // longest-first so "co-founder" beats "founder"
    .join("|")})\\b`,
  "gi",
);

/** Strips known creator descriptors/titles (Coach, Founder, ...) from a name-like string. */
export function stripDescriptors(text: string): string {
  return text.replace(DESCRIPTOR_PATTERN, "");
}

/**
 * True if the raw (uncleaned) text contains a recognized descriptor word
 * anywhere — a strong signal the whole string is a business/branded label
 * ("San Diego Hairstylist") rather than a person's name, even for the part
 * that isn't the descriptor itself ("San Diego" is the business's location,
 * not a name, but nothing about "San Diego" alone looks wrong on its own).
 */
export function containsDescriptorWord(text: string): boolean {
  DESCRIPTOR_PATTERN.lastIndex = 0;
  return DESCRIPTOR_PATTERN.test(text);
}

const SORTED_DESCRIPTOR_SUFFIXES = [...descriptors]
  .map((word) => word.toLowerCase().replace(/[^a-z]/g, ""))
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

/**
 * Strips a known descriptor as a trailing suffix even with no word boundary
 * — e.g. "Hailyeahpilates" -> "Hailyeah". `stripDescriptors` can't do this:
 * it requires a `\b` boundary, which a concatenated handle/display-name
 * never has since there's no non-word character between the words.
 */
export function stripDescriptorSuffix(text: string): string {
  const lower = text.toLowerCase();
  for (const suffix of SORTED_DESCRIPTOR_SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 2) {
      return text.slice(0, text.length - suffix.length);
    }
  }
  return text;
}
