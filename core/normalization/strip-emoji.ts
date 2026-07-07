const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, "");
}
