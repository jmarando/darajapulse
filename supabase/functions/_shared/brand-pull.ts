// Brand channels: one channel's read, with the network passed in so tests can run it without Deno, and what a result
// may write. A failed read writes nothing but the attempt: zeros would look like a collapse.
import {
  FACEBOOK_REEL_PAGES, PLATFORM_NAME, PUBLIC_PAGE_CAPS, WINDOW_DAYS, facebookPageUrl, mapFacebookPosts, mapFacebookProfile, mapFacebookReels,
  mapInstagramPosts, mapInstagramProfile, mapTikTokProfile, mapTikTokVideos, mergeFacebookReels,
  type ChannelPlatform, type MappedChannel, type MappedPage, type MappedPost, type MappedReel, type PostMetrics, type PullMode, type Raw,
} from "./brand-sources.ts";
import { nairobiDay } from "./listening-alerts.ts";
import {
  classifyMetaError, mapMetaFacebookPost, mapMetaInstagram, mapMetaMedia, mapMetaPage, parseDemographics, parseMediaInsights, parsePostInsights,
  parsePostViewsSplit, reconnectNote, type GraphCall, type GraphError, type GraphPost,
} from "./meta-graph.ts";

export type { GraphCall };

export type ScCall = (path: string, params: Record<string, string>) => Promise<{ status: number; json: Raw }>;
export type AudienceRow = { key: string; value: number };
export type Audience = { country: AudienceRow[]; age: AudienceRow[]; gender: AudienceRow[] };
export type PullResult =
  | { ok: true; source: "scrapecreators" | "meta"; channel: MappedChannel; posts: MappedPost[]; calls: number; audience?: Audience | null }
  | { ok: false; kind: "not_found" | "private" | "out_of_credits" | "cap" | "failed" | "reconnect" | "retry"; note: string; calls: number };
export type ChannelRow = { platform: string; source: string; status: string; last_good_pull_at: string | null };

const DAY = 86_400_000;
const OUT_OF_CREDITS = "Public numbers are paused: the data provider is out of credits.";

type Trouble = "out_of_credits" | "private" | "not_found" | "failed";

/** What an answer's status and body say went wrong, if anything. The provider answers some refusals with success: true. */
function trouble(a: { status: number; json: Raw }): Trouble | null {
  if (a.status === 402) return "out_of_credits";
  const j = a.json;
  if (j?.isPrivate === true || /private|age.?restricted/i.test(String(j?.message ?? ""))) return "private";
  if (a.status === 404 || j?.accountDoesNotExist === true) return "not_found";
  if (a.status < 200 || a.status >= 300 || j?.success === false) return "failed";
  return null;
}

const failed = (kind: Trouble, calls: number): PullResult => ({
  ok: false,
  kind,
  calls,
  note: kind === "out_of_credits" ? OUT_OF_CREDITS : kind === "failed" ? "The read failed." : kind === "private" ? "The account is private." : "The account wasn't found.",
});

type Route = {
  profile: [string, Record<string, string>];
  mapProfile: (json: Raw) => MappedChannel;
  posts: [string, Record<string, string>];
  cursorParam: string;
  mapPosts: (json: Raw) => MappedPage;
};

function routeFor(platform: ChannelPlatform, handle: string): Route {
  if (platform === "tiktok") {
    return {
      profile: ["/v1/tiktok/profile", { handle }],
      mapProfile: mapTikTokProfile,
      posts: ["/v3/tiktok/profile/videos", { handle, sort_by: "latest", include_pinned: "false" }],
      cursorParam: "max_cursor",
      mapPosts: mapTikTokVideos,
    };
  }
  if (platform === "instagram") {
    return {
      profile: ["/v1/instagram/profile", { handle }],
      mapProfile: mapInstagramProfile,
      posts: ["/v2/instagram/user/posts", { handle }],
      cursorParam: "next_max_id",
      mapPosts: mapInstagramPosts,
    };
  }
  const url = facebookPageUrl(handle);
  return {
    profile: ["/v1/facebook/profile", { url }],
    mapProfile: mapFacebookProfile,
    posts: ["/v1/facebook/profile/posts", { url }],
    cursorParam: "cursor",
    mapPosts: mapFacebookPosts,
  };
}

/** A page of posts all older than the window ends the read. One old post among new ones doesn't: it may be pinned. */
const allOlderThan = (dates: (string | null)[], since: number) => {
  const known = dates.filter((d): d is string => !!d);
  return known.length > 0 && known.every((d) => Date.parse(d) < since);
};

