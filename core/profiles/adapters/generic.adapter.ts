import * as cheerio from "cheerio";
import { fetchProfileHtml } from "../fetcher/fetch-escalation";
import type { ProfileAdapterResult } from "./types";

/**
 * Fallback for any URL that isn't a recognized platform. Pulls whatever
 * generic metadata is available (og:title / <title> / og:description) so
 * unrecognized sources still contribute weak evidence instead of nothing.
 */
export async function fetchGenericProfile(
  url: string,
): Promise<ProfileAdapterResult> {
  const { html, fetchedVia } = await fetchProfileHtml(url);
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content");
  const title = $("title").first().text().trim();
  const bio = $('meta[property="og:description"]').attr("content");
  const displayName = (ogTitle || title || "").trim() || undefined;

  const profile = displayName ? { displayName, bio } : null;

  return {
    profile,
    fetchedVia,
    rawSnapshot: { ogTitle: ogTitle ?? null, title: title || null, bio: bio ?? null },
  };
}
