import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  channelIsDue, cleanCaption, count, facebookPageUrl, facebookPostKey, mapFacebookPosts, mapFacebookProfile, mapFacebookReels,
  mapInstagramPosts, mapInstagramProfile, mapTikTokProfile, mapTikTokVideos, maxPublicCalls, mergeFacebookReels,
  normaliseHandle, pullMode,
} from "../../supabase/functions/_shared/brand-sources";

const ok = (platform: Parameters<typeof normaliseHandle>[0], input: string) => (normaliseHandle(platform, input) as { handle: string }).handle;
const err = (platform: Parameters<typeof normaliseHandle>[0], input: string) => (normaliseHandle(platform, input) as { error: string }).error;

describe("normaliseHandle", () => {
  it("cleans up what people paste", () => {
    expect(ok("tiktok", "@AcmeKenya")).toBe("acmekenya");
    expect(ok("tiktok", "https://www.tiktok.com/@AcmeKenya?lang=en")).toBe("acmekenya");
    expect(ok("instagram", "instagram.com/acme.kenya/")).toBe("acme.kenya");
    expect(ok("instagram", "  acme_kenya ")).toBe("acme_kenya");
    expect(ok("facebook", "https://m.facebook.com/AcmeKenya/")).toBe("acmekenya");
    expect(ok("facebook", "https://www.facebook.com/profile.php?id=61551234567890")).toBe("61551234567890");
    expect(ok("facebook", "https://www.facebook.com/people/Acme-Kenya/61551234567890/")).toBe("61551234567890");
    expect(ok("facebook", "https://www.facebook.com/pages/Acme-Kenya/104359362513119")).toBe("104359362513119");
  });

  it("refuses a link to a post in plain words", () => {
    expect(err("instagram", "https://www.instagram.com/p/DKSMEpKRd6h/")).toMatch(/link to a post/);
    expect(err("instagram", "https://www.instagram.com/reel/DKSMEpKRd6h/")).toMatch(/link to a post/);
    expect(err("facebook", "https://www.facebook.com/share/p/abc")).toMatch(/link to a post/);
    expect(err("facebook", "https://www.facebook.com/acmekenya/posts/pfbid02abc")).toMatch(/link to a post/);
    expect(err("tiktok", "https://www.tiktok.com/@acme/video/7517114944362499342")).toMatch(/link to a post/);
    expect(err("facebook", "https://www.facebook.com/photo.php?fbid=123")).toMatch(/link to a post/);
    expect(err("facebook", "https://www.facebook.com/video.php?v=123")).toMatch(/link to a post/);
  });

  it("refuses a link to another platform, and names it", () => {
    expect(err("tiktok", "https://www.instagram.com/acme")).toMatch(/Instagram/);
    expect(err("instagram", "facebook.com/acme")).toMatch(/Facebook/);
  });

  it("refuses nothing at all, and things that can't be a handle", () => {
    expect(err("tiktok", "   ")).toBeTruthy();
    expect(err("tiktok", "has space")).toBeTruthy();
    expect(err("tiktok", "https://example.test/acme")).toBeTruthy();
    expect(err("facebook", "https://www.facebook.com/")).toBeTruthy();
  });
});

describe("facebookPageUrl", () => {
  it("builds a page address from a name or an id", () => {
    expect(facebookPageUrl("acmekenya")).toBe("https://www.facebook.com/acmekenya");
    expect(facebookPageUrl("61551234567890")).toBe("https://www.facebook.com/profile.php?id=61551234567890");
  });
});

describe("channelIsDue", () => {
  const now = Date.parse("2026-11-04T01:00:00Z");
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const row = (last_pull_at: string | null, last_good_pull_at: string | null, status = "ok") => ({ last_pull_at, last_good_pull_at, status });

  it("is due when never read, or last read over 20 hours ago", () => {
    expect(channelIsDue(row(null, null), now)).toBe(true);
    expect(channelIsDue(row(ago(19), ago(19)), now)).toBe(false);
    expect(channelIsDue(row(ago(21), ago(21)), now)).toBe(true);
  });

  it("leaves a wrong handle alone, so it doesn't spend credits every night", () => {
    expect(channelIsDue(row(ago(30), null, "error"), now)).toBe(false);
  });

  it("keeps trying an account that worked once, since it may come back", () => {
    expect(channelIsDue(row(ago(21), ago(40), "error"), now)).toBe(true);
  });
});

