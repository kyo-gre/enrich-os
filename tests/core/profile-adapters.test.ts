import { describe, expect, it, vi } from "vitest";
import { scrapeProfile } from "../../core/profiles/adapters";

vi.mock("../../core/profiles/fetcher/fetch-escalation", () => ({
  fetchProfileHtml: vi.fn(),
}));

const { fetchProfileHtml } = await import(
  "../../core/profiles/fetcher/fetch-escalation"
);
const mockedFetch = vi.mocked(fetchProfileHtml);

describe("scrapeProfile", () => {
  it("returns null for a missing profile URL", async () => {
    const outcome = await scrapeProfile(undefined);
    expect(outcome).toBeNull();
  });

  it("produces an instagram candidate as additional evidence, not an override", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="Jenn V (@jennv)"><meta property="og:description" content="hi">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.instagram.com/jennv/");

    expect(outcome?.platform).toBe("instagram");
    expect(outcome?.candidate?.source).toBe("instagram");
    expect(outcome?.candidate?.displayName).toBe("Jenn V");
    expect(outcome?.error).toBeUndefined();
  });

  it("falls back to the generic adapter for unrecognized platforms without failing the pipeline", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<title>Jane's Linktree</title>`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://linktr.ee/jane");

    expect(outcome?.platform).toBe("generic");
    expect(outcome?.candidate?.source).toBe("generic_scrape");
  });

  it("reports a failure without throwing when the fetch escalation errors", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("blocked by platform"));

    const outcome = await scrapeProfile("https://www.instagram.com/janedoe/");

    expect(outcome?.candidate).toBeNull();
    expect(outcome?.error).toBe("blocked by platform");
  });
});
