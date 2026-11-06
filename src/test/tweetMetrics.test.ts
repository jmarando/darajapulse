import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.stubGlobal("Deno", { env: { get: () => undefined } });
const { mapTweet } = await import("../../supabase/functions/_shared/scrapecreators");
afterAll(() => vi.unstubAllGlobals());

// The shape in ScrapeCreators' Tweet Details docs, read 5 Nov 2026.
const tweet = {
  success: true,
  credits_remaining: 900,
  credits_charged: 1,
  rest_id: "1628745211",
  views: { count: "101132", state: "EnabledWithCount" },
  legacy: {
    bookmark_count: 1159,
    created_at: "Thu Feb 23 14:52:10 +0000 2023",
    favorite_count: 402,
    full_text: "I've scraped huge retailers",
    quote_count: 7,
    reply_count: 41,
    retweet_count: 30,
    entities: { media: [{ media_url_https: "https://pbs.twimg.com/media/a.jpg" }] },
  },
};

describe("X post statistics", () => {
  it("reads views, likes, replies, reposts and bookmarks", () => {
    expect(mapTweet(tweet).stats).toEqual({ views: 101132, likes: 402, comments: 41, shares: 37, saves: 1159 });
  });

  it("reads the text, the time and the picture", () => {
    expect(mapTweet(tweet)).toMatchObject({
      caption: "I've scraped huge retailers",
      postedAt: "2023-02-23T14:52:10.000Z",
      thumb: "https://pbs.twimg.com/media/a.jpg",
      creditsCharged: 1,
      creditsRemaining: 900,
    });
  });

  it("does not invent views for a post that hides them", () => {
    expect(mapTweet({ views: { state: "Enabled" }, legacy: { favorite_count: 3 } }).stats).toMatchObject({ views: 0, likes: 3 });
  });

  it("copes with a post that has no picture", () => {
    expect(mapTweet({ legacy: { full_text: "words" } }).thumb).toBeNull();
  });
});

describe("the metrics job", () => {
  const source = readFileSync("supabase/functions/fetch-public-metrics/index.ts", "utf8");

  it("sends X links to the provider instead of saying it has no scraper", () => {
    expect(source).toMatch(/isX \? "twitter"/);
  });
});

describe("contest discovery's roster check", () => {
  const source = readFileSync("supabase/functions/contest-discover-posts/index.ts", "utf8");
  const clean = new Function(`return ${source.match(/const cleanH = \(s\?: string \| null\) =>([\s\S]*?\|\| "");/)![1].replace(/\/\/.*\n/, "\n").trim().replace(/;$/, "").replace(/^\(s \|\| ""\)/, '(arguments[0] || "")')}`) as (s?: string) => string;

  it("takes the platform off an alt handle, so a paid creator's other accounts are recognised", () => {
    expect(clean("tiktok:Jane_Cooks")).toBe("jane_cooks");
    expect(clean("instagram:https://www.instagram.com/jane.ig/")).toBe("jane.ig");
  });

  it("still reads plain handles and links", () => {
    expect(clean("@jane")).toBe("jane");
    expect(clean("https://www.tiktok.com/@jane?lang=en")).toBe("jane");
  });
});
