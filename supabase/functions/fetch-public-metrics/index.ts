// Unified public metrics fetcher.
// Primary: Ensemble Data (https://ensembledata.com) — single token covers
//   TikTok, Instagram, YouTube, Facebook.
// Fallback: lightweight HTML scrape (TikTok / YouTube) for the rare case where
//   Ensemble returns nothing.
// Per-post status is returned so the UI can surface "couldn't fetch — retry / enter manually".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { scrapeCreatorsPost, SCRAPECREATORS_ENABLED } from "../_shared/scrapecreators.ts";
import { canManageCampaign, denied, requireCaller } from "../_shared/auth.ts";

// Per-invocation ScrapeCreators credit accounting. Credits are a paid, finite
// pool, so a run may never exceed the budget the caller asked for.
const sc = { enabled: false, budget: 0, used: 0, remaining: null as number | null, capped: false };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ED_TOKENS = [
  Deno.env.get("ENSEMBLEDATA_API_TOKEN"),
  Deno.env.get("ENSEMBLE_DATA_API_TOKEN"),
  Deno.env.get("ENSEMBLEDATA_API_TOKEN_2"),
].filter((t): t is string => !!t && t.length > 0);
const ENSEMBLE_TOKEN = ED_TOKENS[0] ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// ----- helpers -----
function parseShortcount(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).replace(/,/g, "").trim().match(/([\d.]+)\s*([kmbKMB]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as "k"|"m"|"b"] ?? 1;
  return Math.round(n * mult);
}

function pickCount(...values: any[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = typeof value === "number" ? value : parseShortcount(String(value));
    if (Number.isFinite(n) && Number(n) > 0) return Math.round(Number(n));
  }
  return 0;
}

// Store only what the platform reported. Unreported shares/saves/reach stay 0;
// the app fills those in at display time and labels them as estimates
// (src/lib/metrics.ts), so a made-up number never lands in post_metrics.
function normalizeStats(stats: any) {
  const views = pickCount(stats?.views, stats?.videoPlayCount, stats?.videoViewCount, stats?.playCount, stats?.play_count, stats?.view_count);
  const likes = pickCount(stats?.likes, stats?.likesCount, stats?.diggCount, stats?.like_count, stats?.digg_count);
  const comments = pickCount(stats?.comments, stats?.commentsCount, stats?.commentCount, stats?.comment_count);
  const shares = pickCount(stats?.shares, stats?.sharesCount, stats?.shareCount, stats?.share_count, stats?.reshareCount, stats?.reshare_count);
  const saves = pickCount(stats?.saves, stats?.savesCount, stats?.collectCount, stats?.collect_count, stats?.saveCount, stats?.savedCount);
  const reach = pickCount(stats?.reach, stats?.reachCount);
  const impressions = pickCount(stats?.impressions, stats?.impressionsCount);

  return { views, likes, comments, shares, saves, reach, impressions };
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

// ----- Ensemble Data -----
const ED_BASE = "https://ensembledata.com/apis";

async function ed(path: string, params: Record<string, string>) {
  if (ED_TOKENS.length === 0) throw new Error("ENSEMBLEDATA_API_TOKEN not configured");
  let lastErr: any = null;
  for (const tok of ED_TOKENS) {
    const qs = new URLSearchParams({ ...params, token: tok }).toString();
    const r = await fetch(`${ED_BASE}${path}?${qs}`, { headers: { "Accept": "application/json" } });
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch { lastErr = new Error(`Ensemble non-JSON [${r.status}]: ${text.slice(0, 200)}`); continue; }
    if (r.ok) return json;
    if (r.status === 402 || r.status === 429 || r.status === 403 || r.status === 495) {
      lastErr = new Error(`Ensemble ${path} ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
      continue;
    }
    throw new Error(`Ensemble ${path} ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  throw lastErr ?? new Error("Ensemble all tokens failed");
}

function igShortcode(url: string): string | null {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}
function ttVideoId(url: string): string | null {
  return url.match(/\/video\/(\d{6,})/)?.[1] ?? null;
}
function ytVideoId(url: string): string | null {
  return url.match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1]
    ?? url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)?.[1]
    ?? url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/)?.[1]
    ?? null;
}

// Coerce a variety of timestamp shapes (unix seconds/ms, ISO string) to ISO string.
function toIso(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(+d) ? null : d.toISOString();
  }
  if (typeof v === "string") {
    // numeric string?
    if (/^\d{9,13}$/.test(v)) return toIso(Number(v));
    const d = new Date(v);
    return isNaN(+d) ? null : d.toISOString();
  }
  return null;
}

