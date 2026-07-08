import confidenceWeights from "../../../config/confidence-weights.json";
import { classifyProfileUrl } from "../fetcher/platform";
import { profileRateLimiter } from "../fetcher/rate-limiter-instance";
import { fetchInstagramProfile } from "./instagram.adapter";
import { fetchTikTokProfile } from "./tiktok.adapter";
import { fetchGenericProfile } from "./generic.adapter";
import { isPlaceholderTitle } from "./placeholder-detection";
import type { ProfileAdapter, ProfilePlatform, ScrapedProfile } from "./types";
import type { NameCandidate } from "../../../shared/types";

const ADAPTERS: Record<ProfilePlatform, ProfileAdapter> = {
  instagram: fetchInstagramProfile,
  tiktok: fetchTikTokProfile,
  // Facebook and YouTube have no bespoke parsing yet — the generic og:title
  // adapter already extracts what these platforms expose, and placeholder
  // detection (below) keeps a blocked/login-walled page from being trusted.
  facebook: fetchGenericProfile,
  youtube: fetchGenericProfile,
  generic: fetchGenericProfile,
};

const SOURCE_BY_PLATFORM: Record<ProfilePlatform, NameCandidate["source"]> = {
  instagram: "instagram",
  tiktok: "tiktok",
  facebook: "facebook",
  youtube: "youtube",
  generic: "generic_scrape",
};

/** First token as first name, last token as last name, middle tokens dropped — same convention as the full-name and email extractors. */
function splitDisplayName(displayName: string): {
  firstName?: string;
  lastName?: string;
} {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};
  if (tokens.length === 1) return { firstName: tokens[0] };
  return { firstName: tokens[0], lastName: tokens[tokens.length - 1] };
}

export interface ProfileScrapeOutcome {
  platform: ProfilePlatform;
  /** A NameCandidate to add as evidence alongside spreadsheet-derived candidates — never a replacement for them. */
  candidate: NameCandidate | null;
  fetchedVia?: "static" | "browser";
  rawSnapshot?: Record<string, unknown>;
  error?: string;
}

function toCandidate(
  platform: ProfilePlatform,
  profileUrl: string,
  profile: ScrapedProfile | null,
): NameCandidate | null {
  if (!profile) return null;

  // A blocked/unauthenticated request often gets a 200 with a generic shell
  // page instead of an error — e.g. Instagram's og:title is just "Instagram".
  // That is not evidence of anything; treating it as one would silently
  // fabricate a name from a non-answer. Reject the whole profile rather than
  // falling back to the bare username, which would only echo input we
  // already have.
  if (profile.displayName && isPlaceholderTitle(profile.displayName, platform)) {
    return null;
  }

  const displayName = profile.displayName ?? profile.username;
  if (!displayName) return null;

  const source = SOURCE_BY_PLATFORM[platform];
  const { firstName, lastName } = splitDisplayName(displayName);
  return {
    source,
    firstName,
    lastName,
    displayName,
    platform,
    profileUrl,
    socialHandle: profile.username,
    confidence: confidenceWeights[source],
    meta: { username: profile.username, bio: profile.bio, scraped: true },
  };
}

/**
 * Scrapes a profile URL and converts the result into a candidate for the
 * confidence system. Never throws: unknown platforms fall back to the
 * generic adapter, and any adapter/fetch failure is reported in `error`
 * with `candidate: null` so callers can log it and keep processing the
 * record rather than aborting the pipeline.
 */
export async function scrapeProfile(
  profileUrl: string | undefined,
): Promise<ProfileScrapeOutcome | null> {
  if (!profileUrl) return null;

  const platform = classifyProfileUrl(profileUrl);
  const adapter = ADAPTERS[platform];

  try {
    const result = await profileRateLimiter.schedule(platform, () =>
      adapter(profileUrl),
    );
    return {
      platform,
      candidate: toCandidate(platform, profileUrl, result.profile),
      fetchedVia: result.fetchedVia,
      rawSnapshot: result.rawSnapshot,
    };
  } catch (error) {
    return {
      platform,
      candidate: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
