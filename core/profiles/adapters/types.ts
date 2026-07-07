import type { ProfilePlatform } from "../fetcher/platform";

export interface ScrapedProfile {
  displayName?: string;
  username?: string;
  bio?: string;
}

export interface ProfileAdapterResult {
  profile: ScrapedProfile | null;
  fetchedVia: "static" | "browser";
  /** Raw fields kept for the profile_snapshots audit trail, not for scoring. */
  rawSnapshot: Record<string, unknown>;
}

export type ProfileAdapter = (url: string) => Promise<ProfileAdapterResult>;

export type { ProfilePlatform };