// Ensemble occasionally nests the aweme a level or two deeper than documented.
// Walk the payload for the first object that carries recognisable play/like counts.
function deepFindStats(node: any, depth = 0): any | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  const keys = ["play_count", "playCount", "digg_count", "diggCount", "like_count", "likeCount"];
  if (keys.some((k) => Number(node[k] ?? NaN) >= 0 && node[k] !== undefined && node[k] !== null)) return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const found = deepFindStats(v, depth + 1);
    if (found) return found;
  }
  return null;
}

// --- TikTok via Ensemble ---
async function edTikTok(url: string) {
  const j = await ed("/tt/post/info", { url });
  const data = j?.data ?? j;
  // Ensemble returns the TikTok itemStruct (or similar) — handle both shapes
  const item = data?.aweme_detail ?? data?.itemInfo?.itemStruct ?? data?.item ?? (Array.isArray(data) ? data[0] : data);
  const stats = item?.statistics ?? item?.stats ?? deepFindStats(data) ?? item;
  const cover = item?.video?.cover ?? item?.video?.cover?.url_list?.[0] ?? item?.video?.origin_cover?.url_list?.[0] ?? data?.cover ?? null;
  const desc = item?.desc ?? item?.title ?? data?.desc ?? null;
  const views = stats?.play_count ?? stats?.playCount ?? stats?.view_count;
  const likes = stats?.digg_count ?? stats?.diggCount ?? stats?.like_count;
  if (views == null && likes == null) {
    console.error(`tt/post/info returned no stats. keys=${JSON.stringify(Object.keys(data ?? {})).slice(0, 300)}`);
    throw new Error("Ensemble tt/post/info returned no stats");
  }
  return {
    stats: {
      views,
      likes,
      comments: stats?.comment_count ?? stats?.commentCount,
      shares: stats?.share_count ?? stats?.shareCount,
      saves: stats?.collect_count ?? stats?.collectCount,
    },
    thumb: typeof cover === "string" ? cover : cover?.url_list?.[0] ?? null,
    caption: desc,
    postedAt: toIso(item?.create_time ?? item?.createTime ?? item?.created_at ?? data?.create_time),
  };
}


// Ensemble's /tt/post/info rejects some perfectly valid permalinks ("Url not valid").
// The user-feed endpoint is far more forgiving, so look the video up by author + id.
async function edTikTokViaUser(url: string) {
  const id = ttVideoId(url);
  const handle = url.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i)?.[1];
  if (!id || !handle) throw new Error("Could not parse TikTok handle/video id");
  for (const depth of ["1", "3"]) {
    const j = await ed("/tt/user/posts", { username: handle, depth });
    const arr: any[] = j?.data?.data ?? j?.data ?? [];
    const list = Array.isArray(arr) ? arr : [];
    for (const raw of list) {
      const item = raw?.aweme_detail ?? raw;
      if (String(item?.aweme_id ?? item?.id ?? "") !== id) continue;
      const stats = item?.statistics ?? item?.stats ?? {};
      const cover = item?.video?.cover ?? item?.video?.origin_cover;
      return {
        stats: {
          views: stats?.play_count ?? stats?.playCount,
          likes: stats?.digg_count ?? stats?.diggCount,
          comments: stats?.comment_count ?? stats?.commentCount,
          shares: stats?.share_count ?? stats?.shareCount,
          saves: stats?.collect_count ?? stats?.collectCount,
        },
        thumb: typeof cover === "string" ? cover : cover?.url_list?.[0] ?? null,
        caption: item?.desc ?? null,
        postedAt: toIso(item?.create_time ?? item?.createTime),
      };
    }
  }
  throw new Error("TikTok video not found in author feed");
}

