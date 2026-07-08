import descriptors from "../../config/descriptor-list.json";

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
