/** Unicode combining-mark range (accents, diacritics) left behind by NFKD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Folds decorative "fancy font" Unicode (Mathematical Alphanumeric Symbols,
 * fullwidth forms, etc. — commonly used for Instagram/TikTok display-name
 * styling) down to plain Latin letters, and strips accents. Unicode assigns
 * these stylized blocks a compatibility decomposition to their base letter,
 * which NFKD normalization already knows how to unwind — this just does
 * that and removes the leftover combining marks.
 */
export function foldStylizedUnicode(text: string): string {
  return text.normalize("NFKD").replace(COMBINING_MARKS, "");
}