// --- Instagram via Ensemble ---
async function edInstagram(url: string) {
  const code = igShortcode(url);
  if (!code) throw new Error("Could not parse Instagram shortcode from URL");
  const j = await ed("/instagram/post/details", { code });
  const data = j?.data ?? j;
  const item = data?.shortcode_media ?? data?.items?.[0] ?? data;
  return {
    stats: {
      views: item?.video_view_count ?? item?.video_play_count ?? item?.play_count ?? item?.videoViewCount,
      likes: item?.edge_media_preview_like?.count ?? item?.like_count ?? item?.likesCount,
      comments: item?.edge_media_to_comment?.count ?? item?.comment_count ?? item?.commentsCount,
      shares: item?.reshare_count ?? item?.share_count,
      saves: item?.save_count ?? item?.savesCount,
    },
    thumb: item?.display_url ?? item?.thumbnail_url ?? item?.image_versions2?.candidates?.[0]?.url ?? null,
    caption: item?.edge_media_to_caption?.edges?.[0]?.node?.text ?? item?.caption?.text ?? item?.caption ?? null,
    postedAt: toIso(item?.taken_at_timestamp ?? item?.taken_at ?? item?.device_timestamp ?? item?.created_at),
  };
}

// --- YouTube via Ensemble ---
async function edYouTube(url: string) {
  const id = ytVideoId(url);
  if (!id) throw new Error("Could not parse YouTube video id");
  const j = await ed("/youtube/video/details", { id });
  const data = j?.data ?? j;
  const v = data?.videoDetails ?? data;
  return {
    stats: {
      views: v?.viewCount ?? v?.view_count,
      likes: v?.likeCount ?? v?.like_count ?? data?.likes,
      comments: v?.commentCount ?? v?.comment_count ?? data?.comments,
    },
    thumb: v?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ?? data?.thumbnail ?? null,
    caption: v?.title ?? data?.title ?? null,
    postedAt: toIso(v?.publishDate ?? v?.publish_date ?? v?.uploadDate ?? v?.upload_date ?? data?.publishedAt ?? data?.published_at ?? data?.uploadDate),
  };
}

// --- Facebook via Ensemble ---
async function edFacebook(url: string) {
  const j = await ed("/facebook/post/details", { url });
  const data = j?.data ?? j;
  return {
    stats: {
      views: data?.video_view_count ?? data?.views ?? data?.play_count,
      likes: data?.likes_count ?? data?.reactions_count ?? data?.likes,
      comments: data?.comments_count ?? data?.comments,
      shares: data?.shares_count ?? data?.shares,
    },
    thumb: data?.thumbnail_url ?? data?.image ?? null,
    caption: data?.message ?? data?.description ?? data?.caption ?? null,
    postedAt: toIso(data?.created_time ?? data?.creation_time ?? data?.timestamp ?? data?.taken_at ?? data?.publish_time),
  };
}

// ----- Apify fallback (Instagram / Facebook / TikTok) -----
const APIFY = Deno.env.get("APIFY_API_TOKEN") ?? "";
// Circuit breakers: both fallbacks are account-suspended today. The first hard
// failure disables them for the rest of the invocation so we don't burn seconds
// per post retrying a provider we know is dead.
const dead = { apify: false, ensemble: false };
function markDead(which: "apify" | "ensemble", msg: string) {
  if (/outstanding invoices|platform-feature-disabled|Subscription expired|\b(?:493|401|403)\b(?=[: ])/i.test(msg)) dead[which] = true;
}
const APIFY_ACTORS: Record<string, string> = {
  instagram: "apify~instagram-scraper",
  facebook: "apify~facebook-posts-scraper",
  tiktok: "clockworks~tiktok-scraper",
};

async function runApifyActor(actor: string, input: any): Promise<any[]> {
  if (!APIFY) throw new Error("APIFY_API_TOKEN not configured");
  const r = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}&timeout=45`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${actor} ${r.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Apify non-JSON: ${text.slice(0, 200)}`); }
}

