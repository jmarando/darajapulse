import { afterEach, describe, expect, it, vi } from "vitest";
import { BLOG_FEEDS, OUTLETS } from "../../supabase/functions/_shared/news-feeds";
import { readFeeds, serperKey, serperSearch } from "../../supabase/functions/_shared/news-sources";
import { SearchRefused } from "../../supabase/functions/_shared/news-sweep";

// Fetching the news sources: every outlet's and blog's feed (bounded, best effort) and Serper's news and web search.
// fetch and Deno are stood in; nothing here calls a live service.

const rss = (url: string, title: string) => `<rss><item><title>${title}</title><link>${url}</link></item></rss>`;

// The function runs on Deno, which has AbortSignal.timeout; jsdom's AbortSignal doesn't.
Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: () => new AbortController().signal });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readFeeds", () => {
  const feedsOf = (country: "KE" | "UG") => [
    ...OUTLETS.filter((o) => o.country === country).flatMap((o) => o.feeds),
    ...BLOG_FEEDS.filter((b) => b.country === country).map((b) => b.url),
  ];

  it("reads every Kenyan feed side by side, keeps a story found twice once, and names the sites with no feed that answered", async () => {
    const first = OUTLETS.find((o) => o.country === "KE" && o.feeds.length)!;
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === first.feeds[0]) return new Response("nope", { status: 503 });
      return new Response(rss("https://example.com/same-story", "A story"), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    const out = await readFeeds(["KE"]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(feedsOf("KE"));
    expect(fetch.mock.calls.every(([, init]) => (init as RequestInit).signal instanceof AbortSignal)).toBe(true);
    expect(out.stories).toEqual([expect.objectContaining({ url: "https://example.com/same-story", country: "KE" })]);
    // An outlet with a second feed that answered is not counted as failed.
    expect(out.failed).toEqual(first.feeds.length > 1 ? [] : [first.name]);
  });

  it("reads only the countries asked for, and tags each story with its feed's country", async () => {
    const fetch = vi.fn(async (url: string) => new Response(rss(`${url}#story`, "A story"), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const out = await readFeeds(["UG"]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(feedsOf("UG"));
    expect(out.stories).toHaveLength(feedsOf("UG").length);
    expect(out.stories.every((s) => s.country === "UG")).toBe(true);
    fetch.mockClear();
    expect((await readFeeds([])).stories).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("serperKey", () => {
  it("reads the key when asked, cleaned of a pasted name, quotes and spaces", () => {
    vi.stubGlobal("Deno", { env: { get: () => ' SERPER_API_KEY="abc123" ' } });
    expect(serperKey()).toBe("abc123");
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    expect(serperKey()).toBeNull();
  });
});

describe("serperSearch", () => {
  it("asks for Kenya, English and the past week, with the key in its header", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ news: [{ title: "Nuru Coffee", link: "https://example.com/a", source: "Example" }] })));
    vi.stubGlobal("fetch", fetch);
    const pages = await serperSearch("news", "Nuru Coffee -jobs", "k-1");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://google.serper.dev/news");
    expect(JSON.parse(String(init.body))).toEqual({ q: "Nuru Coffee -jobs", gl: "ke", hl: "en", tbs: "qdr:w", num: 10 });
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("k-1");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(pages.map((p) => p.url)).toEqual(["https://example.com/a"]);
  });

  it("asks for Uganda when the brand is Ugandan", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ news: [] })));
    vi.stubGlobal("fetch", fetch);
    await serperSearch("news", "Nile Crisps", "k-1", "ug");
    expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).toEqual({ q: "Nile Crisps", gl: "ug", hl: "en", tbs: "qdr:w", num: 10 });
  });

  it("uses the web search for web pages", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ organic: [{ title: "t", link: "https://blog.example.com/p" }] })));
    vi.stubGlobal("fetch", fetch);
    const pages = await serperSearch("web", "Nuru", "k-1");
    expect(fetch.mock.calls[0][0]).toBe("https://google.serper.dev/search");
    expect(pages[0].url).toBe("https://blog.example.com/p");
  });

  it("says the search was refused when the key is wrong or the credits are gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"Not enough credits","statusCode":400}', { status: 400 })));
    await expect(serperSearch("news", "Nuru", "k-1")).rejects.toBeInstanceOf(SearchRefused);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unauthorized", { status: 403 })));
    await expect(serperSearch("news", "Nuru", "k-1")).rejects.toBeInstanceOf(SearchRefused);
  });

  it("fails plainly, without refusing, on any other trouble", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 500 })));
    const err = await serperSearch("news", "Nuru", "k-1").catch((e) => e);
    expect(err).not.toBeInstanceOf(SearchRefused);
    expect((err as Error).message).toBe("the search answered 500");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    await expect(serperSearch("news", "Nuru", "k-1")).rejects.toThrow("the search's answer could not be read");
  });
});
