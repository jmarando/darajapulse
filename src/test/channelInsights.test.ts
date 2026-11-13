import { describe, expect, it, vi } from "vitest";
import {
  insightTarget, mapYouTubeChannel, mapYouTubeVideos, median, pullYouTube, readChannel, summarise,
} from "../../supabase/functions/_shared/channel-insights";
import type { MappedPost } from "../../supabase/functions/_shared/brand-sources";
import type { ScCall } from "../../supabase/functions/_shared/brand-pull";
import { baseName, bestTypicalViews, fmtCadence, groupListings, groupReach, type Listing } from "@/lib/storefront";

const now = Date.parse("2026-11-13T09:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const channel = { external_id: "1", display_name: "K24TV", avatar_url: "https://cdn/a.jpg", followers: 1_000_000 };

function post(id: string, days: number, m: Partial<MappedPost["metrics"]> = {}, extra: Partial<MappedPost> = {}): MappedPost {
  return {
    external_id: id, url: `https://x/${id}`, posted_at: ago(days), format: "video", caption: `Post ${id}`, thumbnail_url: `https://cdn/${id}.jpg`,
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null, reach: null, views_paid: null, ...m },
    ...extra,
  };
}

describe("summarise: what an account's latest posts say", () => {
  it("gives the typical post, how often it posts and engagement as a share of views", () => {
    const posts = [
      post("a", 1, { views: 1000, likes: 50, comments: 10, shares: 0 }),
      post("b", 2, { views: 3000, likes: 100, comments: 20, shares: 30 }),
      post("c", 3, { views: 2000, likes: 80, comments: 0, shares: 0 }),
      post("d", 6, { views: 500, likes: 5, comments: 0, shares: 0 }),
    ];
    const r = summarise(channel, posts, now);
    expect(r.summary.posts).toBe(4);
    expect(r.summary.median_views).toBe(1500);
    expect(r.summary.posts_per_week).toBe(4.7); // 4 posts over the 6 days since the oldest
    // (60 + 150 + 80 + 5) / (1000 + 3000 + 2000 + 500)
    expect(r.summary.engagement_rate).toBe(4.54);
    expect(r.summary.engagement_basis).toBe("views");
    expect(r.summary.latest_post_at).toBe(ago(1));
    expect(r.account).toEqual({ name: "K24TV", followers: 1_000_000, avatar_url: "https://cdn/a.jpg" });
  });

  it("charts the latest twelve oldest first without pictures, and keeps the three most viewed with theirs", () => {
    const posts = Array.from({ length: 15 }, (_, n) => post(`p${n}`, n + 1, { views: (n + 1) * 100, likes: 1 }));
    const r = summarise(channel, posts, now);
    expect(r.recent).toHaveLength(12);
    expect(r.recent[0].posted_at).toBe(ago(12));
    expect(r.recent[11].posted_at).toBe(ago(1));
    expect(r.recent.every((p) => p.thumbnail_url === null)).toBe(true);
    expect(r.top.map((p) => p.views)).toEqual([1500, 1400, 1300]);
    expect(r.top[0].thumbnail_url).toBe("https://cdn/p14.jpg");
  });

  it("leaves out posts older than 90 days, posts with no date and repeats", () => {
    const posts = [post("a", 1, { views: 10 }), post("a", 1, { views: 10 }), post("old", 120, { views: 99 }), post("nodate", 0, { views: 5 }, { posted_at: null })];
    expect(summarise(channel, posts, now).summary.posts).toBe(1);
  });

  it("gives no typical figure from fewer than three posts: two aren't a pattern", () => {
    const r = summarise(channel, [post("a", 1, { views: 10, likes: 1 }), post("b", 2, { views: 20, likes: 2 })], now);
    expect(r.summary.median_views).toBeNull();
    expect(r.summary.posts_per_week).toBeNull();
    expect(r.summary.engagement_rate).toBeNull();
  });

  it("falls back to followers where the platform gives no views, and ranks the best posts by interactions", () => {
    const posts = [post("a", 1, { likes: 100, comments: 10 }), post("b", 2, { likes: 300 }), post("c", 3, { likes: 200, shares: 50 })];
    const r = summarise({ ...channel, followers: 10_000 }, posts, now);
    expect(r.summary.median_views).toBeNull();
    expect(r.summary.median_interactions).toBe(250);
    expect(r.summary.engagement_rate).toBe(2.5);
    expect(r.summary.engagement_basis).toBe("followers");
    expect(r.top.map((p) => p.interactions)).toEqual([300, 250, 110]);
  });

  it("says a quiet account is quiet: the rate runs to today, not to its last post", () => {
    const posts = [post("a", 60, { views: 1 }), post("b", 70, { views: 1 }), post("c", 80, { views: 1 })];
    expect(summarise(channel, posts, now).summary.posts_per_week).toBe(0.3);
  });

  it("finds the middle of a list", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("which listings can be read", () => {
  it("reads TikTok, Instagram, Facebook and YouTube accounts, not X, radio or display names", () => {
    expect(insightTarget("tiktok", "@k24tvdigital")).toEqual({ platform: "tiktok", handle: "k24tvdigital" });
    expect(insightTarget("facebook", "/K24TVNews")).toEqual({ platform: "facebook", handle: "k24tvnews" });
    expect(insightTarget("youtube", "@KamemeTv")).toEqual({ platform: "youtube", handle: "KamemeTv" });
    expect(insightTarget("twitter", "@K24Tv")).toBeNull();
    expect(insightTarget("radio", "Kameme FM")).toBeNull();
    expect(insightTarget("facebook", "Man Nyari - original")).toBeNull();
    expect(insightTarget("instagram", null)).toBeNull();
  });
});

describe("YouTube", () => {
  const channelAnswer = {
    status: 200,
    json: {
      success: true, channelId: "UCt3", name: "K24TV", subscriberCount: 1_510_000,
      avatar: { image: { sources: [{ url: "https://yt3.googleusercontent.com/abc=s72-c-k", width: 72 }] } },
    },
  };
  const videosAnswer = {
    status: 200,
    json: {
      success: true,
      videos: [
        { id: "v1", url: "https://www.youtube.com/watch?v=v1", title: "Bulletin", thumbnail: "https://i.ytimg.com/vi/v1/hq.jpg", viewCountInt: 5400, publishedTime: ago(1) },
        { id: "v2", title: "Live", viewCountInt: 900, publishedTime: "not a date" },
        { title: "no id" },
      ],
      continuationToken: "next",
    },
  };

  it("maps the channel with a bigger picture, and its videos with views", () => {
    expect(mapYouTubeChannel(channelAnswer.json)).toEqual({
      external_id: "UCt3", display_name: "K24TV", avatar_url: "https://yt3.googleusercontent.com/abc=s800-c-k", followers: 1_510_000,
    });
    const page = mapYouTubeVideos(videosAnswer.json);
    expect(page.cursor).toBe("next");
    expect(page.posts).toHaveLength(2);
    expect(page.posts[0]).toMatchObject({ external_id: "v1", posted_at: ago(1), caption: "Bulletin", metrics: { views: 5400, likes: null } });
    expect(page.posts[1]).toMatchObject({ url: "https://www.youtube.com/watch?v=v2", posted_at: null });
  });

  it("asks for the channel, then its latest videos", async () => {
    const call = vi.fn<ScCall>(async (path) => (path === "/v1/youtube/channel" ? channelAnswer : videosAnswer));
    const r = await pullYouTube("K24tv", call);
    expect(call.mock.calls).toEqual([["/v1/youtube/channel", { handle: "K24tv" }], ["/v1/youtube/channel-videos", { handle: "K24tv", sort: "latest" }]]);
    expect(r.ok && r.posts.length).toBe(2);
  });

  it("stops at an unknown channel or an empty balance, and keeps the channel when only the videos fail", async () => {
    expect(await pullYouTube("nobody", async () => ({ status: 404, json: { success: false } }))).toMatchObject({ ok: false, kind: "not_found" });
    expect(await pullYouTube("x", async () => ({ status: 402, json: {} }))).toMatchObject({ ok: false, kind: "out_of_credits" });
    const r = await pullYouTube("K24tv", async (path) => (path === "/v1/youtube/channel" ? channelAnswer : { status: 500, json: {} }));
    expect(r).toMatchObject({ ok: true, posts: [] });
  });
});

describe("readChannel", () => {
  it("reads one page of TikTok videos, not the brand report's six", async () => {
    const call = vi.fn<ScCall>(async (path) => (path === "/v1/tiktok/profile"
      ? { status: 200, json: { user: { id: "1", nickname: "K24TV" }, stats: { followerCount: 973_200 } } }
      : { status: 200, json: { aweme_list: [{ aweme_id: "a", create_time: Math.floor((now - DAY) / 1000), statistics: { play_count: 9 } }], max_cursor: 5 } }));
    const r = await readChannel({ platform: "tiktok", handle: "k24tvdigital" }, call, now);
    expect(call).toHaveBeenCalledTimes(2);
    expect(r.ok && r.channel.followers).toBe(973_200);
  });

  it("reads four Facebook pages of posts and one of reels", async () => {
    const call = vi.fn<ScCall>(async (path) => {
      if (path === "/v1/facebook/profile") return { status: 200, json: { id: "3", name: "K24", followerCount: 30 } };
      if (path === "/v1/facebook/profile/reels") return { status: 200, json: { reels: [], cursor: "r" } };
      return { status: 200, json: { posts: [{ id: `p${call.mock.calls.length}`, publishTime: Math.floor((now - DAY) / 1000), reactionCount: 1 }], cursor: "c" } };
    });
    await readChannel({ platform: "facebook", handle: "k24tvnews" }, call, now);
    expect(call.mock.calls.filter(([p]) => p === "/v1/facebook/profile/posts")).toHaveLength(4);
    expect(call.mock.calls.filter(([p]) => p === "/v1/facebook/profile/reels")).toHaveLength(1);
  });
});

const listing = (over: Partial<Listing>): Listing => ({ id: over.title ?? "x", kind: "owned_account", title: "x", ...over });

describe("storefront cards", () => {
  it("names the station or person behind an account", () => {
    expect(baseName("Kiss 100 on Instagram")).toBe("Kiss 100");
    expect(baseName("Jeff Kuria — TikTok")).toBe("Jeff Kuria");
    expect(baseName("K24 TV on X")).toBe("K24 TV");
    expect(baseName("Classic 105: 10-minute interview")).toBe("Classic 105: 10-minute interview");
    expect(baseName("Man Nyari")).toBe("Man Nyari");
  });

  it("shows a station's accounts as one card led by its biggest, and leaves other listings alone", () => {
    const items = [
      listing({ id: "1", title: "K24 TV on Facebook", platform: "facebook", follower_count: 900 }),
      listing({ id: "2", title: "Milele FM on TikTok", platform: "tiktok", follower_count: 800, cover_url: "/m.webp" }),
      listing({ id: "3", title: "K24 TV on TikTok", platform: "tiktok", follower_count: 973_200, cover_url: "/k24.webp" }),
      listing({ id: "4", kind: "influencer", title: "Jeff Kuria — TikTok", platform: "tiktok", follower_count: 348_200 }),
      listing({ id: "5", kind: "influencer", title: "Jeff Kuria — Instagram", platform: "instagram", follower_count: 199_732 }),
      listing({ id: "6", kind: "ad_slot", title: "K24 TV on X", platform: "tv" }),
      listing({ id: "7", kind: "ad_slot", title: "K24 TV on X", platform: "tv" }),
    ];
    const groups = groupListings(items);
    expect(groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      ["K24 TV", ["3", "1"]], ["Milele FM", ["2"]], ["Jeff Kuria", ["4", "5"]], ["K24 TV on X", ["6"]], ["K24 TV on X", ["7"]],
    ]);
    expect(groups[0].lead.id).toBe("3");
    expect(groups[0].cover).toBe("/k24.webp");
    expect(groupReach(groups[0])).toBe(974_100);
  });

  it("lists a card's accounts biggest first, whatever order the rows arrive in", () => {
    const rows = [
      listing({ id: "ig", kind: "influencer", title: "Brian Amwai", platform: "instagram", follower_count: 1_404 }),
      listing({ id: "tt", kind: "influencer", title: "Brian Amwai", platform: "tiktok", follower_count: 15_600 }),
      listing({ id: "fb", kind: "influencer", title: "Brian Amwai", platform: "facebook", follower_count: 5_000 }),
      listing({ id: "x", kind: "influencer", title: "Brian Amwai", platform: "twitter" }),
    ];
    const order = (items: Listing[]) => groupListings(items)[0].items.map((i) => i.id);
    expect(order(rows)).toEqual(["tt", "fb", "ig", "x"]);
    expect(order([...rows].reverse())).toEqual(["tt", "fb", "ig", "x"]);
  });

  it("borrows another account's picture when the biggest has none", () => {
    const [g] = groupListings([
      listing({ id: "1", kind: "influencer", title: "Man Nyari on Facebook", follower_count: 746_000 }),
      listing({ id: "2", kind: "influencer", title: "Man Nyari on TikTok", follower_count: 314_700, cover_url: "/mn.jpg" }),
    ]);
    expect(g.lead.id).toBe("1");
    expect(g.cover).toBe("/mn.jpg");
  });

  it("gives the best typical post among accounts that have been read", () => {
    const summary = (median_views: number | null) => ({ posts: 12, posts_per_week: 7, median_views, median_interactions: null, engagement_rate: null, engagement_basis: null, latest_post_at: null });
    expect(bestTypicalViews([listing({ insights_summary: summary(1200) }), listing({ insights_summary: summary(48_000) }), listing({})])).toBe(48_000);
    expect(bestTypicalViews([listing({ insights_summary: summary(null) })])).toBeNull();
  });

  it("says how often an account posts in the unit that reads naturally", () => {
    expect(fmtCadence(9.5)).toBe("9.5 a week");
    expect(fmtCadence(3)).toBe("3 a week");
    expect(fmtCadence(70)).toBe("10 a day");
    expect(fmtCadence(0.3)).toBe("1 a month");
    expect(fmtCadence(null)).toBe("—");
  });
});
