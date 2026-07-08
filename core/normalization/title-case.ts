/**
 * Converts an ALL-CAPS or all-lowercase name to Title Case (e.g. "BLEV" ->
 * "Blev"). Leaves already mixed-case input untouched — a name like
 * "McDonald" or "O'Brien" is more likely an intentional casing than
 * something to "fix", and guessing wrong there is worse than leaving it.
 */
export function titleCaseIfShouty(text: string): string {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (!letters) return text;
  const isAllUpper = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const isAllLower = letters === letters.toLowerCase() && letters !== letters.toUpperCase();
  if (!isAllUpper && !isAllLower) return text;

  return text
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_match, boundary, letter) => boundary + letter.toUpperCase());
}
