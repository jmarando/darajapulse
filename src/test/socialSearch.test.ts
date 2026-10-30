import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("Deno", { env: { get: (name: string) => (name === "SCRAPECREATORS_API_KEY" ? "test-key" : undefined) } });
const { searchTikTok } = await import("../../supabase/functions/_shared/social-search");
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

  it("asks TikTok for this week's videos, so old ones don't fill the list", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ success: true, search_item_list: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchTikTok("paint");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/tiktok/search/keyword");
    expect(url.searchParams.get("query")).toBe("paint");
    expect(url.searchParams.get("date_posted")).toBe("this-week");
  });
});
