// Brand channels: what a handle is, when a channel is read and how far back. Pure, so tests can run it without Deno.

export type ChannelPlatform = "facebook" | "instagram" | "tiktok";
export type PullMode = "first" | "deep" | "nightly";

/** How many days back a pull reads: the first pull goes furthest for history, Sundays re-measure older posts. */
export const WINDOW_DAYS: Record<PullMode, number> = { first: 90, deep: 120, nightly: 45 };

/** The most pages of posts one pull may read. ScrapeCreators returns 3 Facebook posts a page, so those caps are higher. */
export const PUBLIC_PAGE_CAPS: Record<ChannelPlatform, Record<PullMode, number>> = {
  tiktok: { first: 6, deep: 5, nightly: 2 },
  instagram: { first: 8, deep: 6, nightly: 2 },
  facebook: { first: 30, deep: 15, nightly: 5 },
};
export const FACEBOOK_REEL_PAGES: Record<PullMode, number> = { first: 3, deep: 2, nightly: 1 };

/** Calls per agency per Nairobi day. Provisional: reset once the pilot has measured what a handle really costs. */
export const PUBLIC_PULL_DAILY_CAP = 300;
/** Public pulls stop below this balance, because campaign metrics and Listening spend from the same account. */
export const SC_CREDIT_FLOOR = 300;

const HOUR = 3_600_000;
const NAIROBI_OFFSET = 3 * HOUR;
const DUE_AFTER = 20 * HOUR;

const PLATFORM_NAME: Record<ChannelPlatform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const HOSTS: [ChannelPlatform, RegExp][] = [
  ["facebook", /(^|\.)(facebook\.com|fb\.com)$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
];
const LOOKS_LIKE_LINK = /^(https?:\/\/|(www\.|m\.|web\.)?(facebook|fb|instagram|tiktok)\.com(\/|$))/i;
const HANDLE = /^[a-z0-9._-]{1,100}$/;
const POST_LINK = "That's a link to a post. Paste the account's handle or the link to its page.";

const INSTAGRAM_POST_PATHS = new Set(["p", "reel", "reels", "tv", "stories", "explore"]);
const FACEBOOK_POST_PATHS = new Set(["share", "watch", "groups", "reel", "photo", "permalink.php", "story.php", "events"]);
const FACEBOOK_PAGE_POST_TABS = new Set(["videos", "photos", "reels", "reel"]);

/** What a link's path says the handle is, or that it is a link to a post. */
function handleFromPath(platform: ChannelPlatform, url: URL): string | { error: string } {
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  if (platform === "tiktok") {
    if (!first.startsWith("@") || parts.length > 1) return { error: POST_LINK };
    return first.slice(1);
  }
  if (platform === "instagram") {
    if (INSTAGRAM_POST_PATHS.has(first.toLowerCase()) || INSTAGRAM_POST_PATHS.has((parts[1] ?? "").toLowerCase())) return { error: POST_LINK };
    return first;
  }
  if (first === "profile.php") return url.searchParams.get("id") ?? "";
  if (first === "people" || first === "pages") return parts[parts.length - 1] ?? "";
  if (FACEBOOK_POST_PATHS.has(first.toLowerCase())) return { error: POST_LINK };
  if (parts[1] === "posts" || (parts.length >= 3 && FACEBOOK_PAGE_POST_TABS.has(parts[1]))) return { error: POST_LINK };
  return first;
}

/** What a person typed or pasted, as the handle we store: lowercase, no "@". Refuses what can't be an account, in plain words. */
export function normaliseHandle(platform: ChannelPlatform, input: string): { handle: string } | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Type the account's handle or paste the link to its page." };
  let candidate = raw;
  if (LOOKS_LIKE_LINK.test(raw)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { error: "That link doesn't look right. Paste the account's handle instead." };
    }
    const host = url.hostname.toLowerCase();
    const owner = HOSTS.find(([, re]) => re.test(host))?.[0];
    if (!owner) return { error: `That isn't a ${PLATFORM_NAME[platform]} link. Paste the account's handle instead.` };
    if (owner !== platform) return { error: `That looks like a ${PLATFORM_NAME[owner]} link. Choose ${PLATFORM_NAME[owner]}, or paste the ${PLATFORM_NAME[platform]} account.` };
    const found = handleFromPath(platform, url);
    if (typeof found !== "string") return found;
    candidate = found;
  }
  const handle = candidate.replace(/^@+/, "").toLowerCase();
  if (!HANDLE.test(handle)) return { error: "That doesn't look like a handle. Use letters, numbers, dots, dashes and underscores." };
  return { handle };
}