describe("pullMode", () => {
  const good = { last_good_pull_at: "2026-10-01T00:00:00Z" };

  it("reads further back on the first good pull", () => {
    expect(pullMode({ last_good_pull_at: null }, Date.parse("2026-11-09T10:00:00Z"))).toBe("first");
  });

  it("reads further back on Sundays in Nairobi", () => {
    expect(pullMode(good, Date.parse("2026-11-07T22:00:00Z"))).toBe("deep"); // Saturday in UTC, Sunday 01:00 in Nairobi
    expect(pullMode(good, Date.parse("2026-11-08T20:59:00Z"))).toBe("deep");
    expect(pullMode(good, Date.parse("2026-11-08T21:00:00Z"))).toBe("nightly"); // Monday 00:00 in Nairobi
    expect(pullMode(good, Date.parse("2026-11-09T10:00:00Z"))).toBe("nightly");
  });
});

describe("maxPublicCalls", () => {
  it("counts the most calls a pull can make", () => {
    expect(maxPublicCalls("facebook", "nightly")).toBe(7); // profile, 5 post pages, 1 reel page
    expect(maxPublicCalls("facebook", "first")).toBe(34);
    expect(maxPublicCalls("tiktok", "nightly")).toBe(3);
    expect(maxPublicCalls("instagram", "first")).toBe(9);
  });
});

describe("cleanCaption", () => {
  it("makes any caption safe to store", () => {
    expect(cleanCaption("a\u0000b")).toBe("ab");
    expect(cleanCaption("a\ud83d")).toBe("a"); // half an emoji
    expect(Array.from(cleanCaption("😀".repeat(600))!).length).toBe(500); // cut by character, not by code unit
    expect(cleanCaption("   ")).toBeNull();
    expect(cleanCaption(42)).toBeNull();
    expect(cleanCaption(null)).toBeNull();
  });
});

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `fixtures/scrapecreators/${name}.json`), "utf8"));

describe("profiles from ScrapeCreators", () => {
  it("reads a TikTok profile", () => {
    expect(mapTikTokProfile(fixture("tiktok-profile"))).toEqual({
      external_id: "6659752019493208069", display_name: "Acme Kenya", avatar_url: "https://cdn.example.test/tt-avatar.jpg", followers: 4100,
    });
  });

  it("reads an Instagram profile", () => {
    expect(mapInstagramProfile(fixture("instagram-profile"))).toEqual({
      external_id: "2700692569", display_name: "Acme Kenya", avatar_url: "https://cdn.example.test/ig-avatar.jpg", followers: 24555,
    });
  });

  it("reads a Facebook profile, with the page id from the ad library", () => {
    expect(mapFacebookProfile(fixture("facebook-profile"))).toEqual({
      external_id: "104359362513119", display_name: "Acme Kenya", avatar_url: "https://cdn.example.test/fb-avatar.jpg", followers: 3200,
    });
  });

  it("falls back to page likes when Facebook shows no follower count", () => {
    const json = fixture("facebook-profile");
    delete json.followerCount;
    expect(mapFacebookProfile(json).followers).toBe(3224);
  });

  it("keeps followers null when no count came back, never 0", () => {
    const json = fixture("tiktok-profile");
    delete json.stats;
    expect(mapTikTokProfile(json).followers).toBeNull();
  });
});

