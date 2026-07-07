import type { Browser, Page } from "playwright";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) =>
      chromium.launch({ headless: true }),
    );
  }
  return browserPromise;
}

/**
 * Runs `fn` against a page from a single shared browser instance. A fresh
 * context/page is used per call (for cookie/session isolation) but the
 * underlying browser process is launched once and reused across calls.
 */
export async function withBrowserPage<T>(
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; EnrichOS/1.0; +https://enrich-os.local)",
  });
  try {
    const page = await context.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close();
    }
  } finally {
    await context.close();
  }
}

/** Closes the shared browser. Intended for graceful shutdown / tests. */
export async function closeBrowserPool(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
