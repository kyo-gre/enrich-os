import { PlatformRateLimiter } from "./rate-limiter";

/**
 * Shared limiter instance for all profile scraping. Instagram/TikTok get
 * wider spacing since they're more aggressive about blocking scrapers;
 * generic sites use the default.
 */
export const profileRateLimiter = new PlatformRateLimiter(
  {
    instagram: { minIntervalMs: 3000 },
    tiktok: { minIntervalMs: 3000 },
    generic: { minIntervalMs: 1000 },
  },
  { minIntervalMs: 1000 },
);