describe("TikTok videos from ScrapeCreators", () => {
  const page = () => mapTikTokVideos(fixture("tiktok-videos"));

  it("maps every column of a video", () => {
    expect(page().posts[0]).toEqual({
      external_id: "7517114944362499342",
      url: "https://www.tiktok.com/@acmekenya/video/7517114944362499342",
      posted_at: new Date(1760000000 * 1000).toISOString(),
      format: "video",
      caption: "A new recipe",
      thumbnail_url: "https://cdn.example.test/tt-cover.jpg",
      metrics: { views: 5599, likes: 596, comments: 58, shares: 41, saves: 15, reach: null, views_paid: null },
    });
  });

  it("adds WhatsApp shares to TikTok shares", () => {
    expect(page().posts[0].metrics.shares).toBe(34 + 7);
  });

  it("knows a photo post, and keeps a real 0", () => {
    const [, photo] = page().posts;
    expect(photo.format).toBe("photo");
    expect(photo.metrics.likes).toBe(0);
    expect(photo.thumbnail_url).toBeNull();
  });

  it("keeps a missing count null, never 0", () => {
    const json = fixture("tiktok-videos");
    delete json.aweme_list[0].statistics.play_count;
    delete json.aweme_list[0].statistics.share_count;
    delete json.aweme_list[0].statistics.whatsapp_share_count;
    const { views, shares } = mapTikTokVideos(json).posts[0].metrics;
    expect(views).toBeNull();
    expect(shares).toBeNull();
  });

  it("gives the next cursor, and none when TikTok says there is no more", () => {
    expect(page().cursor).toBe("1748286476000");
    const json = fixture("tiktok-videos");
    json.has_more = false;
    expect(mapTikTokVideos(json).cursor).toBeNull();
  });

  it("cleans captions, and drops a row with no id", () => {
    const json = fixture("tiktok-videos");
    json.aweme_list[0].desc = "a\u0000b";
    delete json.aweme_list[1].aweme_id;
    const { posts } = mapTikTokVideos(json);
    expect(posts).toHaveLength(1);
    expect(posts[0].caption).toBe("ab");
  });

  it("copes with an answer that has no list", () => {
    expect(mapTikTokVideos({ success: true })).toEqual({ posts: [], cursor: null });
  });

  it("stops at a has_more of 0, and treats a cursor of 0 as none, so a feed isn't read again from the start", () => {
    expect(mapTikTokVideos({ has_more: 0, max_cursor: 123, aweme_list: [] }).cursor).toBeNull();
    expect(mapTikTokVideos({ has_more: 1, max_cursor: 0, aweme_list: [] }).cursor).toBeNull();
    expect(mapTikTokVideos({ has_more: 1, max_cursor: 123, aweme_list: [] }).cursor).toBe("123");
  });

  it("reads a timestamp in milliseconds as well as seconds", () => {
    const json = fixture("tiktok-videos");
    json.aweme_list[0].create_time = 1760000000000;
    expect(mapTikTokVideos(json).posts[0].posted_at).toBe(new Date(1760000000 * 1000).toISOString());
  });
});

describe("Instagram posts from ScrapeCreators", () => {
  const page = () => mapInstagramPosts(fixture("instagram-posts"));

  it("maps every column of a reel, keyed by its shortcode", () => {
    expect(page().posts[0]).toEqual({
      external_id: "DKSMEpKRd6h",
      url: "https://www.instagram.com/p/DKSMEpKRd6h/",
      posted_at: new Date(1760000000 * 1000).toISOString(),
      format: "video",
      caption: "A reel",
      thumbnail_url: "https://cdn.example.test/ig-reel.jpg",
      metrics: { views: 2647, likes: 29, comments: 7, shares: null, saves: null, reach: null, views_paid: null },
    });
  });

  it("gives a photo no views, and finds its picture in the other place", () => {
    const [, photo] = page().posts;
    expect(photo.format).toBe("photo");
    expect(photo.metrics.views).toBeNull();
    expect(photo.thumbnail_url).toBe("https://cdn.example.test/ig-photo.jpg");
  });

  it("knows a carousel, with no caption", () => {
    const [, , carousel] = page().posts;
    expect(carousel.format).toBe("carousel");
    expect(carousel.caption).toBeNull();
  });

  it("gives the next cursor, and none when Instagram says there is no more", () => {
    expect(page().cursor).toBe("3639831059405682409_59042353222");
    const json = fixture("instagram-posts");
    json.more_available = false;
    expect(mapInstagramPosts(json).cursor).toBeNull();
  });
});

describe("Facebook posts from ScrapeCreators", () => {
  const page = () => mapFacebookPosts(fixture("facebook-posts"));

  it("maps every column of a reel post, leaving shares and saves null", () => {
    expect(page().posts[0]).toEqual({
      external_id: "1204545088344463",
      url: "https://www.facebook.com/reel/486651220706068/",
      posted_at: new Date(1760000000 * 1000).toISOString(),
      format: "video",
      caption: "A reel post",
      thumbnail_url: "https://cdn.example.test/fb-reel.jpg",
      metrics: { views: null, likes: 133, comments: 12, shares: null, saves: null, reach: null, views_paid: null },
    });
  });

  it("reads a post id the way Meta writes it", () => {
    expect(facebookPostKey("123_456")).toBe("456");
    expect(facebookPostKey("456")).toBe("456");
    expect(page().posts[1].external_id).toBe("1204545088344464");
  });

  it("doesn't call a post a video because of an empty video field", () => {
    const json = fixture("facebook-posts");
    json.posts[1].videoDetails = { sdUrl: null, hdUrl: null, thumbnailUrl: null };
    expect(mapFacebookPosts(json).posts[1].format).toBe("photo");
  });

  it("finds a picture however the list gives it", () => {
    const json = fixture("facebook-posts");
    json.posts[1].images = ["https://cdn.example.test/as-text.jpg"];
    expect(mapFacebookPosts(json).posts[1]).toMatchObject({ format: "photo", thumbnail_url: "https://cdn.example.test/as-text.jpg" });
    json.posts[1].images = [{ uri: "https://cdn.example.test/as-uri.jpg" }];
    expect(mapFacebookPosts(json).posts[1].thumbnail_url).toBe("https://cdn.example.test/as-uri.jpg");
  });

  it("tells a photo from words alone, and reads the link from either field", () => {
    const [, photo, words] = page().posts;
    expect(photo.format).toBe("photo");
    expect(photo.metrics.likes).toBe(0);
    expect(words.format).toBe("other"); // the public list can't tell words alone from a picture it doesn't show
    expect(words.url).toBe("https://www.facebook.com/acmekenya/posts/pfbid02def");
  });

  it("gives the next cursor", () => {
    expect(page().cursor).toBe("Cg8Ob3JnYW5pY19jdXJzb3I");
  });
});

