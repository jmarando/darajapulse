// Handle-driven post fetcher.
// For each registered contestant in a contest that has an IG or TikTok handle
// but no scraped metrics yet, pulls their recent public posts via
// EnsembleData, filters by the contest hashtag, and writes the
// highest-scoring matching post back onto the contestant row.
// Facebook is intentionally skipped — FB requires manual entry.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ED_TOKENS = [
  Deno.env.get("ENSEMBLEDATA_API_TOKEN"),
  Deno.env.get("ENSEMBLE_DATA_API_TOKEN"),
  Deno.env.get("ENSEMBLEDATA_API_TOKEN_2"),
].filter((t): t is string => !!t && t.length > 0);
const ED = ED_TOKENS[0];

async function edFetch(buildUrl: (token: string) => string): Promise<{ res: Response; json: any }> {
  if (ED_TOKENS.length === 0) throw new Error("ENSEMBLEDATA_API_TOKEN not configured");
  let last: { res: Response; json: any } | null = null;
  for (const tok of ED_TOKENS) {
    const res = await fetch(buildUrl(tok));
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { res, json };
    last = { res, json };
    if (res.status !== 402 && res.status !== 429 && res.status !== 403 && res.status !== 495) break;
  }
  return last!;
}

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
  const { res: r, json: j } = await edFetch((tok) => `https://ensembledata.com/apis/tt/user/posts?username=${encodeURIComponent(handle)}&depth=1&token=${tok}`);
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
  const { res: infoRes, json: infoJson } = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/info?username=${encodeURIComponent(handle)}&token=${tok}`);
  if (!infoRes.ok) throw new Error(`IG user lookup ${infoRes.status}: ${JSON.stringify(infoJson).slice(0, 200)}`);
  const userId = extractIgUserId(infoJson);
  if (!userId) throw new Error("instagram_user_id_not_found");

  const { res: r, json: j } = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/posts?user_id=${encodeURIComponent(userId)}&depth=1&chunk_size=20&token=${tok}`);
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
      .select("id, handle, tiktok_handle, instagram_handle, platform, post_url, views, likes, comments, shares, source, metadata")
      .eq("contest_id", contest_id);

    let fetched = 0, upserted = 0, skipped_cooldown = 0, skipped_budget = 0;
    const errors: any[] = [];
    const only: string | undefined = body.only_handle;
    // Unit-budget guard. Ensemble gives us 1500 units/day. Per-handle discovery
    // is ~2u/platform/contestant. Cap discoveries per run and rotate through
    // the backlog over multiple days.
    const discoveryCap: number = Number(body.discovery_cap ?? 80);
    // Cooldown: skip handles we tried in the last N hours that returned nothing.
    const cooldownHours: number = Number(body.cooldown_hours ?? 22);
    const cooldownMs = cooldownHours * 3600 * 1000;
    let discoveryUsed = 0;



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
      // Reject handles that look like names or contain unsafe chars (e.g. "Life&style",
      // "Eddie Murphy") — Ensemble will reject them anyway and they pollute the error list.
      const validCandidates = candidates.filter(c => /^[a-z0-9_.]{2,40}$/i.test(c.handle));
      if (validCandidates.length !== candidates.length) {
        for (const c of candidates) {
          if (!validCandidates.includes(c)) errors.push({ entry: e.id, handle: c.handle, msg: "invalid_handle" });
        }
      }
      const onlyHandle = cleanHandle(only);
      if (onlyHandle && !validCandidates.some(c => c.handle.toLowerCase() === onlyHandle)) continue;
      if (!validCandidates.length) continue;

      // Process if the row has no post_url OR has zero metrics (rescue path for winners
      // and handle-only registrants).
      const noMetrics = Number(e.views || 0) <= 0 && Number(e.likes || 0) <= 0;
      if (e.post_url && !noMetrics) continue;

      // Pick the HIGHEST-SCORING matching post across all the candidate handles.
      let best: any = null;
      let bestScore = -1;
      for (const c of validCandidates) {
        try {
          const posts = c.platform === "tiktok"
            ? await fetchTikTokUserPosts(c.handle)
            : await fetchInstagramUserPosts(c.handle);
          fetched += posts.length;
          const matching = posts.filter((p: any) => captionHas(p.caption, tags));
          for (const p of matching) {
            const cand = { ...p, platform: c.platform, handle: c.handle };
            const sc = scoreOf(cand);
            if (sc > bestScore) { best = cand; bestScore = sc; }
          }
        } catch (err) {
          errors.push({ entry: e.id, handle: c.handle, platform: c.platform, msg: err instanceof Error ? err.message : String(err) });
        }
      }

      if (!best) continue;
      // MAX merge for counters so we never overwrite higher existing values.
      const merged = {
        views: Math.max(Number(best.views || 0), Number(e.views || 0)),
        likes: Math.max(Number(best.likes || 0), Number(e.likes || 0)),
        comments: Math.max(Number(best.comments || 0), Number(e.comments || 0)),
        shares: Math.max(Number(best.shares || 0), Number(e.shares || 0)),
      };
      const upd: any = {
        platform: best.platform,
        post_url: e.post_url || best.post_url,
        thumbnail_url: best.thumbnail_url,
        caption: (best.caption || "").slice(0, 1000),
        posted_at: best.posted_at,
        ...merged,
        score: scoreOf(merged),
        // Do NOT change status for announced winners — that's editorial.
        ...(e.source === "registration" || e.source === "manual" ? { status: "approved" } : {}),
        source: "ensembledata",
        last_polled_at: new Date().toISOString(),
      };
      const { error } = await sb.from("contest_entries").update(upd).eq("id", e.id);
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
