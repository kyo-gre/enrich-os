import { withBrowserPage } from "./browser-pool";

export interface FetchResult {
  html: string;
  fetchedVia: "static" | "browser";
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; EnrichOS/1.0; +https://enrich-os.local)";
const STATIC_TIMEOUT_MS = 10_000;
const BROWSER_TIMEOUT_MS = 15_000;
/** Below this many bytes, static HTML is assumed to be a JS-shell/consent wall rather than real content. */
const MIN_USABLE_HTML_LENGTH = 2000;

async function tryStaticFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(STATIC_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Fetches a profile page, escalating from a plain HTTP fetch to a headless
 * browser only when the static response looks unusable (blocked, JS-shell,
 * or errored). Static-first keeps the common case cheap and unrate-limited
 * by browser concurrency.
 */
export async function fetchProfileHtml(url: string): Promise<FetchResult> {
  const staticHtml = await tryStaticFetch(url);
  if (staticHtml && staticHtml.length >= MIN_USABLE_HTML_LENGTH) {
    return { html: staticHtml, fetchedVia: "static" };
  }

  const browserHtml = await withBrowserPage(async (page) => {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_TIMEOUT_MS,
    });
    return page.content();
  });
  return { html: browserHtml, fetchedVia: "browser" };
}
