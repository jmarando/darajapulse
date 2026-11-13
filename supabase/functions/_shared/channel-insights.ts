// Storefront channel insights: what an account's recent public posts say a buyer can expect from it. The reading
// and the arithmetic live here, with the network passed in, so tests can run them without Deno or the provider.
// inventory-insights is the function that uses them.
import { pullPublic, trouble, type PullResult, type ScCall } from "./brand-pull.ts";
import { cleanCaption, count, type ChannelPlatform, type MappedChannel, type MappedPage, type MappedPost, type PostFormat, type Raw } from "./brand-sources.ts";
import { inventoryTarget } from "./inventory-stats.ts";

/** The chart shows the latest twelve posts; the top three are shown with their pictures. */
export const RECENT_POSTS = 12;
export const TOP_POSTS = 3;
/** Posts older than this aren't read: an account quiet for three months says so instead of showing old numbers. */
export const WINDOW_DAYS = 90;
/** Fewer posts than this with a number, and no typical figure is given: two posts aren't a pattern. */
const MIN_POSTS = 3;
/** Pages of posts read per account: enough for twelve recent posts. Facebook gives three posts a page. */
export const INSIGHT_PAGES: Record<ChannelPlatform, number> = { tiktok: 1, instagram: 1, facebook: 4 };

const DAY = 86_400_000;

/** The platforms whose posts can be read. X is left out: the provider has no reliable timeline read. */
export const INSIGHT_PLATFORMS = ["tiktok", "instagram", "facebook", "youtube"] as const;
export type InsightPlatform = (typeof INSIGHT_PLATFORMS)[number];

/** The account to read for a listing, or null when it has none the provider can read. */
export function insightTarget(platform: string | null | undefined, handle: string | null | undefined): { platform: InsightPlatform; handle: string } | null {
  if (!platform || !handle) return null;
  const target = inventoryTarget(platform, handle);
  if (!target || !(INSIGHT_PLATFORMS as readonly string[]).includes(target.platform)) return null;
  return { platform: target.platform as InsightPlatform, handle: target.handle };
}

export type InsightPost = {
  url: string | null;
  posted_at: string;
  format: PostFormat;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Likes, comments and shares together; null when the platform gave none of them. */
  interactions: number | null;
  caption: string | null;
  thumbnail_url: string | null;
};

export type InsightsSummary = {
  /** Posts read inside the window. */
  posts: number;
  posts_per_week: number | null;
  /** The middle post's views among the latest twelve: what a typical post gets. */
  median_views: number | null;
  median_interactions: number | null;
  /** Interactions as a share of views when views are known, else of followers. A percentage. */
  engagement_rate: number | null;
  engagement_basis: "views" | "followers" | null;
  latest_post_at: string | null;
};

export type ChannelInsights = {
  read_at: string;
  account: { name: string | null; followers: number | null; avatar_url: string | null };
  summary: InsightsSummary;
  /** The latest posts, oldest first, for the chart. No pictures: they'd only weigh the page down. */
  recent: InsightPost[];
  /** The most viewed posts (or the most interacted with, where views aren't given), with pictures. */
  top: InsightPost[];
};

const sumKnown = (...values: (number | null)[]) => (values.every((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0));

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function toInsightPost(p: MappedPost): InsightPost | null {
  if (!p.posted_at) return null;
  const m = p.metrics;
  return {
    url: p.url,
    posted_at: p.posted_at,
    format: p.format,
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    shares: m.shares,
    interactions: sumKnown(m.likes, m.comments, m.shares),
    caption: p.caption ? (Array.from(p.caption).slice(0, 140).join("").trim() || null) : null,
    thumbnail_url: p.thumbnail_url,
  };
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** What a read says: the typical post, how often the account posts, and its best recent posts. */
export function summarise(channel: MappedChannel, read: MappedPost[], now: number): ChannelInsights {
  const since = now - WINDOW_DAYS * DAY;
  const seen = new Set<string>();
  const posts = read
    .filter((p) => !seen.has(p.external_id) && seen.add(p.external_id))
    .map(toInsightPost)
    .filter((p): p is InsightPost => !!p && Date.parse(p.posted_at) >= since && Date.parse(p.posted_at) <= now + DAY)
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at));

  const latest = posts.slice(0, RECENT_POSTS);
  const viewed = latest.filter((p) => p.views !== null);
  const interacted = latest.filter((p) => p.interactions !== null);
  const followers = channel.followers;

  // How often: every post read, over the time from the oldest of them until now, so a quiet account reads as quiet.
  const oldest = posts.length ? Date.parse(posts[posts.length - 1].posted_at) : null;
  const span = oldest === null ? 0 : Math.max(1, (now - oldest) / DAY);
  const postsPerWeek = posts.length >= MIN_POSTS ? round((posts.length / span) * 7, 1) : null;

  let engagement: number | null = null;
  let basis: InsightsSummary["engagement_basis"] = null;
  const withBoth = latest.filter((p) => (p.views ?? 0) > 0 && p.interactions !== null);
  if (withBoth.length >= MIN_POSTS) {
    const views = withBoth.reduce((a, p) => a + (p.views ?? 0), 0);
    engagement = round((withBoth.reduce((a, p) => a + (p.interactions ?? 0), 0) / views) * 100, 2);
    basis = "views";
  } else if (interacted.length >= MIN_POSTS && followers) {
    engagement = round(((median(interacted.map((p) => p.interactions ?? 0)) ?? 0) / followers) * 100, 2);
    basis = "followers";
  }

  const byViews = posts.filter((p) => p.views !== null).length >= MIN_POSTS;
  const top = [...posts]
    .sort((a, b) => (byViews ? (b.views ?? -1) - (a.views ?? -1) : (b.interactions ?? -1) - (a.interactions ?? -1)))
    .slice(0, TOP_POSTS);

  return {
    read_at: new Date(now).toISOString(),
    account: { name: channel.display_name, followers, avatar_url: channel.avatar_url },
    summary: {
      posts: posts.length,
      posts_per_week: postsPerWeek,
      median_views: viewed.length >= MIN_POSTS ? median(viewed.map((p) => p.views ?? 0)) : null,
      median_interactions: interacted.length >= MIN_POSTS ? median(interacted.map((p) => p.interactions ?? 0)) : null,
      engagement_rate: engagement,
      engagement_basis: basis,
      latest_post_at: posts[0]?.posted_at ?? null,
    },
    recent: [...latest].reverse().map((p) => ({ ...p, thumbnail_url: null })),
    top,
  };
}

