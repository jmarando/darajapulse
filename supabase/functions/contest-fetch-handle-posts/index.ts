// Handle-driven post fetcher.
// For each registered contestant in a contest that has an IG or TikTok handle
// but no scraped metrics yet, pulls their recent public posts via
// EnsembleData, filters by the contest hashtag, and writes the
// highest-scoring matching post back onto the contestant row.
// Facebook is intentionally skipped — FB requires manual entry.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ED = Deno.env.get("ENSEMBLEDATA_API_TOKEN");

const scoreOf = (s: { shares?: any; comments?: any; likes?: any; views?: any }) =>
  Number(s.shares || 0) * 3 + Number(s.comments || 0) * 2 + Number(s.likes || 0) + Number(s.views || 0);

const postTime = (post: any) => {
  const t = new Date(post?.posted_at || post?.created_at || 0).getTime();
  return Number.isFinite(t) && t > 0 ? t : Number.MAX_SAFE_INTEGER;
};

const cleanHandle = (s?: string | null) =>
  (s || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase();

const isLikelyHandle = (handle: string) => /^[a-z0-9._]{2,30}$/i.test(handle);

const captionHas = (text: string | undefined, tags: string[]) => {
  if (!text) return false;
  const lc = text.toLowerCase();
  return tags.some((t) => lc.includes(t.toLowerCase().replace(/^#/, "")));
};

const canonical = (raw?: string | null): string => {
  if (!raw) return "";
  const url = raw.trim();
  const tt = url.match(/tiktok\.com\/.*?(?:\/video\/|\/v\/|share_item_id=)(\d{6,})/i);
  if (tt) return `https://www.tiktok.com/video/${tt[1]}`;
  const ig = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/`;
  try { const u = new URL(url); return `${u.origin}${u.pathname}`.replace(/\/+$/, ""); } catch { return url; }
};

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.posts)) return value.posts;
  if (Array.isArray(value?.edges)) return value.edges.map((edge: any) => edge?.node ?? edge).filter(Boolean);
  return [];
};

async function fetchTikTokUserPosts(handle: string) {
  if (!isLikelyHandle(handle)) throw new Error("invalid_handle: expected a TikTok username, not a display name");
  const url = `https://ensembledata.com/apis/tt/user/posts?username=${encodeURIComponent(handle)}&depth=1&token=${ED}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`TT ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const items = asArray(j?.data?.data ?? j?.data ?? j);
  return items.map((it: any) => {
    const a = it.aweme_detail || it;
    const author = a.author?.unique_id || a.author?.uniqueId || handle;
    const vid = a.aweme_id || a.id;
    return {
      caption: a.desc || "",
      post_url: canonical(a.share_url || (vid ? `https://www.tiktok.com/@${author}/video/${vid}` : null)),
      thumbnail_url: a.video?.cover?.url_list?.[0] || a.video?.origin_cover?.url_list?.[0] || null,
      posted_at: a.create_time ? new Date(Number(a.create_time) * 1000).toISOString() : null,
      views: Number(a.statistics?.play_count ?? 0),
      likes: Number(a.statistics?.digg_count ?? 0),
      comments: Number(a.statistics?.comment_count ?? 0),
      shares: Number(a.statistics?.share_count ?? 0),
    };
  }).filter((p: any) => p.post_url);
}

function extractIgUserId(payload: any): string | null {
  const candidates = [
    payload?.data?.user?.id,
    payload?.data?.id,
    payload?.user?.id,
    payload?.id,
    payload?.data?.pk,
    payload?.user?.pk,
    payload?.pk,
  ];
  return candidates.find((v) => v != null && String(v).trim())?.toString() ?? null;
}

async function fetchInstagramUserPosts(handle: string) {
  if (!isLikelyHandle(handle)) throw new Error("invalid_handle: expected an Instagram username, not a display name");
  const infoUrl = `https://ensembledata.com/apis/instagram/user/info?username=${encodeURIComponent(handle)}&token=${ED}`;
  const infoRes = await fetch(infoUrl);
  const infoJson = await infoRes.json();
  if (!infoRes.ok) throw new Error(`IG user lookup ${infoRes.status}: ${JSON.stringify(infoJson).slice(0, 200)}`);
  const userId = extractIgUserId(infoJson);
  if (!userId) throw new Error("instagram_user_id_not_found");

  const url = `https://ensembledata.com/apis/instagram/user/posts?user_id=${encodeURIComponent(userId)}&depth=1&chunk_size=20&token=${ED}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`IG ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const items = asArray(j?.data?.data ?? j?.data ?? j);
  return items.map((it: any) => {
    const caption = it.caption?.text || it.edge_media_to_caption?.edges?.[0]?.node?.text || it.caption || "";
    const code = it.code || it.shortcode;
    const post_url = canonical(code ? `https://www.instagram.com/p/${code}/` : it.permalink);
    return {
      caption,
      post_url,
      thumbnail_url: it.thumbnail_url || it.display_url || it.image_versions2?.candidates?.[0]?.url || null,
      posted_at: it.taken_at ? new Date(Number(it.taken_at) * 1000).toISOString() : null,
      views: Number(it.play_count ?? it.video_view_count ?? 0),
      likes: Number(it.like_count ?? it.edge_liked_by?.count ?? 0),
      comments: Number(it.comment_count ?? it.edge_media_to_comment?.count ?? 0),
      shares: 0,
    };
  }).filter((p: any) => p.post_url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let runId: string | null = null;
  try {
    if (!ED) throw new Error("ENSEMBLEDATA_API_TOKEN not configured");
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    if (!contest_id) return new Response(JSON.stringify({ error: "contest_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: contest } = await sb.from("contests").select("*, campaigns(hashtag, hashtags_extra)").eq("id", contest_id).single();
    if (!contest) throw new Error("contest not found");
    const tags: string[] = [contest.hashtag, contest.campaigns?.hashtag, ...(contest.campaigns?.hashtags_extra || [])].filter(Boolean);

    const { data: run } = await sb.from("contestant_sync_runs").insert({
      contest_id, source: "handle_fetch", triggered_by: body.triggered_by ?? "manual", status: "running",
    }).select("id").single();
    runId = run?.id ?? null;

    // Candidates: registered entries with a TT or IG handle. FB skipped.
    const { data: entries } = await sb.from("contest_entries")
      .select("id, handle, tiktok_handle, instagram_handle, platform, post_url, views, likes, comments, shares, source")
      .eq("contest_id", contest_id);

    let fetched = 0, upserted = 0;
    const errors: any[] = [];
    const only: string | undefined = body.only_handle;

    for (const e of entries ?? []) {
      const candidates: { platform: "tiktok" | "instagram"; handle: string }[] = [];
      const tt = cleanHandle(e.tiktok_handle);
      const ig = cleanHandle(e.instagram_handle);
      const fallback = cleanHandle(e.handle);
      if (tt) candidates.push({ platform: "tiktok", handle: tt });
      if (ig) candidates.push({ platform: "instagram", handle: ig });
      if (!candidates.length && fallback && (e.platform === "tiktok" || e.platform === "instagram")) {
        candidates.push({ platform: e.platform as any, handle: fallback });
      }
      const onlyHandle = cleanHandle(only);
      if (onlyHandle && !candidates.some(c => c.handle.toLowerCase() === onlyHandle)) continue;
      if (!candidates.length) continue;

      if (e.post_url) continue;
      let first: any = null;
      for (const c of candidates) {
        try {
          const posts = c.platform === "tiktok"
            ? await fetchTikTokUserPosts(c.handle)
            : await fetchInstagramUserPosts(c.handle);
          fetched += posts.length;
          const matching = posts.filter((p: any) => captionHas(p.caption, tags));
          for (const p of matching) {
            const candidate = { ...p, platform: c.platform, handle: c.handle };
            if (!first || postTime(candidate) < postTime(first)) first = candidate;
          }
        } catch (err) {
          errors.push({ entry: e.id, handle: c.handle, platform: c.platform, msg: err instanceof Error ? err.message : String(err) });
        }
      }

      if (!first) continue;
      const { error } = await sb.from("contest_entries").update({
        platform: first.platform,
        post_url: first.post_url,
        thumbnail_url: first.thumbnail_url,
        caption: (first.caption || "").slice(0, 1000),
        posted_at: first.posted_at,
        views: first.views, likes: first.likes, comments: first.comments, shares: first.shares,
        score: scoreOf(first),
        status: e.source === "registration" || e.source === "manual" ? "approved" : undefined,
        source: "ensembledata",
        last_polled_at: new Date().toISOString(),
      }).eq("id", e.id);
      if (error) errors.push({ entry: e.id, msg: error.message });
      else upserted++;
    }

    if (runId) await sb.from("contestant_sync_runs").update({
      finished_at: new Date().toISOString(), fetched, upserted, errors, status: errors.length ? "partial" : "ok",
    }).eq("id", runId);

    try { await sb.functions.invoke("contest-poll", { body: { contest_id } }); } catch (_) {}

    return new Response(JSON.stringify({ fetched, upserted, errors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) await sb.from("contestant_sync_runs").update({ finished_at: new Date().toISOString(), status: "error", errors: [{ msg }] }).eq("id", runId);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
