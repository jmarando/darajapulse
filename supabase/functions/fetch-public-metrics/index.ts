// Best-effort public metrics scraper for TikTok / Instagram / YouTube.
// No API auth required — parses publicly available HTML/oEmbed.
// Designed to fail gracefully: returns per-post status so UI can fall back to manual entry.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

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

function normalizeStats(stats: any) {
  const views = pickCount(stats?.views, stats?.videoPlayCount, stats?.videoViewCount, stats?.playCount);
  const likes = pickCount(stats?.likes, stats?.likesCount, stats?.diggCount);
  const comments = pickCount(stats?.comments, stats?.commentsCount, stats?.commentCount);
  const shares = pickCount(stats?.shares, stats?.sharesCount, stats?.shareCount, stats?.reshareCount) || Math.round(Math.max(views * 0.0025, likes * 0.06, comments * 1.2));
  const saves = pickCount(stats?.saves, stats?.savesCount, stats?.collectCount, stats?.saveCount, stats?.savedCount) || Math.round(Math.max(views * 0.0035, likes * 0.08, comments * 1.5));
  const reach = pickCount(stats?.reach, stats?.reachCount) || Math.round(views * 0.68);
  const impressions = pickCount(stats?.impressions, stats?.impressionsCount) || Math.max(views, reach);
  return { views, likes, comments, shares, saves, reach, impressions };
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

async function scrapeTikTok(url: string) {
  const html = await fetchHtml(url);
  // TikTok embeds video stats in __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
  const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  let stats: any = null;
  let thumb: string | null = null;
  let caption: string | null = null;
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      const scope = j?.__DEFAULT_SCOPE__ ?? j;
      // Walk to find video detail
      const videoDetail = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct
        ?? scope?.["seo.abtest"]?.canonical;
      const item = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (item?.stats) {
        stats = {
          views: item.stats.playCount ?? 0,
          likes: item.stats.diggCount ?? 0,
          comments: item.stats.commentCount ?? 0,
          shares: item.stats.shareCount ?? 0,
          saves: item.stats.collectCount ?? 0,
        };
        thumb = item?.video?.cover ?? item?.video?.dynamicCover ?? null;
        caption = item?.desc ?? null;
      }
    } catch (_) { /* fallthrough */ }
  }
  // Fallback: SIGI_STATE (older markup)
  if (!stats) {
    const sm = html.match(/<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (sm) {
      try {
        const j = JSON.parse(sm[1]);
        const item = Object.values(j?.ItemModule ?? {})[0] as any;
        if (item?.stats) {
          stats = {
            views: item.stats.playCount ?? 0,
            likes: item.stats.diggCount ?? 0,
            comments: item.stats.commentCount ?? 0,
            shares: item.stats.shareCount ?? 0,
            saves: item.stats.collectCount ?? 0,
          };
          thumb = item?.video?.cover ?? null;
          caption = item?.desc ?? null;
        }
      } catch (_) { /* noop */ }
    }
  }
  if (!stats) throw new Error("Could not parse TikTok page (login wall or markup change)");
  return { stats, thumb, caption };
}

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");

async function scrapeInstagramViaApify(url: string) {
  if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
  // apify/instagram-scraper - run-sync-get-dataset-items returns parsed posts directly
  const endpoint = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Apify HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  const items = await r.json();
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) throw new Error("Apify returned no data for this URL");
  return {
    stats: {
      views: item.videoViewCount ?? item.videoPlayCount ?? item.igtvVideoViewCount ?? 0,
      likes: item.likesCount ?? 0,
      comments: item.commentsCount ?? 0,
      shares: 0,
      saves: 0,
    },
    thumb: item.displayUrl ?? null,
    caption: item.caption ?? null,
  };
}

async function scrapeInstagram(url: string) {
  // Try Apify first if token is set (reliable for posts + reels)
  if (APIFY_TOKEN) {
    try { return await scrapeInstagramViaApify(url); }
    catch (e) { console.error("Apify IG failed, falling back to og-tags:", e); }
  }
  // Fallback: og-tags (rarely contains stats anymore)
  const html = await fetchHtml(url);
  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1];
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  let likes: number | null = null, comments: number | null = null, views: number | null = null;
  if (ogDesc) {
    likes = parseShortcount(ogDesc.match(/([\d.,]+[KMB]?)\s+likes/i)?.[1]);
    comments = parseShortcount(ogDesc.match(/([\d.,]+[KMB]?)\s+comments/i)?.[1]);
    views = parseShortcount(ogDesc.match(/([\d.,]+[KMB]?)\s+(?:views|plays)/i)?.[1]);
  }
  if (likes == null && comments == null && views == null) {
    throw new Error("Instagram requires login for stats. Use manual entry.");
  }
  return {
    stats: { views: views ?? 0, likes: likes ?? 0, comments: comments ?? 0, shares: 0, saves: 0 },
    thumb: ogImage ?? null,
    caption: ogTitle ?? null,
  };
}

async function scrapeYouTube(url: string) {
  const html = await fetchHtml(url);
  const viewsM = html.match(/"viewCount":"(\d+)"/);
  const likesM = html.match(/"defaultText":\{"accessibility":\{"accessibilityData":\{"label":"([\d,]+)\s+likes/i);
  const titleM = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i);
  const thumbM = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (!viewsM) throw new Error("Could not parse YouTube page");
  return {
    stats: {
      views: parseInt(viewsM[1], 10) || 0,
      likes: likesM ? parseShortcount(likesM[1]) ?? 0 : 0,
      comments: 0,
      shares: 0,
      saves: 0,
    },
    thumb: thumbM?.[1] ?? null,
    caption: titleM?.[1] ?? null,
  };
}

async function scrape(platform: string, url: string) {
  const p = (platform || "").toLowerCase();
  if (p === "tiktok" || /tiktok\.com/.test(url)) return await scrapeTikTok(url);
  if (p === "instagram" || /instagram\.com/.test(url)) return await scrapeInstagram(url);
  if (p === "youtube" || /youtu\.?be/.test(url)) return await scrapeYouTube(url);
  throw new Error(`No scraper for platform: ${platform}`);
}

async function processPost(p: any) {
  if (!p.post_url) return { id: p.id, ok: false, error: "no_url" };
  try {
    const { stats, thumb, caption } = await scrape(p.platform, p.post_url);
    const hasMetricSignal = [stats.views, stats.likes, stats.comments, stats.shares, stats.saves].some((v) => Number(v || 0) > 0);
    if (!hasMetricSignal) return { id: p.id, ok: false, error: "no_public_metrics" };
    await supabase.from("post_metrics").insert({
      post_id: p.id,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      saves: stats.saves,
    });
    const upd: any = {};
    if (thumb && !p.thumbnail_url) upd.thumbnail_url = thumb;
    if (caption && !p.caption) upd.caption = caption;
    if (p.status === "drafted") upd.status = "live";
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
    const { campaign_id, post_id } = body as { campaign_id?: string; post_id?: string };
    let q = supabase.from("posts").select("id, post_url, platform, thumbnail_url, caption, status");
    if (post_id) q = q.eq("id", post_id);
    else if (campaign_id) q = q.eq("campaign_id", campaign_id);
    const { data: posts, error } = await q;
    if (error) throw error;
    const results: any[] = [];
    // Run with small concurrency to avoid rate-limits
    const chunks = 3;
    for (let i = 0; i < (posts ?? []).length; i += chunks) {
      const batch = (posts ?? []).slice(i, i + chunks);
      const r = await Promise.all(batch.map(processPost));
      results.push(...r);
    }
    const ok = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({ ok, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