const insideWindow = (post: MappedPost, since: number) => !!post.posted_at && Date.parse(post.posted_at) >= since;

/**
 * A Facebook page's list can hold a post another page wrote, with that page's reactions. Its link names the other page.
 * A page known only by its id has no name to compare, so nothing can be told and nothing is dropped.
 */
function writtenByAnotherPage(post: MappedPost, handle: string): boolean {
  if (/^\d+$/.test(handle) || !post.url) return false;
  const page = post.url.match(/facebook\.com\/([^/?#]+)\/(?:posts|videos|photos)\//i)?.[1];
  return !!page && page.toLowerCase() !== handle;
}

/** One public account: its profile, then pages of posts back to the window, then on Facebook the reel list for views. */
export async function pullPublic(i: { platform: ChannelPlatform; handle: string; mode: PullMode; now: number; call: ScCall; outOfTime?: () => boolean }): Promise<PullResult> {
  const { platform, handle, mode, now, call, outOfTime = () => false } = i;
  const since = now - WINDOW_DAYS[mode] * DAY;
  const route = routeFor(platform, handle);
  let calls = 0;
  const get = async (path: string, params: Record<string, string>) => {
    calls++;
    try {
      return await call(path, params);
    } catch {
      return { status: 0, json: null };
    }
  };

  const profile = await get(...route.profile);
  const profileTrouble = trouble(profile);
  if (profileTrouble) return failed(profileTrouble, calls);
  const channel = route.mapProfile(profile.json);
  if (channel.external_id === null && channel.followers === null) return failed("not_found", calls);

  const read: MappedPost[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PUBLIC_PAGE_CAPS[platform][mode] && !outOfTime(); page++) {
    const answer = await get(route.posts[0], cursor ? { ...route.posts[1], [route.cursorParam]: cursor } : route.posts[1]);
    const pageTrouble = trouble(answer);
    if (pageTrouble === "out_of_credits") return failed(pageTrouble, calls);
    if (pageTrouble === "private" && page === 0) return failed(pageTrouble, calls);
    if (pageTrouble === "failed" && page === 0) return failed(pageTrouble, calls);
    if (pageTrouble) break; // after a good profile, a 404 here means no posts; a later page failing keeps what was read
    const mapped = route.mapPosts(answer.json);
    read.push(...mapped.posts);
    if (!mapped.cursor || allOlderThan(mapped.posts.map((p) => p.posted_at), since)) break;
    cursor = mapped.cursor;
  }

  let posts = read;
  if (platform === "facebook") {
    const reels: MappedReel[] = [];
    let reelCursor: { cursor: string; next_page_id?: string } | null = null;
    for (let page = 0; page < FACEBOOK_REEL_PAGES[mode] && !outOfTime(); page++) {
      const answer = await get("/v1/facebook/profile/reels", { ...route.posts[1], ...(reelCursor ?? {}) });
      const reelTrouble = trouble(answer);
      if (reelTrouble === "out_of_credits") return failed(reelTrouble, calls);
      if (reelTrouble) break; // the posts still count, without reel views
      const mapped = mapFacebookReels(answer.json);
      reels.push(...mapped.reels);
      if (!mapped.cursor || allOlderThan(mapped.reels.map((r) => r.posted_at), since)) break;
      reelCursor = { cursor: mapped.cursor, ...(mapped.next_page_id ? { next_page_id: mapped.next_page_id } : {}) };
    }
    posts = mergeFacebookReels(read, reels).filter((post) => !writtenByAnotherPage(post, handle));
  }

  // Providers can repeat a post across pages, and one upsert can't touch a row twice.
  const unique = new Map<string, MappedPost>();
  for (const post of posts) if (insideWindow(post, since) && !unique.has(post.external_id)) unique.set(post.external_id, post);
  return { ok: true, source: "scrapecreators", channel, posts: [...unique.values()], calls };
}

const META_PAGES = 6;
const INSIGHTS_AT_ONCE = 5;
const META_RETRY = "Facebook asked us to slow down.";
const INSIGHTS_GONE = "Facebook isn't sharing this page's insights any more. Reconnect to see views and reach.";
const POST_FIELDS = "id,permalink_url,created_time,message,full_picture,attachments{media_type},reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares";
const MEDIA_FIELDS = "id,shortcode,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";

/** A connected channel reads from Meta, until its token is rejected and public numbers stand in. */
export function pullRoute(c: { source: string; status: string }): "meta" | "public" {
  return c.source === "connected" && c.status !== "needs_reconnect" ? "meta" : "public";
}

function metaFailure(error: GraphError | undefined, calls: number): PullResult {
  const kind = classifyMetaError(error);
  if (kind === "reconnect") return { ok: false, kind, note: reconnectNote(error?.code), calls };
  if (kind === "retry") return { ok: false, kind, note: META_RETRY, calls };
  return { ok: false, kind: "failed", note: "The read failed.", calls };
}

/** Counts calls and turns a network error into a failed call. */
function counted(graph: GraphCall) {
  const state = { calls: 0 };
  const get: GraphCall = async (path, params) => {
    state.calls++;
    try {
      return await graph(path, params);
    } catch {
      return { ok: false, json: null };
    }
  };
  return { state, get };
}

/** Pages of an edge, by its after cursor. An error on the first page is the answer; on a later one, what was read stands. */
async function readEdge(get: GraphCall, path: string, params: Record<string, string>, outOfTime: () => boolean): Promise<{ rows: Raw[]; failed: boolean; error?: GraphError }> {
  const rows: Raw[] = [];
  let after: string | null = null;
  for (let page = 0; page < META_PAGES && !outOfTime(); page++) {
    const answer = await get(path, after ? { ...params, after } : params);
    if (!answer.ok) {
      if (page === 0) return { rows, failed: true, error: answer.error };
      break;
    }
    rows.push(...(Array.isArray(answer.json?.data) ? answer.json.data : []));
    after = answer.json?.paging?.next ? answer.json?.paging?.cursors?.after ?? null : null;
    if (!after) break;
  }
  return { rows, failed: false };
}

/** Runs a post's insight calls a few at a time, and says whether every post refused them for lack of permission. */
async function eachPost(posts: GraphPost[], outOfTime: () => boolean, read: (post: GraphPost) => Promise<GraphError | undefined>): Promise<boolean> {
  let refused = 0;
  for (let i = 0; i < posts.length && !outOfTime(); i += INSIGHTS_AT_ONCE) {
    await Promise.all(posts.slice(i, i + INSIGHTS_AT_ONCE).map(async (post) => {
      if (classifyMetaError(await read(post)) === "reconnect") refused++;
    }));
  }
  return posts.length > 0 && refused === posts.length;
}

export async function pullMetaFacebook(i: { pageId: string; mode: PullMode; now: number; graph: GraphCall; outOfTime?: () => boolean }): Promise<PullResult> {
  const { pageId, mode, now, outOfTime = () => false } = i;
  const { state, get } = counted(i.graph);
  const since = now - WINDOW_DAYS[mode] * DAY;
  const page = await get(pageId, { fields: "id,name,username,followers_count,picture{url}" });
  if (!page.ok) return metaFailure(page.error, state.calls);
  const edge = await readEdge(get, `${pageId}/posts`, { fields: POST_FIELDS, since: String(Math.floor(since / 1000)), limit: "50" }, outOfTime);
  if (edge.failed) return metaFailure(edge.error, state.calls);
  const posts = edge.rows.map(mapMetaFacebookPost).filter((p) => p.graph_id && insideWindow(p, since));
  const allRefused = await eachPost(posts, outOfTime, async (post) => {
    const [views, split] = await Promise.all([
      get(`${post.graph_id}/insights`, { metric: "post_media_view,post_total_media_view_unique" }),
      get(`${post.graph_id}/insights`, { metric: "post_media_view", breakdown: "is_from_ads" }),
    ]);
    if (views.ok) Object.assign(post.metrics, parsePostInsights(views.json));
    if (split.ok) post.metrics.views_paid = parsePostViewsSplit(split.json);
    return views.ok ? undefined : views.error;
  });
  if (allRefused) return { ok: false, kind: "reconnect", note: INSIGHTS_GONE, calls: state.calls };
  return { ok: true, source: "meta", channel: mapMetaPage(page.json), posts, calls: state.calls };
}

export async function pullMetaInstagram(i: { igUserId: string; mode: PullMode; now: number; graph: GraphCall; outOfTime?: () => boolean }): Promise<PullResult> {
  const { igUserId, mode, now, outOfTime = () => false } = i;
  const { state, get } = counted(i.graph);
  const since = now - WINDOW_DAYS[mode] * DAY;
  const user = await get(igUserId, { fields: "id,username,name,followers_count,profile_picture_url" });
  if (!user.ok) return metaFailure(user.error, state.calls);
  const edge = await readEdge(get, `${igUserId}/media`, { fields: MEDIA_FIELDS, since: String(Math.floor(since / 1000)), limit: "50" }, outOfTime);
  if (edge.failed) return metaFailure(edge.error, state.calls);
  const posts = edge.rows.map(mapMetaMedia).filter((p) => p.graph_id && insideWindow(p, since));
  const allRefused = await eachPost(posts, outOfTime, async (post) => {
    const insights = await get(`${post.graph_id}/insights`, { metric: "views,reach,saved,shares" });
    if (insights.ok) Object.assign(post.metrics, parseMediaInsights(insights.json));
    return insights.ok ? undefined : insights.error;
  });
  if (allRefused) return { ok: false, kind: "reconnect", note: INSIGHTS_GONE, calls: state.calls };

  let audience: Audience | null | undefined;
  if (mode !== "nightly") {
    const read = async (breakdown: string) => {
      const answer = await get(`${igUserId}/insights`, { metric: "follower_demographics", period: "lifetime", timeframe: "this_month", metric_type: "total_value", breakdown });
      return answer.ok ? parseDemographics(answer.json) : [];
    };
    const [country, age, gender] = await Promise.all([read("country"), read("age"), read("gender")]);
    audience = country.length || age.length || gender.length ? { country, age, gender } : null;
  }
  return { ok: true, source: "meta", channel: mapMetaInstagram(user.json), posts, calls: state.calls, ...(audience !== undefined ? { audience } : {}) };
}

/** What a result writes to the channel and to the day's line. It never touches a field it has no news for. */
export function applyPull(row: ChannelRow, result: PullResult, now: number): {
  channel: Record<string, unknown>;
  day: { day: string; followers: number; source: string } | null;
} {
  const at = new Date(now).toISOString();
  const name = PLATFORM_NAME[row.platform] ?? row.platform;
  if (result.ok === true) {
    // A rejected token stays on show while public numbers stand in, until someone reconnects.
    const keepStatus = row.status === "needs_reconnect" && result.source !== "meta";
    const c = result.channel;
    return {
      channel: {
        ...(keepStatus ? {} : { status: "ok", status_note: null }),
        last_pull_at: at,
        last_good_pull_at: at,
        // A public source's id for a page can differ from Meta's, and Meta's is what a connected channel reads by.
        ...(c.external_id !== null && !keepStatus ? { external_id: c.external_id } : {}),
        ...(c.display_name !== null ? { display_name: c.display_name } : {}),
        ...(c.avatar_url !== null ? { avatar_url: c.avatar_url } : {}),
        ...(result.audience ? { audience: result.audience, audience_at: at } : {}),
      },
      day: c.followers === null ? null : { day: nairobiDay(now), followers: c.followers, source: result.source },
    };
  }
  const attempt = { last_pull_at: at };
  const everGood = !!row.last_good_pull_at;
  // A page that needs reconnecting keeps saying so, whatever happens to the public read standing in for it.
  if (row.status === "needs_reconnect" && result.kind !== "reconnect") return { channel: attempt, day: null };
  switch (result.kind) {
    case "not_found":
      return { channel: { ...attempt, status: "error", status_note: everGood ? `Not found on ${name} any more. It may have been renamed.` : `Not found on ${name}. Check the handle.` }, day: null };
    case "private":
      return { channel: { ...attempt, status: "error", status_note: "This account is private or age-restricted, so its public numbers can't be read." }, day: null };
    case "out_of_credits":
      return { channel: { ...attempt, status: "paused", status_note: OUT_OF_CREDITS }, day: null };
    case "cap":
      return { channel: { ...attempt, status_note: "Today's allowance for public numbers is used. Tries again tonight." }, day: null };
    case "reconnect":
      return { channel: { ...attempt, status: "needs_reconnect", status_note: result.note }, day: null };
    case "retry":
      return { channel: { ...attempt, status_note: "Facebook asked us to slow down. Tries again tonight." }, day: null };
    default:
      return { channel: { ...attempt, status_note: everGood ? "Couldn't read this account last night. Showing the last good numbers." : "Couldn't read this account yet. Tries again tonight." }, day: null };
  }
}

/** One reading of a post, or nothing when no number is known. */
export function snapshotRow(post_id: string, m: PostMetrics, source: string, now: number): Record<string, unknown> | null {
  if (Object.values(m).every((v) => v === null)) return null;
  return { post_id, ...m, source, captured_at: new Date(now).toISOString() };
}