/** The address ScrapeCreators needs for a Facebook page: a page with no username goes by its id. */
export function facebookPageUrl(handle: string): string {
  return /^\d+$/.test(handle) ? `https://www.facebook.com/profile.php?id=${handle}` : `https://www.facebook.com/${handle}`;
}

/** A handle that has never been found stays out of the nightly run until someone fixes it. */
export function channelIsDue(c: { last_pull_at: string | null; last_good_pull_at: string | null; status: string }, now: number): boolean {
  if (c.status === "error" && !c.last_good_pull_at) return false;
  if (!c.last_pull_at) return true;
  return now - Date.parse(c.last_pull_at) >= DUE_AFTER;
}

export function pullMode(c: { last_good_pull_at: string | null }, now: number): PullMode {
  if (!c.last_good_pull_at) return "first";
  return new Date(now + NAIROBI_OFFSET).getUTCDay() === 0 ? "deep" : "nightly";
}

/** The profile, the post pages and, on Facebook, the reel pages. Reserved from the daily allowance before a pull starts. */
export function maxPublicCalls(platform: ChannelPlatform, mode: PullMode): number {
  return 1 + PUBLIC_PAGE_CAPS[platform][mode] + (platform === "facebook" ? FACEBOOK_REEL_PAGES[mode] : 0);
}

/**
 * The first 500 characters of a caption, safe to store: Postgres refuses a NUL and half an emoji in text, and one
 * bad caption must not fail a whole channel's pull.
 */
export function cleanCaption(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const characters = Array.from(raw.split("\u0000").join("")).filter((c) => !(c.length === 1 && c >= "\ud800" && c <= "\udfff"));
  return characters.slice(0, 500).join("").trim() || null;
}

