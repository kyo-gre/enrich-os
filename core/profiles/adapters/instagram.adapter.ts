import * as cheerio from "cheerio";
import { fetchProfileHtml } from "../fetcher/fetch-escalation";
import type { ProfileAdapterResult } from "./types";

function usernameFromUrl(url: string): string | undefined {
  const match = url.match(/instagram\.com\/([^/?#]+)/i);
  return match?.[1];
}

/** Instagram og:title is typically "Display Name (@username) • Instagram photos and videos". */
function displayNameFromOgTitle(ogTitle: string | undefined): string | undefined {
  if (!ogTitle) return undefined;
  const name = ogTitle.split("(@")[0]?.trim();
  return name || undefined;
}

export async function fetchInstagramProfile(
  url: string,
): Promise<ProfileAdapterResult> {
  const { html, fetchedVia } = await fetchProfileHtml(url);
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content");
  const bio = $('meta[property="og:description"]').attr("content");
  const displayName = displayNameFromOgTitle(ogTitle);
  const username = usernameFromUrl(url);

  const profile =
    displayName || username ? { displayName, username, bio } : null;

  return {
    profile,
    fetchedVia,
    rawSnapshot: { ogTitle: ogTitle ?? null, bio: bio ?? null },
  };
}