describe("Facebook reels from ScrapeCreators", () => {
  it("reads the reel list and both cursors", () => {
    const { reels, cursor, next_page_id } = mapFacebookReels(fixture("facebook-reels"));
    expect(reels[0]).toEqual({
      video_id: "486651220706068",
      post_id: "1203161005161463",
      url: "https://www.facebook.com/reel/486651220706068",
      views: 900,
      posted_at: "2026-10-09T08:53:20.000Z",
      caption: "A reel",
      thumbnail_url: "https://cdn.example.test/fb-reel-2.jpg",
    });
    expect(cursor).toBe("AQHSiBn76EsmuU");
    expect(next_page_id).toBe("YXBwX2NvbGxlY");
  });

  const reel = (video_id: string, views: number, post_id: string | null = null) => ({ video_id, post_id, url: `https://www.facebook.com/reel/${video_id}`, views, posted_at: "2026-10-09T08:53:20.000Z", caption: "R", thumbnail_url: null });

  it("puts a reel's views on the post with that reel id, and adds a reel with no post", () => {
    const post = mapFacebookPosts(fixture("facebook-posts")).posts[0]; // its link holds reel 486651220706068
    const merged = mergeFacebookReels([post], [reel("486651220706068", 900), reel("222", 50)]);
    expect(merged).toHaveLength(2);
    expect(merged[0].metrics).toMatchObject({ views: 900, likes: 133 });
    expect(merged[1]).toMatchObject({ external_id: "222", format: "video", metrics: { views: 50, likes: null } });
  });

  it("finds a reel's post by its post id when the link doesn't show the reel", () => {
    const post = mapFacebookPosts(fixture("facebook-posts")).posts[1]; // a /posts/ link, id 1204545088344464
    const merged = mergeFacebookReels([post], [reel("999", 70, "1204545088344464")]);
    expect(merged).toHaveLength(1);
    expect(merged[0].metrics.views).toBe(70);
  });

  it("keys a reel with no post by its post id, so a later read of that post updates the same row", () => {
    expect(mergeFacebookReels([], [reel("999", 70, "555")])[0].external_id).toBe("555");
    expect(mergeFacebookReels([], [reel("999", 70, "100_555")])[0].external_id).toBe("555");
    expect(mergeFacebookReels([], [reel("999", 70)])[0].external_id).toBe("999");
  });

  it("doesn't match a reel to a link holding a longer reel id", () => {
    const post = { ...mapFacebookPosts(fixture("facebook-posts")).posts[0], url: "https://www.facebook.com/reel/1234/" };
    expect(mergeFacebookReels([post], [reel("123", 70)])).toHaveLength(2);
  });

  it("keeps a view count the post already has", () => {
    const post = mapFacebookPosts(fixture("facebook-posts")).posts[0];
    post.metrics.views = 1000;
    expect(mergeFacebookReels([post], [reel("486651220706068", 900)])[0].metrics.views).toBe(1000);
  });
});

describe("count", () => {
  it("takes a number or a numeric string, and a real 0", () => {
    expect(count(12)).toBe(12);
    expect(count("12")).toBe(12);
    expect(count(0)).toBe(0);
  });

  it("treats anything else as unknown, never 0", () => {
    for (const v of [null, undefined, "", " ", "abc", [], {}, true, -1]) expect(count(v)).toBeNull();
  });
});
