// Extended_Pictographic covers emoji themselves; Emoji_Modifier catches skin-tone
// modifiers (U+1F3FB-U+1F3FF), which are their own codepoints appended after
// the base emoji and aren't part of Extended_Pictographic; \p{Mn} (nonspacing
// marks) catches variation selectors (U+FE0F) and similar invisible riders.
// Without all three, a modifier/selector can survive as a stray "word" once
// the visible emoji next to it is stripped.
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Mn}/gu;

/**
 * Replaces with a space rather than deleting outright — an emoji sitting
 * between two words with no surrounding whitespace (e.g. "Cher✨Aslor", a
 * real Instagram display-name style) would otherwise get smashed into one
 * unsplittable word. Downstream whitespace collapsing absorbs the extra
 * space in cases that already had one.
 */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, " ");
}
