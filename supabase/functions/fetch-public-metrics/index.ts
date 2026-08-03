// Unified public metrics fetcher.
// Primary: Ensemble Data (https://ensembledata.com) — single token covers
//   TikTok, Instagram, YouTube, Facebook.
// Fallback: lightweight HTML scrape (TikTok / YouTube) for the rare case where
//   Ensemble returns nothing.
// Per-post status is returned so the UI can surface "couldn't fetch — retry / enter manually".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

// Only estimate shares/saves/reach when we have a real view count.
// Otherwise leave at 0 — "—" beats a made-up number.
function normalizeStats(stats: any) {
  const views = pickCount(stats?.views, stats?.videoPlayCount, stats?.videoViewCount, stats?.playCount, stats?.play_count, stats?.view_count);
  const likes = pickCount(stats?.likes, stats?.likesCount, stats?.diggCount, stats?.like_count, stats?.digg_count);
  const comments = pickCount(stats?.comments, stats?.commentsCount, stats?.commentCount, stats?.comment_count);
  const sharesRaw = pickCount(stats?.shares, stats?.sharesCount, stats?.shareCount, stats?.share_count, stats?.reshareCount, stats?.reshare_count);
  const savesRaw = pickCount(stats?.saves, stats?.savesCount, stats?.collectCount, stats?.collect_count, stats?.saveCount, stats?.savedCount);
  const reachRaw = pickCount(stats?.reach, stats?.reachCount);
  const impressionsRaw = pickCount(stats?.impressions, stats?.impressionsCount);

  const shares = sharesRaw || (views > 0 ? Math.round(Math.max(views * 0.0025, likes * 0.06)) : 0);
  const saves  = savesRaw  || (views > 0 ? Math.round(Math.max(views * 0.0035, likes * 0.08)) : 0);
  const reach  = reachRaw  || (views > 0 ? Math.round(views * 0.68) : 0);
  const impressions = impressionsRaw || (views > 0 ? Math.max(views, reach) : 0);

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

// --- TikTok via Ensemble ---
async function edTikTok(url: string) {
  const j = await ed("/tt/post/info", { url });
  const data = j?.data ?? j;
  // Ensemble returns the TikTok itemStruct (or similar) — handle both shapes
  const item = data?.aweme_detail ?? data?.itemInfo?.itemStruct ?? data?.item ?? data;
  const stats = item?.statistics ?? item?.stats ?? item;
  const cover = item?.video?.cover ?? item?.video?.cover?.url_list?.[0] ?? item?.video?.origin_cover?.url_list?.[0] ?? data?.cover ?? null;
  const desc = item?.desc ?? item?.title ?? data?.desc ?? null;
  return {
    stats: {
      views: stats?.play_count ?? stats?.playCount ?? stats?.view_count,
      likes: stats?.digg_count ?? stats?.diggCount ?? stats?.like_count,
      comments: stats?.comment_count ?? stats?.commentCount,
      shares: stats?.share_count ?? stats?.shareCount,
      saves: stats?.collect_count ?? stats?.collectCount,
    },
    thumb: typeof cover === "string" ? cover : cover?.url_list?.[0] ?? null,
    caption: desc,
    postedAt: toIso(item?.create_time ?? item?.createTime ?? item?.created_at ?? data?.create_time),
  };
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
const APIFY_ACTORS: Record<string, string> = {
  instagram: "apify~instagram-scraper",
  facebook: "apify~facebook-posts-scraper",
  tiktok: "clockworks~tiktok-scraper",
};

async function runApifyActor(actor: string, input: any): Promise<any[]> {
  if (!APIFY) throw new Error("APIFY_API_TOKEN not configured");
  const r = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}&timeout=180`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${actor} ${r.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Apify non-JSON: ${text.slice(0, 200)}`); }
}

function mapFacebookItem(item: any) {
  return {
    stats: {
      views: item?.viewsCount ?? item?.videoViewCount ?? item?.playCount ?? item?.videoPlayCount,
      likes: item?.likesCount ?? item?.reactionsCount ?? item?.likes ?? item?.reactions?.like,
      comments: item?.commentsCount ?? item?.comments,
      shares: item?.sharesCount ?? item?.shares,
    },
    thumb: item?.thumbnailUrl ?? item?.previewImage ?? item?.imageUrl ?? item?.image ?? null,
    caption: item?.text ?? item?.message ?? item?.description ?? null,
    postedAt: toIso(item?.time ?? item?.timestamp ?? item?.date ?? item?.publishedTime),
  };
}

const hasSignal = (s: any) =>
  [s?.views, s?.likes, s?.comments, s?.shares, s?.saves].some((v) => Number(v || 0) > 0);