// ---- YouTube, which the brand-channels pull doesn't read ----

/** The channel's avatar comes small (s72); the same picture is served larger by asking for another size. */
export function mapYouTubeChannel(json: Raw): MappedChannel {
  const sources: Raw[] = Array.isArray(json?.avatar?.image?.sources) ? json.avatar.image.sources : [];
  const biggest = sources.reduce<Raw>((best, s) => (!best || (s?.width ?? 0) > (best?.width ?? 0) ? s : best), null);
  const avatar = typeof biggest?.url === "string" ? biggest.url.replace(/=s\d+-/, "=s800-") : null;
  return {
    external_id: typeof json?.channelId === "string" ? json.channelId : null,
    display_name: typeof json?.name === "string" && json.name.trim() ? json.name : null,
    avatar_url: avatar,
    followers: count(json?.subscriberCount) ?? count(json?.subscriberCountInt),
  };
}

export function mapYouTubeVideos(json: Raw): MappedPage {
  const posts: MappedPost[] = [];
  for (const v of Array.isArray(json?.videos) ? json.videos : []) {
    if (typeof v?.id !== "string" || !v.id) continue;
    const at = typeof v?.publishedTime === "string" ? Date.parse(v.publishedTime) : NaN;
    posts.push({
      external_id: v.id,
      url: typeof v?.url === "string" ? v.url : `https://www.youtube.com/watch?v=${v.id}`,
      posted_at: Number.isFinite(at) ? new Date(at).toISOString() : null,
      format: "video",
      caption: cleanCaption(v?.title),
      thumbnail_url: typeof v?.thumbnail === "string" ? v.thumbnail : null,
      metrics: {
        views: count(v?.viewCountInt), likes: count(v?.likeCountInt ?? v?.likeCount), comments: count(v?.commentCountInt ?? v?.commentCount),
        shares: null, saves: null, reach: null, views_paid: null,
      },
    });
  }
  return { posts, cursor: typeof json?.continuationToken === "string" ? json.continuationToken : null };
}

/** A YouTube channel: its details, then one page of its latest videos. */
export async function pullYouTube(handle: string, call: ScCall): Promise<PullResult> {
  let calls = 0;
  const get = async (path: string, params: Record<string, string>) => {
    calls++;
    try { return await call(path, params); } catch { return { status: 0, json: null }; }
  };
  const failed = (kind: "not_found" | "private" | "out_of_credits" | "failed"): PullResult => ({
    ok: false, kind, calls, note: kind === "out_of_credits" ? "The data provider is out of credits." : `The channel read ${kind === "failed" ? "failed" : "found no channel"}.`,
  });
  const profile = await get("/v1/youtube/channel", { handle });
  const profileTrouble = trouble(profile);
  if (profileTrouble) return failed(profileTrouble);
  const channel = mapYouTubeChannel(profile.json);
  if (channel.external_id === null && channel.followers === null) return failed("not_found");
  const videos = await get("/v1/youtube/channel-videos", { handle, sort: "latest" });
  const videosTrouble = trouble(videos);
  if (videosTrouble === "out_of_credits") return failed(videosTrouble);
  return { ok: true, source: "scrapecreators", channel, posts: videosTrouble ? [] : mapYouTubeVideos(videos.json).posts, calls };
}

/** One listing's account, read for insights: the latest posts only, within the window. */
export function readChannel(target: { platform: InsightPlatform; handle: string }, call: ScCall, now: number, outOfTime?: () => boolean): Promise<PullResult> {
  if (target.platform === "youtube") return pullYouTube(target.handle, call);
  return pullPublic({
    platform: target.platform, handle: target.handle, mode: "first", now, call, outOfTime,
    pages: INSIGHT_PAGES[target.platform], reelPages: 1,
  });
}
