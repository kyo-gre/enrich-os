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

  it("splits a scraped display name into first/last name", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="Jayson Salunga David (@jaysonsdavid)">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.instagram.com/jaysonsdavid/");

    expect(outcome?.candidate?.firstName).toBe("Jayson");
    expect(outcome?.candidate?.lastName).toBe("David");
    expect(outcome?.candidate?.displayName).toBe("Jayson Salunga David");
  });

  it("rejects a blocked/placeholder response instead of treating it as a real name", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="Instagram">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.instagram.com/janedoe/");

    // A 200 response was returned and parsed successfully — but the content
    // itself is Instagram's generic unauthenticated shell, not a real
    // profile, so no candidate should be produced from it.
    expect(outcome?.candidate).toBeNull();
    expect(outcome?.error).toBeUndefined();
  });

  it("rejects a login-wall page for any platform (e.g. Facebook)", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<title>Log into Facebook</title>`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.facebook.com/janedoe");

    expect(outcome?.platform).toBe("facebook");
    expect(outcome?.candidate).toBeNull();
  });

  it("cleans emoji and business descriptors out of a scraped display name", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="Cher✨Aslor (@cheraslor)">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.instagram.com/cheraslor/");

    expect(outcome?.candidate?.displayName).toBe("Cher Aslor");
    expect(outcome?.candidate?.firstName).toBe("Cher");
    expect(outcome?.candidate?.lastName).toBe("Aslor");
  });

  it("folds stylized Unicode font characters in a scraped display name", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="\u{1D4A5}\u{1D4CA}\u{1D4C1}\u{1D4BE}\u{1D4B6}\u{1D4C3}\u{1D4C3}\u{1D452} (@juliannepilates)">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.instagram.com/juliannepilates/");

    expect(outcome?.candidate?.firstName).toBe("Julianne");
  });

  it("title-cases an ALL-CAPS scraped display name", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="BLEV (@blevwanders)">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.instagram.com/blevwanders/");

    expect(outcome?.candidate?.firstName).toBe("Blev");
  });

  it("produces a facebook candidate as real evidence when the page returns a real title", async () => {
    mockedFetch.mockResolvedValueOnce({
      html: `<meta property="og:title" content="Jane Doe">`,
      fetchedVia: "static",
    });

    const outcome = await scrapeProfile("https://www.facebook.com/janedoe");

    expect(outcome?.candidate?.source).toBe("facebook");
    expect(outcome?.candidate?.firstName).toBe("Jane");
    expect(outcome?.candidate?.lastName).toBe("Doe");
  });
});