/** A provider's JSON. Every field is read defensively below, so a missing one comes out null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Raw = any;

export type PostFormat = "video" | "photo" | "carousel" | "text" | "other";
export type PostMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  views_paid: number | null;
};
export type MappedChannel = { external_id: string | null; display_name: string | null; avatar_url: string | null; followers: number | null };
export type MappedPost = {
  external_id: string;
  url: string | null;
  posted_at: string | null;
  format: PostFormat;
  caption: string | null;
  thumbnail_url: string | null;
  metrics: PostMetrics;
};
export type MappedPage = { posts: MappedPost[]; cursor: string | null };
export type MappedReel = { video_id: string; url: string | null; views: number | null; posted_at: string | null; caption: string | null; thumbnail_url: string | null };

/** A count the source gave as a whole number, or null: a missing count must never turn into 0. A real 0 stays 0. */
export function count(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const id = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
const fromSeconds = (v: unknown): string | null => {
  const seconds = count(v);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
};
const metrics = (m: Partial<PostMetrics>): PostMetrics => ({ views: null, likes: null, comments: null, shares: null, saves: null, reach: null, views_paid: null, ...m });
const listOf = (v: unknown): Raw[] => (Array.isArray(v) ? v : []);
const addKnown = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

export function mapTikTokProfile(json: Raw): MappedChannel {
  return {
    external_id: id(json?.user?.id),
    display_name: text(json?.user?.nickname),
    avatar_url: text(json?.user?.avatarLarger),
    followers: count(json?.stats?.followerCount),
  };
}

export function mapInstagramProfile(json: Raw): MappedChannel {
  const user = json?.data?.user;
  return {
    external_id: id(user?.id),
    display_name: text(user?.full_name),
    avatar_url: text(user?.profile_pic_url_hd) ?? text(user?.profile_pic_url),
    followers: count(user?.edge_followed_by?.count),
  };
}

export function mapFacebookProfile(json: Raw): MappedChannel {
  return {
    external_id: id(json?.adLibrary?.pageId) ?? id(json?.id),
    display_name: text(json?.name),
    avatar_url: text(json?.profilePicLarge),
    followers: count(json?.followerCount) ?? count(json?.likeCount),
  };
}

export function mapTikTokVideos(json: Raw): MappedPage {
  const posts: MappedPost[] = [];
  for (const row of listOf(json?.aweme_list)) {
    const external_id = id(row?.aweme_id);
    if (!external_id) continue;
    const s = row?.statistics ?? {};
    posts.push({
      external_id,
      url: text(row?.url),
      posted_at: fromSeconds(row?.create_time),
      format: row?.image_post_info ? "photo" : "video",
      caption: cleanCaption(row?.desc),
      thumbnail_url: text(row?.video?.cover?.url_list?.[0]),
      metrics: metrics({
        views: count(s.play_count),
        likes: count(s.digg_count),
        comments: count(s.comment_count),
        shares: addKnown(count(s.share_count), count(s.whatsapp_share_count)),
        saves: count(s.collect_count),
      }),
    });
  }
  return { posts, cursor: json?.has_more === false ? null : id(json?.max_cursor) };
}

const INSTAGRAM_FORMAT: Record<number, PostFormat> = { 1: "photo", 2: "video", 8: "carousel" };

export function mapInstagramPosts(json: Raw): MappedPage {
  const posts: MappedPost[] = [];
  for (const row of listOf(json?.items)) {
    const external_id = id(row?.code);
    if (!external_id) continue;
    const format = INSTAGRAM_FORMAT[row?.media_type] ?? "other";
    posts.push({
      external_id,
      url: text(row?.url),
      posted_at: fromSeconds(row?.taken_at),
      format,
      caption: cleanCaption(row?.caption?.text),
      thumbnail_url: text(row?.display_uri) ?? text(row?.image_versions2?.candidates?.[0]?.url),
      metrics: metrics({
        views: format === "video" ? count(row?.play_count) ?? count(row?.ig_play_count) : null,
        likes: count(row?.like_count),
        comments: count(row?.comment_count),
      }),
    });
  }
  return { posts, cursor: json?.more_available === false ? null : id(json?.next_max_id) };
}

/** Meta writes a post id as page_post and the public source as post, so the part after the last "_" keys a post on both routes. */
export function facebookPostKey(postId: string): string {
  return postId.slice(postId.lastIndexOf("_") + 1);
}

export function mapFacebookPosts(json: Raw): MappedPage {
  const posts: MappedPost[] = [];
  for (const row of listOf(json?.posts)) {
    const rawId = id(row?.id);
    if (!rawId) continue;
    const url = text(row?.url) ?? text(row?.permalink);
    const picture = text(row?.link_attachment?.image_url) ?? text(row?.images?.[0]?.url);
    const video = !!row?.videoDetails || /\/reel\//.test(url ?? "");
    posts.push({
      external_id: facebookPostKey(rawId),
      url,
      posted_at: fromSeconds(row?.publishTime),
      format: video ? "video" : picture ? "photo" : "text",
      caption: cleanCaption(row?.text),
      thumbnail_url: text(row?.videoDetails?.thumbnailUrl) ?? picture,
      metrics: metrics({ views: count(row?.videoViewCount), likes: count(row?.reactionCount), comments: count(row?.commentCount) }),
    });
  }
  return { posts, cursor: id(json?.cursor) };
}

export function mapFacebookReels(json: Raw): { reels: MappedReel[]; cursor: string | null; next_page_id: string | null } {
  const reels: MappedReel[] = [];
  for (const row of listOf(json?.reels)) {
    const video_id = id(row?.video_id);
    if (!video_id) continue;
    reels.push({
      video_id,
      url: text(row?.url),
      views: count(row?.view_count),
      posted_at: text(row?.creation_time),
      caption: cleanCaption(row?.description),
      thumbnail_url: text(row?.thumbnail),
    });
  }
  return { reels, cursor: id(json?.cursor), next_page_id: id(json?.next_page_id) };
}

/**
 * The post list has reactions but rarely views, and the reel list has views but no reactions. A reel's views go on
 * the post whose link holds that reel's id; a reel with no post in the list still counts, with its views alone.
 */
export function mergeFacebookReels(posts: MappedPost[], reels: MappedReel[]): MappedPost[] {
  const merged = posts.map((p) => ({ ...p, metrics: { ...p.metrics } }));
  for (const reel of reels) {
    const match = merged.find((p) => p.url?.includes(`/reel/${reel.video_id}`) || p.external_id === reel.video_id);
    if (match) {
      match.metrics.views ??= reel.views;
    } else {
      merged.push({
        external_id: reel.video_id,
        url: reel.url,
        posted_at: reel.posted_at,
        format: "video",
        caption: reel.caption,
        thumbnail_url: reel.thumbnail_url,
        metrics: metrics({ views: reel.views }),
      });
    }
  }
  return merged;
}