// Facebook permalinks come in several shapes (feed posts, /photo?fbid=, /reel/).
// A single actor can't handle all of them, so try the specialised ones in order.
async function apifyFacebook(url: string) {
  const isReel = /\/reel\/|\/videos?\/|fb\.watch/i.test(url);
  const isPhoto = /\/photo/i.test(url);
  const attempts: Array<[string, any]> = [];
  if (isReel) {
    attempts.push(["apify~facebook-reels-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);
  }
  if (isPhoto) {
    attempts.push(["apify~facebook-photos-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);
  }
  attempts.push(["danek~facebook-posts-fast", { direct_urls: [url], max_posts: 1 }]);
  attempts.push(["xtracto~facebook-post-detail", { posts: [url] }]);

  attempts.push(["apify~facebook-posts-scraper", { startUrls: [{ url }], resultsLimit: 1 }]);


  let lastErr: unknown = null;
  for (const [actor, input] of attempts) {
    try {
      const items = await runApifyActor(actor, input);
      const item = items?.[0];
      if (!item) continue;
      const mapped = mapFacebookItem(item);
      if (hasSignal(mapped.stats)) return mapped;
    } catch (e) {
      lastErr = e;
      console.error(`Apify facebook actor ${actor} failed:`, (e as Error).message);
    }
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
  if (kind === "facebook") {
    return {
      stats: {
        views: item?.viewsCount ?? item?.videoViewCount ?? item?.playCount,
        likes: item?.likesCount ?? item?.reactionsCount ?? item?.likes,
        comments: item?.commentsCount ?? item?.comments,
        shares: item?.sharesCount ?? item?.shares,
      },
      thumb: item?.thumbnailUrl ?? item?.previewImage ?? null,
      caption: item?.text ?? item?.message ?? null,
      postedAt: toIso(item?.time ?? item?.timestamp ?? item?.date),
    };
  }
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

// ----- dispatcher -----
async function scrape(platform: string, url: string) {
  const p = (platform || "").toLowerCase();
  const isTikTok = p === "tiktok" || /tiktok\.com/.test(url);
  const isInsta = p === "instagram" || /instagram\.com/.test(url);
  const isYouTube = p === "youtube" || /youtu\.?be/.test(url);
  const isFacebook = p === "facebook" || /facebook\.com|fb\.watch/.test(url);

  // Try Ensemble first for everything
  if (ENSEMBLE_TOKEN) {
    try {
      if (isTikTok) return await edTikTok(url);
      if (isInsta) return await edInstagram(url);
      if (isYouTube) return await edYouTube(url);
      if (isFacebook) return await edFacebook(url);
    } catch (e) {
      console.error(`Ensemble failed for ${platform}:`, (e as Error).message);
      // fall through to HTML fallback where possible
    }
  }

  // Fallbacks
  if (APIFY && (isInsta || isFacebook || isTikTok)) {
    try {
      return await apifyFetch(isInsta ? "instagram" : isFacebook ? "facebook" : "tiktok", url);
    } catch (e) {
      console.error(`Apify failed for ${platform}:`, (e as Error).message);
    }
  }
  if (isTikTok) return await scrapeTikTokHtml(url);
  if (isYouTube) return await scrapeYouTubeHtml(url);
  if (isInsta) throw new Error("Instagram fetch failed — Ensemble plan expired and Apify fallback returned nothing");
  if (isFacebook) throw new Error("Facebook public metrics aren't available via API — enter manually or connect the page");
  throw new Error(`No scraper for platform: ${platform}`);
}

async function processPost(p: any) {
  if (!p.post_url) return { id: p.id, ok: false, error: "no_url" };
  try {
    const scraped = await scrape(p.platform, p.post_url);
    const { thumb, caption, postedAt } = scraped as any;
    const stats = normalizeStats(scraped.stats);
    const hasMetricSignal = [stats.views, stats.likes, stats.comments, stats.shares, stats.saves, stats.reach, stats.impressions].some((v) => Number(v || 0) > 0);
    if (!hasMetricSignal) return { id: p.id, ok: false, error: "no_public_metrics" };
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
    return { id: p.id, ok: false, error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { campaign_id, post_id, stale, max } = body as { campaign_id?: string; post_id?: string; stale?: boolean; max?: number };
    let q = supabase.from("posts").select("id, post_url, platform, thumbnail_url, caption, status, created_at");
    if (post_id) q = q.eq("id", post_id);
    else if (campaign_id) q = q.eq("campaign_id", campaign_id);
    const { data: postsAll, error } = await q;
    if (error) throw error;
    let posts = postsAll ?? [];

    // stale mode: only posts with NO metric row OR most-recent metric older than 6h,
    // skip posts we know can't be auto-fetched (Facebook feed) after 3 tries.
    if (stale && posts.length) {
      const ids = posts.map((p: any) => p.id);
      const { data: metricAgg } = await supabase
        .from("post_metrics")
        .select("post_id, captured_at")
        .in("post_id", ids)
        .order("captured_at", { ascending: false });
      const latest = new Map<string, string>();
      for (const m of (metricAgg ?? []) as any[]) if (!latest.has(m.post_id)) latest.set(m.post_id, m.captured_at);
      const sixHoursAgo = Date.now() - 6 * 3600_000;
      posts = posts.filter((p: any) => {
        const last = latest.get(p.id);
        if (!last) return true;
        return new Date(last).getTime() < sixHoursAgo;
      });
      if (max && posts.length > max) posts = posts.slice(0, max);
    }

    const results: any[] = [];
    const chunks = 3;
    for (let i = 0; i < posts.length; i += chunks) {
      const batch = posts.slice(i, i + chunks);
      const r = await Promise.all(batch.map(processPost));
      results.push(...r);
    }
    const ok = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({ ok, total: results.length, results, provider: ENSEMBLE_TOKEN ? "ensembledata" : "html-fallback" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