function mapFacebookItem(item: any) {
  const sfv = item?.short_form_video_context ?? {};
  // Photo/feed permalinks come back in FB's GraphQL shape instead of the flat one.
  const fb = item?.feedback ?? item?.creation_story?.feedback ?? item?.container_story?.feedback ?? {};
  const story = item?.container_story ?? item?.creation_story ?? {};
  const numish = (v: any) => {
    if (v === null || v === undefined) return undefined;
    const n = typeof v === "number" ? v : parseInt(String(v).replace(/[,_]/g, ""), 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    stats: {
      views: numish(
        item?.viewsCount ?? item?.videoViewCount ?? item?.playCount ?? item?.videoPlayCount ??
        item?.video_view_count ?? sfv?.video?.play_count ?? sfv?.playback_video?.play_count ??
        fb?.video_view_count ?? fb?.video_post_view_count,
      ),
      likes: numish(
        item?.likesCount ?? item?.reactionsCount ?? item?.likes ?? item?.reactions?.like ??
        item?.unified_reactors?.count ?? item?.likers?.count ??
        fb?.reactors?.count ?? fb?.unified_reactors?.count ?? fb?.top_reactions?.edges?.[0]?.reaction_count,
      ),
      comments: numish(
        item?.commentsCount ?? item?.comments ?? item?.total_comment_count ??
        fb?.total_comment_count ?? fb?.comment_rendering_instance?.comments?.total_count ??
        fb?.comments?.total_count,
      ),
      shares: numish(
        item?.sharesCount ?? item?.shares ?? item?.share_count_reduced ?? item?.share_count?.count ??
        fb?.share_count?.count ?? fb?.reshare_count,
      ),
    },
    thumb: item?.thumbnailUrl ?? item?.previewImage ?? item?.imageUrl ??
      (typeof item?.image === "string" ? item.image : item?.image?.uri) ??
      sfv?.video?.first_frame_thumbnail ?? sfv?.playback_video?.preferred_thumbnail?.image?.uri ?? null,
    caption: (typeof item?.text === "string" ? item.text : null) ?? item?.message?.text ??
      (typeof item?.message === "string" ? item.message : null) ??
      story?.message?.text ?? item?.description ?? null,
    postedAt: toIso(
      item?.time ?? item?.timestamp ?? item?.date ?? item?.publishedTime ?? item?.creation_time ??
      item?.created_time ?? story?.creation_time,
    ),
  };
}



const hasSignal = (s: any) =>
  [s?.views, s?.likes, s?.comments, s?.shares, s?.saves].some((v) => Number(v || 0) > 0);

// Facebook play counts are not exposed by the post/reel scrapers; a dedicated
// actor resolves reel/watch URLs to their exact play count.
async function apifyFacebookPlayCount(url: string): Promise<number | undefined> {
  try {
    const items = await runApifyActor(
      "social_developer~facebook-playcount-scraper",
      { startUrls: [{ url }], maxConcurrency: 1, maxRetriesPerUrl: 3 },
    );
    const n = Number(items?.[0]?.play_count);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch (e) {
    console.error("Apify facebook playcount failed:", (e as Error).message);
    return undefined;
  }
}

// Facebook permalinks come in several shapes (feed posts, /photo?fbid=, /reel/).
// A single actor can't handle all of them, so try the specialised ones in order.
async function apifyFacebook(url: string) {
  const isVideo = /\/reel\/|\/videos?\/|fb\.watch|watch\/?\?v=/i.test(url);
  const isPhoto = /\/photo/i.test(url);
  const attempts: Array<[string, any]> = [];
  if (isVideo) {
    // posts-scraper reliably returns reaction/comment data for /reel/ URLs;
    // the dedicated reels actor often replies "Empty or private data".
    attempts.push(["apify~facebook-posts-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);
    attempts.push(["apify~facebook-reels-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);
  }
  if (isPhoto) {
    attempts.push(["apify~facebook-photos-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);
  }

  attempts.push(["xtracto~facebook-post-detail", { posts: [url] }]);

  attempts.push(["apify~facebook-posts-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);

  // Play count runs in parallel with the engagement scrapers for video URLs.
  const playCountPromise = isVideo ? apifyFacebookPlayCount(url) : Promise.resolve(undefined);

  let lastErr: unknown = null;
  for (const [actor, input] of attempts) {
    try {
      const items = await runApifyActor(actor, input);
      const item = items?.[0];
      if (!item) continue;
      const mapped = mapFacebookItem(item);
      if (hasSignal(mapped.stats)) {
        const plays = await playCountPromise;
        if (plays && !Number(mapped.stats.views || 0)) mapped.stats.views = plays;
        return mapped;
      }
    } catch (e) {
      lastErr = e;
      console.error(`Apify facebook actor ${actor} failed:`, (e as Error).message);
    }
  }

  // Engagement scrapers all failed — still return views if we got a play count.
  const plays = await playCountPromise;
  if (plays) {
    return { stats: { views: plays }, thumb: null, caption: null, postedAt: null };
  }
  throw new Error(`Apify facebook: no usable data${lastErr ? ` (${(lastErr as Error).message})` : ""}`);
}


async function apifyFetch(kind: "instagram" | "facebook" | "tiktok", url: string) {
  if (kind === "facebook") return await apifyFacebook(url);
  const actor = APIFY_ACTORS[kind];
  const input = kind === "instagram"
    ? { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false }
    : { postURLs: [url], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false };
  const items = await runApifyActor(actor, input);
  const item = items?.[0];
  if (!item) throw new Error(`Apify ${kind}: no items returned`);

  if (kind === "instagram") {
    return {
      stats: {
        views: item?.videoPlayCount ?? item?.videoViewCount ?? item?.playCount,
        likes: item?.likesCount ?? item?.likes,
        comments: item?.commentsCount ?? item?.comments,
        shares: item?.reshareCount,
      },
      thumb: item?.displayUrl ?? item?.thumbnailUrl ?? null,
      caption: typeof item?.caption === "string" ? item.caption : null,
      postedAt: toIso(item?.timestamp ?? item?.takenAtTimestamp),
    };
  }
  // (Facebook is handled above via apifyFacebook.)
  return {
    stats: {
      views: item?.playCount ?? item?.viewCount,
      likes: item?.diggCount ?? item?.likeCount,
      comments: item?.commentCount,
      shares: item?.shareCount,
      saves: item?.collectCount,
    },
    thumb: item?.videoMeta?.coverUrl ?? item?.covers?.[0] ?? null,
    caption: item?.text ?? item?.desc ?? null,
    postedAt: toIso(item?.createTimeISO ?? item?.createTime),
  };
}

// ----- HTML fallbacks (TikTok / YouTube only) -----

async function scrapeTikTokHtml(url: string) {
  const html = await fetchHtml(url);
  const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("TikTok page blocked");
  const j = JSON.parse(m[1]);
  const scope = j?.__DEFAULT_SCOPE__ ?? j;
  const item = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (!item?.stats) throw new Error("TikTok stats not in payload");
  return {
    stats: { views: item.stats.playCount, likes: item.stats.diggCount, comments: item.stats.commentCount, shares: item.stats.shareCount, saves: item.stats.collectCount },
    thumb: item?.video?.cover ?? null,
    caption: item?.desc ?? null,
    postedAt: toIso(item?.createTime ?? item?.create_time),
  };
}

async function scrapeYouTubeHtml(url: string) {
  const html = await fetchHtml(url);
  const viewsM = html.match(/"viewCount":"(\d+)"/);
  if (!viewsM) throw new Error("YouTube blocked");
  const likesM = html.match(/"defaultText":\{"accessibility":\{"accessibilityData":\{"label":"([\d,]+)\s+likes/i);
  const titleM = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i);
  const thumbM = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const dateM = html.match(/"publishDate":"([^"]+)"/) || html.match(/"uploadDate":"([^"]+)"/) || html.match(/<meta\s+itemprop="datePublished"\s+content="([^"]+)"/i);
  return {
    stats: { views: parseInt(viewsM[1], 10), likes: likesM ? parseShortcount(likesM[1]) ?? 0 : 0, comments: 0 },
    thumb: thumbM?.[1] ?? null,
    caption: titleM?.[1] ?? null,
    postedAt: toIso(dateM?.[1] ?? null),
  };
}

// ----- URL canonicalisation -----
// Links copied from the apps carry tracking params (?q=, ?t=, ?igsh=, ?si=) and
// short forms (vm.tiktok.com, fb.watch). Ensemble rejects those outright
// ("Url not valid"), so normalise before any scraper sees the URL.
const SHORT_HOST = /(vm\.tiktok\.com|vt\.tiktok\.com|fb\.watch|youtu\.be\/|instagram\.com\/share\/)/i;

async function resolveShortLink(url: string): Promise<string> {
  if (!SHORT_HOST.test(url)) return url;
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA } });
    return r.url || url;
  } catch { return url; }
}

function canonicalUrl(url: string): string {
  let u = (url || "").trim();
  try {
    const parsed = new URL(u);
    // TikTok / Instagram / Facebook video permalinks never need query params.
    if (/tiktok\.com/i.test(parsed.hostname) && /\/video\/\d+/.test(parsed.pathname)) {
      return `https://www.tiktok.com${parsed.pathname.replace(/\/+$/, "")}`;
    }
    if (/instagram\.com/i.test(parsed.hostname)) {
      const code = igShortcode(u);
      if (code) return `https://www.instagram.com/p/${code}/`;
    }
    if (/youtube\.com|youtu\.be/i.test(parsed.hostname)) {
      const id = ytVideoId(u);
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    // Everything else: drop known tracking params only.
    for (const k of ["q", "t", "igsh", "igshid", "si", "utm_source", "utm_medium", "utm_campaign", "fbclid", "_r", "_t", "is_from_webapp", "sender_device", "web_id"]) {
      parsed.searchParams.delete(k);
    }
    return parsed.toString().replace(/\?$/, "");
  } catch {
    return u;
  }
}

// ----- dispatcher -----
async function scrape(platform: string, rawUrl: string) {
  const p = (platform || "").toLowerCase();
  const url = canonicalUrl(await resolveShortLink((rawUrl || "").trim()));
  const isTikTok = p === "tiktok" || /tiktok\.com/.test(url);
  const isInsta = p === "instagram" || /instagram\.com/.test(url);
  const isYouTube = p === "youtube" || /youtu\.?be/.test(url);
  const isFacebook = p === "facebook" || /facebook\.com|fb\.watch/.test(url);

  // ScrapeCreators is the primary provider (paid per-post, credit-budgeted).
  if (sc.enabled && SCRAPECREATORS_ENABLED) {
    if (sc.used >= sc.budget) {
      sc.capped = true;
    } else {
      const plat = isTikTok ? "tiktok" : isInsta ? "instagram" : isYouTube ? "youtube" : isFacebook ? "facebook" : null;
      if (plat) {
        try {
          const res = await scrapeCreatorsPost(plat, url);
          sc.used += Math.max(1, res.creditsCharged || 0);
          if (res.creditsRemaining != null) sc.remaining = res.creditsRemaining;
          const s: any = res.stats ?? {};
          const hasSignal = ["views", "likes", "comments", "shares", "saves"].some((k) => Number(s?.[k] || 0) > 0);
          if (hasSignal) return { stats: res.stats, thumb: res.thumb, caption: res.caption, postedAt: res.postedAt };
          console.error(`ScrapeCreators returned no metric signal for ${platform}`);
        } catch (e) {
          console.error(`ScrapeCreators failed for ${platform}:`, (e as Error).message);
        }
      }
    }
  }

  // Apify fallback for IG / TikTok / Facebook (account currently suspended).
  if (APIFY && !dead.apify && (isInsta || isFacebook || isTikTok)) {
    try {
      const res = await apifyFetch(isInsta ? "instagram" : isFacebook ? "facebook" : "tiktok", url);
      const s: any = (res as any)?.stats ?? {};
      const hasSignal = ["views", "likes", "comments", "shares", "saves", "reach", "impressions"].some((k) => Number(s?.[k] || 0) > 0);
      if (hasSignal) return res;
      console.error(`Apify returned no metric signal for ${platform}, falling back to Ensemble`);
    } catch (e) {
      const msg = (e as Error).message;
      markDead("apify", msg);
      console.error(`Apify failed for ${platform}:`, msg);
    }
  }

  // Ensemble fallback (and primary for YouTube)
  if (ENSEMBLE_TOKEN && !dead.ensemble) {
    try {
      if (isTikTok) {
        try { return await edTikTok(url); }
        catch (e) {
          const msg = (e as Error).message;
          markDead("ensemble", msg);
          console.error("Ensemble tt/post/info failed, trying author feed:", msg);
          return await edTikTokViaUser(url);
        }
      }
      if (isInsta) return await edInstagram(url);
      if (isYouTube) return await edYouTube(url);
      if (isFacebook) return await edFacebook(url);
    } catch (e) {
      const msg = (e as Error).message;
      markDead("ensemble", msg);
      console.error(`Ensemble failed for ${platform}:`, msg);
    }
  }


  if (isTikTok) return await scrapeTikTokHtml(url);
  if (isYouTube) return await scrapeYouTubeHtml(url);
  if (isInsta) throw new Error("Instagram fetch failed — Apify returned nothing and Ensemble fallback is unavailable");
  if (isFacebook) throw new Error("Facebook scrapers returned no data for this URL — it may be private/age-restricted. Enter metrics manually or connect the Page.");
  throw new Error(`No scraper for platform: ${platform}`);
}

async function processPost(p: any) {
  if (!p.post_url) return { id: p.id, ok: false, error: "no_url" };
  try {
    const scraped = await scrape(p.platform, p.post_url);
    const { thumb, caption, postedAt } = scraped as any;
    const stats = normalizeStats(scraped.stats);
    const hasMetricSignal = [stats.views, stats.likes, stats.comments, stats.shares, stats.saves, stats.reach, stats.impressions].some((v) => Number(v || 0) > 0);
    if (!hasMetricSignal) {
      console.error(`no_public_metrics for ${p.id} (${p.platform}) ${p.post_url} raw=${JSON.stringify(scraped?.stats ?? {}).slice(0, 300)}`);
      return { id: p.id, ok: false, error: "no_public_metrics" };
    }
    await supabase.from("post_metrics").insert({
      post_id: p.id,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      saves: stats.saves,
      reach: stats.reach,
      impressions: stats.impressions,
    });
    const upd: any = {};
    if (thumb && !p.thumbnail_url) upd.thumbnail_url = thumb;
    if (caption && !p.caption) upd.caption = caption;
    if (p.status === "drafted") upd.status = "live";
    // Always trust the platform-reported publish date over any manually-stamped value
    if (postedAt) upd.posted_at = postedAt;
    if (Object.keys(upd).length) await supabase.from("posts").update(upd).eq("id", p.id);
    return { id: p.id, ok: true, stats };
  } catch (e) {
    // Past the run's credit budget the paid lookup was skipped, so this was not a
    // real attempt: report it as such and the post stays due for the next run.
    if (sc.capped) return { id: p.id, ok: false, error: "credit_cap" };
    return { id: p.id, ok: false, error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Every call spends scraper credits: the scheduler, our own functions (self-chaining,
    // creator submissions) or staff on the campaign. Unscoped runs are super admin only.
    const caller = await requireCaller(req, { job: "fetch-public-metrics" });
    if (caller instanceof Response) return caller;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { campaign_id, post_id, stale, max, chain, use_scrapecreators, max_credits } = body as { campaign_id?: string; post_id?: string; stale?: boolean; max?: number; chain?: number; use_scrapecreators?: boolean; max_credits?: number };
    if (caller.kind === "user") {
      let scope = post_id ? null : campaign_id ?? null;
      if (post_id) {
        const { data: target } = await supabase.from("posts").select("campaign_id").eq("id", post_id).maybeSingle();
        scope = target?.campaign_id ?? null;
      }
      const allowed = scope ? await canManageCampaign(caller, scope) : caller.isSuperAdmin;
      if (!allowed) return denied(403, "You don't have access to this campaign.");
    }
    // ScrapeCreators is the default provider now; pass use_scrapecreators:false
    // to force the legacy Apify/Ensemble path.
    sc.enabled = use_scrapecreators !== false && SCRAPECREATORS_ENABLED;
    sc.budget = Math.max(0, Math.min(Number(max_credits ?? (stale ? 40 : 120)), 500));

    sc.used = 0;
    dead.apify = false; dead.ensemble = false;
    sc.capped = false;
    sc.remaining = null;
    const chainDepth = Math.max(0, Number(chain ?? 0));
    const MAX_CHAIN = 40;
    const limit = Math.max(1, Math.min(Number(max ?? 60), 200));

    // One scheduled run at a time: a second cron firing or a stray chain would
    // otherwise scrape the same due posts twice. The lock expires on its own if a
    // run dies, and is released before this run hands over to the next link.
    const LOCK = "fetch-public-metrics:stale";
    if (stale && !post_id) {
      const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 170 });
      if (lockErr) throw lockErr;
      if (!locked) {
        return new Response(JSON.stringify({ ok: 0, failed: 0, total: 0, remaining: null, next_offset: null, results: [], skipped: "another_run_in_progress" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Which posts to read, worked out in SQL (metrics_due_posts) so there is no
    // 1,000-row API cap:
    //   post_id      that one post, always.
    //   stale        the milestone schedule: first reading, then day 1, 3, 7, 14
    //                and 30 after the post went live; draft campaigns skipped.
    //   campaign_id  every post in the campaign not read or tried in the last
    //                hour (staff refresh, e.g. the final reading before payment).
    // Every attempt is recorded, so the next call gets the next posts instead of
    // paging with an offset, and a post that can't be scraped isn't retried each run.
    let posts: any[] = [];
    let totalDue = 0;
    if (post_id) {
      const { data, error } = await supabase
        .from("posts")
        .select("id, post_url, platform, thumbnail_url, caption, status, created_at, posted_at, campaign_id")
        .eq("id", post_id);
      if (error) throw error;
      posts = data ?? [];
      totalDue = posts.length;
    } else {
      if (!stale && !campaign_id) {
        return new Response(JSON.stringify({ error: "Pass post_id, campaign_id or stale." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: due, error: dueErr } = await supabase.rpc("metrics_due_posts", {
        _limit: limit,
        _campaign_id: campaign_id ?? null,
        _min_gap: stale ? null : "1 hour",
      });
      if (dueErr) throw dueErr;
      const ids = ((due ?? []) as { post_id: string; total_due: number }[]).map((d) => d.post_id);
      totalDue = Number((due as any[])?.[0]?.total_due ?? 0);
      if (ids.length) {
        const { data, error } = await supabase
          .from("posts")
          .select("id, post_url, platform, thumbnail_url, caption, status, created_at, posted_at, campaign_id")
          .in("id", ids);
        if (error) throw error;
        posts = data ?? [];
      }
    }

    // Wall-clock budget: stop starting new batches near the edge limit so the caller
    // gets partial results instead of a 504; the rest stay due for the next call.
    const deadline = Date.now() + 100_000;
    const results: any[] = [];
    const chunks = 6;
    let processed = 0;
    for (let i = 0; i < posts.length; i += chunks) {
      if (Date.now() > deadline) break;
      const batch = posts.slice(i, i + chunks);
      const r = await Promise.all(batch.map(processPost));
      // Credit cap hit: the post wasn't really tried, so leave it due.
      await Promise.all(r.filter((x) => x.error !== "credit_cap").map((x) =>
        supabase.rpc("record_post_fetch", { _post_id: x.id, _ok: !!x.ok, _error: x.ok ? null : String(x.error ?? "") })));
      results.push(...r);
      processed += batch.length;
      if (sc.capped) break;
    }
    const leftover = Math.max(0, totalDue - processed);
    const succeeded = results.filter(r => r.ok).length;

    if (stale && !post_id) await supabase.rpc("release_job_lock", { _name: LOCK });

    // Cron runs (stale mode) chain themselves until the due queue is empty, so two
    // scheduled runs a day are enough no matter how many posts are due. Each link
    // has its own credit budget (a link that hits it stops early and hands over).
    // Depth-capped as a backstop; recorded attempts keep failing posts out of the queue.
    if (stale && !post_id && leftover > 0 && processed > 0 && chainDepth < MAX_CHAIN) {
      fetch(`${SUPABASE_URL}/functions/v1/fetch-public-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({ stale: true, max: limit, chain: chainDepth + 1 }),
      }).catch(() => {});
    }

    if (sc.used > 0) {
      await supabase.from("scraper_credit_log").insert({
        provider: "scrapecreators",
        credits: sc.used,
        credits_remaining: sc.remaining,
        campaign_id: campaign_id ?? null,
        context: post_id ? "single_post" : "campaign_refresh",
      });
    }

    const ok = succeeded;
    return new Response(JSON.stringify({ ok, failed: results.length - succeeded, total: results.length, matched: totalDue, remaining: leftover, next_offset: null, results, provider: sc.enabled ? "scrapecreators" : APIFY ? "apify" : ENSEMBLE_TOKEN ? "ensembledata" : "html-fallback", credits_used: sc.used, credits_remaining: sc.remaining, credits_capped: sc.capped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });


  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
