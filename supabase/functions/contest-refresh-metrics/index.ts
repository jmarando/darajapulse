// Refresh public metrics for all contest_entries that already have a post_url.
// Uses Ensemble Data to scrape Instagram / TikTok / Facebook public posts.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ED = Deno.env.get("ENSEMBLEDATA_API_TOKEN") ?? Deno.env.get("ENSEMBLE_DATA_API_TOKEN") ?? "";
const ED_BASE = "https://ensembledata.com/apis";

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

async function scrape(platform: string, url: string) {
  const p = (platform || "").toLowerCase();
  if (p === "tiktok" || /tiktok\.com/.test(url)) return await scrapeTikTok(url);
  if (p === "instagram" || /instagram\.com/.test(url)) return await scrapeInstagram(url);
  if (p === "facebook" || /facebook\.com|fb\.watch/.test(url)) return await scrapeFacebook(url);
  throw new Error(`unsupported platform: ${platform}`);
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

    let updated = 0, failed = 0;
    const errors: any[] = [];
    const CONC = 4;
    for (let i = 0; i < (entries ?? []).length; i += CONC) {
      const batch = (entries ?? []).slice(i, i + CONC);
      await Promise.all(batch.map(async (e) => {
        try {
          const s = await scrape(e.platform, e.post_url!);
          const score = scoreOf(s);
          const upd: any = {
            views: s.views, likes: s.likes, comments: s.comments, shares: s.shares,
            score, last_polled_at: new Date().toISOString(), source: "ensembledata",
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

    return new Response(JSON.stringify({ total: entries?.length ?? 0, updated, failed, errors: errors.slice(0, 30) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
