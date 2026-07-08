import type { ProfilePlatform } from "./types";

/**
 * When a platform blocks an unauthenticated/datacenter-IP request instead of
 * erroring, it typically serves a generic shell page whose title is just the
 * site's own name (e.g. og:title "Instagram") rather than the real profile.
 * Treating that as a valid display name would silently fabricate evidence
 * from a non-answer — this is the one place all adapters route through to
 * catch it before it reaches the confidence scorer.
 */
const PLATFORM_PLACEHOLDER_TITLES: Partial<Record<ProfilePlatform, string[]>> = {
  instagram: ["instagram"],
  tiktok: ["tiktok"],
  facebook: ["facebook"],
  youtube: ["youtube"],
};

const LOGIN_WALL_PATTERN = /\b(log\s*in|log\s*into|sign\s*up|sign\s*in)\b/i;

export function isPlaceholderTitle(
  title: string | undefined,
  platform: ProfilePlatform,
): boolean {
  if (!title) return true;
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if ((PLATFORM_PLACEHOLDER_TITLES[platform] ?? []).includes(normalized)) return true;
  if (LOGIN_WALL_PATTERN.test(normalized)) return true;
  return false;
}
