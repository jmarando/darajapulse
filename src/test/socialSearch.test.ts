import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("Deno", { env: { get: (name: string) => (name === "SCRAPECREATORS_API_KEY" ? "test-key" : undefined) } });
const { searchTikTok, searchInstagram, SEARCHES } = await import("../../supabase/functions/_shared/social-search");
afterAll(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

// The function runs on Deno, which has AbortSignal.timeout; jsdom's AbortSignal doesn't.
Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: () => new AbortController().signal });

const respondWith = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

// ScrapeCreators documents /v1/tiktok/search/keyword as returning each video wrapped as
// { aweme_info: {...} }. The id and a create_time also appear inside nested objects with other
// values, so reading the wrong level would give the wrong link or date.
const video = {
  aweme_id: "7334621391758642478",
  desc: "Repainted the whole house last weekend, worth it",
  create_time: 1707724682,
  author: { unique_id: "paintfan254" },
  statistics: { aweme_id: "7334621391758642478", play_count: 31677, share_count: 12 },
  music: { create_time: 1600000000 },
};

const found = {
  url: "https://www.tiktok.com/@paintfan254/video/7334621391758642478",
  source: "tiktok",
  title: "Repainted the whole house last weekend, worth it",
  snippet: "Repainted the whole house last weekend, worth it",
  publishedAt: "2024-02-12T07:58:02.000Z",
  author: "@paintfan254",
  reach: 31677,
  shares: 12,
};

describe("TikTok keyword search", () => {
  it("reads videos that come wrapped in aweme_info, as ScrapeCreators documents", async () => {
    respondWith({ success: true, search_item_list: [{ aweme_info: video }] });
    expect(await searchTikTok("paint")).toEqual([found]);
  });

  it("still reads a video that comes unwrapped", async () => {
    respondWith({ success: true, search_item_list: [video] });
    expect(await searchTikTok("paint")).toEqual([found]);
  });

  it("says so when results come back but none can be read, instead of reporting nothing found", async () => {
    respondWith({ success: true, search_item_list: [{ aweme_info: { desc: "no id, no link" } }, { unexpected: true }] });
    await expect(searchTikTok("paint")).rejects.toThrow(/TikTok/);
  });

  it("returns an empty list, without an error, when TikTok finds nothing", async () => {
    respondWith({ success: true, search_item_list: [] });
    expect(await searchTikTok("paint")).toEqual([]);
  });
});

// ScrapeCreators documents /v2/instagram/reels/search as returning { reels: [...] } with the
// reel's caption, owner.username, taken_at and counts. It reports no view count, and the date
// window is a best-effort Google-indexed filter rather than every reel posted.
const reel = {
  id: "3723045213787686915",
  shortcode: "DOq6eV6iIgD",
  url: "https://www.instagram.com/reel/DOq6eV6iIgD/",
  caption: "Tried the new flavour at the market today",
  taken_at: "2025-09-16T16:56:45.000Z",
  owner: { username: "marketfan254", follower_count: 188406 },
  like_count: 3487,
  comment_count: 90,
};

const instagramFound = {
  url: "https://www.instagram.com/reel/DOq6eV6iIgD/",
  source: "instagram",
  title: "Tried the new flavour at the market today",
  snippet: "Tried the new flavour at the market today",
  publishedAt: "2025-09-16T16:56:45.000Z",
  author: "@marketfan254",
  reach: null,
  shares: null,
};

describe("Instagram keyword search", () => {
  it("reads reels from the documented response", async () => {
    respondWith({ success: true, reels: [reel] });
    expect(await searchInstagram("flavour")).toEqual([instagramFound]);
  });

  it("builds the reel link from the shortcode when no url comes back", async () => {
    respondWith({ success: true, reels: [{ ...reel, url: undefined }] });
    expect(await searchInstagram("flavour")).toEqual([instagramFound]);
  });

  it("says so when reels come back but none can be read", async () => {
    respondWith({ success: true, reels: [{ unexpected: true }, { caption: "no link" }] });
    await expect(searchInstagram("flavour")).rejects.toThrow(/Instagram/);
  });

  it("returns an empty list, without an error, when Instagram finds nothing", async () => {
    respondWith({ success: true, reels: [] });
    expect(await searchInstagram("flavour")).toEqual([]);
  });

  it("asks for the last week only, within the documented date windows", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ success: true, reels: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchInstagram("flavour");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v2/instagram/reels/search");
    expect(url.searchParams.get("date_posted")).toBe("last-week");
  });
});

describe("search credits", () => {
  it("keeps the page's credits-per-search equal to the searches each keyword runs", async () => {
    const { CREDITS_PER_SEARCH } = await import("../../src/lib/listening");
    expect(SEARCHES).toHaveLength(4);
    expect(CREDITS_PER_SEARCH).toBe(SEARCHES.length);
  });
});
