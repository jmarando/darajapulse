// Refresh public metrics for all contest_entries that already have a post_url.
// Primary: Ensemble Data. Fallback: Apify actors (TikTok/IG/FB) when Ensemble
// returns no signal or errors. Short-link resolution for vt.tiktok.com.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ED = Deno.env.get("ENSEMBLEDATA_API_TOKEN") ?? Deno.env.get("ENSEMBLE_DATA_API_TOKEN") ?? "";
const ED_BASE = "https://ensembledata.com/apis";
const APIFY = Deno.env.get("APIFY_API_TOKEN") ?? "";
const APIFY_ACTORS = {
  tiktok: "clockworks~tiktok-scraper",
  instagram: "apify~instagram-scraper",
  facebook: "apify~facebook-posts-scraper",
};

const scoreOf = (s: { shares?: any; comments?: any; likes?: any; views?: any }) =>
  Number(s.shares || 0) * 3 + Number(s.comments || 0) * 2 + Number(s.likes || 0) + Number(s.views || 0);


async function ed(path: string, params: Record<string, string>) {
  if (!ED) throw new Error("ENSEMBLEDATA_API_TOKEN not configured");
  const qs = new URLSearchParams({ ...params, token: ED }).toString();
  const r = await fetch(`${ED_BASE}${path}?${qs}`);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Ensemble non-JSON [${r.status}]: ${text.slice(0,200)}`); }
  if (!r.ok) throw new Error(`Ensemble ${path} ${r.status}: ${JSON.stringify(json).slice(0,200)}`);
  return json;
}

const num = (v: any) => { const n = typeof v === "number" ? v : parseInt(String(v ?? "0").replace(/[,_]/g,""),10); return Number.isFinite(n) ? n : 0; };

function igShortcode(url: string): string | null {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

async function scrapeTikTok(url: string) {
  const j = await ed("/tt/post/info", { url });
  const data = j?.data ?? j;
  const item = data?.aweme_detail ?? data?.itemInfo?.itemStruct ?? data?.item ?? data;
  const s = item?.statistics ?? item?.stats ?? item;
  return {
    views: num(s?.play_count ?? s?.playCount ?? s?.view_count),
    likes: num(s?.digg_count ?? s?.diggCount ?? s?.like_count),
    comments: num(s?.comment_count ?? s?.commentCount),
    shares: num(s?.share_count ?? s?.shareCount),
    caption: item?.desc ?? item?.title ?? null,
    thumbnail_url: item?.video?.cover?.url_list?.[0] ?? item?.video?.origin_cover?.url_list?.[0] ?? null,
  };
}

async function scrapeInstagram(url: string) {
  const code = igShortcode(url);
  if (!code) throw new Error("invalid Instagram URL");
  const j = await ed("/instagram/post/details", { code });
  const data = j?.data ?? j;
  const item = data?.shortcode_media ?? data?.items?.[0] ?? data;
  return {
    views: num(item?.video_view_count ?? item?.video_play_count ?? item?.play_count),
    likes: num(item?.edge_media_preview_like?.count ?? item?.like_count),
    comments: num(item?.edge_media_to_comment?.count ?? item?.comment_count),
    shares: num(item?.reshare_count ?? item?.share_count),
    caption: item?.edge_media_to_caption?.edges?.[0]?.node?.text ?? item?.caption?.text ?? item?.caption ?? null,
    thumbnail_url: item?.display_url ?? item?.thumbnail_url ?? item?.image_versions2?.candidates?.[0]?.url ?? null,
  };
}

async function scrapeFacebook(url: string) {
  const j = await ed("/facebook/post/details", { url });
  const data = j?.data ?? j;
  return {
    views: num(data?.video_view_count ?? data?.views ?? data?.play_count),
    likes: num(data?.likes_count ?? data?.reactions_count ?? data?.likes),
    comments: num(data?.comments_count ?? data?.comments),
    shares: num(data?.shares_count ?? data?.shares),
    caption: data?.message ?? data?.description ?? data?.caption ?? null,
    thumbnail_url: data?.thumbnail_url ?? data?.image ?? null,
  };
}

// ---------- URL validation & normalization ----------
async function resolveTikTokShort(url: string): Promise<string> {
  // vt.tiktok.com / vm.tiktok.com short links → follow redirect to canonical video URL.
  if (!/(?:vt|vm)\.tiktok\.com\//i.test(url)) return url;
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
    });
    const finalUrl = r.url || url;
    // Strip query string for cleanliness
    try { const u = new URL(finalUrl); return `${u.origin}${u.pathname}`; } catch { return finalUrl; }
  } catch { return url; }
}

function isValidPostUrl(platform: string, url: string): boolean {
  const u = (url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  const p = (platform || "").toLowerCase();
  if (p === "tiktok") return /(?:vt|vm)\.tiktok\.com\/[A-Za-z0-9]+/i.test(u) || /tiktok\.com\/.+\/video\/\d+/i.test(u) || /tiktok\.com\/video\/\d+/i.test(u);
  if (p === "instagram") return /instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+/i.test(u);
  if (p === "facebook") return /facebook\.com\/.+\/(?:posts|videos|reel|photos)\/|fb\.watch\//i.test(u);
  return false;
}

// ---------- Apify fallback ----------
async function runApify(actor: string, input: any): Promise<any[]> {
  if (!APIFY) throw new Error("APIFY_API_TOKEN not configured");
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}&timeout=180`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${actor} ${r.status}: ${text.slice(0,200)}`);
  try { return JSON.parse(text); } catch { return []; }
}

async function apifyTikTok(url: string) {
  const items = await runApify(APIFY_ACTORS.tiktok, { postURLs: [url], shouldDownloadVideos: false, shouldDownloadCovers: false, resultsPerPage: 1 });
  const it = items?.[0]; if (!it) throw new Error("apify tt no result");
  return {
    views: num(it.playCount ?? it.viewCount), likes: num(it.diggCount ?? it.likeCount),
    comments: num(it.commentCount), shares: num(it.shareCount),
    caption: it.text ?? it.desc ?? null,
    thumbnail_url: it?.videoMeta?.coverUrl ?? it?.covers?.[0] ?? null,
  };
}
async function apifyInstagram(url: string) {
  const items = await runApify(APIFY_ACTORS.instagram, { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false });
  const it = items?.[0]; if (!it) throw new Error("apify ig no result");
  return {
    views: num(it.videoPlayCount ?? it.videoViewCount ?? it.playCount),
    likes: num(it.likesCount ?? it.likes), comments: num(it.commentsCount ?? it.comments),
    shares: num(it.reshareCount ?? 0),
    caption: it.caption ?? null, thumbnail_url: it.displayUrl ?? it.thumbnailUrl ?? null,
  };
}
async function apifyFacebook(url: string) {
  const items = await runApify(APIFY_ACTORS.facebook, { startUrls: [{ url }], resultsLimit: 1 });
  const it = items?.[0]; if (!it) throw new Error("apify fb no result");
  return {
    views: num(it.viewsCount ?? it.videoViewCount ?? it.playCount),
    likes: num(it.likesCount ?? it.reactionsCount ?? it.likes),
    comments: num(it.commentsCount ?? it.comments),
    shares: num(it.sharesCount ?? it.shares),
    caption: it.text ?? it.message ?? null,
    thumbnail_url: it.thumbnailUrl ?? it.previewImage ?? null,
  };
}

async function scrape(platform: string, url: string) {
  const p = (platform || "").toLowerCase();
  const isTT = p === "tiktok" || /tiktok\.com/.test(url);
  const isIG = p === "instagram" || /instagram\.com/.test(url);
  const isFB = p === "facebook" || /facebook\.com|fb\.watch/.test(url);
  const hasSignal = (s: any) => s && ((s.views|0) || (s.likes|0) || (s.comments|0) || (s.shares|0));

  let primary: any = null, primaryErr: any = null;
  try {
    if (isTT) primary = await scrapeTikTok(url);
    else if (isIG) primary = await scrapeInstagram(url);
    else if (isFB) primary = await scrapeFacebook(url);
  } catch (e) { primaryErr = e; }

  if (hasSignal(primary)) return { ...primary, _source: "ensembledata" };

  // Apify fallback
  if (APIFY) {
    try {
      let fb: any = null;
      if (isTT) fb = await apifyTikTok(url);
      else if (isIG) fb = await apifyInstagram(url);
      else if (isFB) fb = await apifyFacebook(url);
      if (hasSignal(fb)) return { ...fb, _source: "apify" };
    } catch (e) { if (!primaryErr) primaryErr = e; }
  }
  if (primaryErr) throw primaryErr;
  return primary ?? { views: 0, likes: 0, comments: 0, shares: 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    if (!contest_id) return new Response(JSON.stringify({ error: "contest_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const onlyEmpty: boolean = body.only_empty ?? false;

    let q = sb.from("contest_entries")
      .select("id, platform, post_url, views, likes, comments, shares")
      .eq("contest_id", contest_id)
      .not("post_url", "is", null);
    if (onlyEmpty) q = q.eq("views", 0).eq("likes", 0).eq("comments", 0).eq("shares", 0);
    const { data: entries, error } = await q;
    if (error) throw error;

    let updated = 0, failed = 0, invalid = 0;
    const errors: any[] = [];
    const CONC = 4;
    for (let i = 0; i < (entries ?? []).length; i += CONC) {
      const batch = (entries ?? []).slice(i, i + CONC);
      await Promise.all(batch.map(async (e) => {
        try {
          // Validate / resolve URL
          let url = (e.post_url || "").trim();
          if ((e.platform || "").toLowerCase() === "tiktok") url = await resolveTikTokShort(url);
          if (!isValidPostUrl(e.platform, url)) {
            invalid++;
            errors.push({ id: e.id, platform: e.platform, post_url: e.post_url, msg: "invalid_post_url" });
            // Mark as invalid so it stops being retried
            await sb.from("contest_entries").update({ status: "invalid", last_polled_at: new Date().toISOString() }).eq("id", e.id);
            return;
          }

          const s = await scrape(e.platform, url);
          const hasSignal = (s.views || s.likes || s.comments || s.shares) > 0;
          if (!hasSignal) {
            failed++;
            errors.push({ id: e.id, platform: e.platform, post_url: url, msg: "no_metrics_returned" });
            return;
          }
          const score = scoreOf(s);
          const upd: any = {
            views: s.views, likes: s.likes, comments: s.comments, shares: s.shares,
            score, last_polled_at: new Date().toISOString(), source: s._source || "ensembledata",
          };
          if (s.caption) upd.caption = String(s.caption).slice(0, 1000);
          if (s.thumbnail_url) upd.thumbnail_url = s.thumbnail_url;
          const { error: uerr } = await sb.from("contest_entries").update(upd).eq("id", e.id);
          if (uerr) throw uerr;
          updated++;
        } catch (err) {
          failed++;
          errors.push({ id: e.id, platform: e.platform, post_url: e.post_url, msg: err instanceof Error ? err.message : String(err) });
        }
      }));
    }

    return new Response(JSON.stringify({ total: entries?.length ?? 0, updated, failed, invalid, errors: errors.slice(0, 50) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

