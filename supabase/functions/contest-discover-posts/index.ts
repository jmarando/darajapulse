// Discover contest posts by hashtag.
//   Instagram → Meta Graph API Hashtag Search (free, uses a connected IG Business account).
//   TikTok    → EnsembleData hashtag search.
// Falls back gracefully if either provider is not configured / returns no data.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const ED_TOKENS = [
  Deno.env.get("ENSEMBLEDATA_API_TOKEN"),
  Deno.env.get("ENSEMBLE_DATA_API_TOKEN"),
  Deno.env.get("ENSEMBLEDATA_API_TOKEN_2"),
].filter((t): t is string => !!t && t.length > 0);
const ENSEMBLEDATA_TOKEN = ED_TOKENS[0];
const META_GRAPH_VERSION = "v21.0";

const score = (e: { shares?: any; comments?: any; likes?: any; views?: any }) =>
  Number(e.shares || 0) * 3 + Number(e.comments || 0) * 2 + Number(e.likes || 0) + Number(e.views || 0);

function captionHas(text: string | undefined, tags: string[]): boolean {
  if (!text) return false;
  const lc = text.toLowerCase();
  return tags.some((t) => lc.includes(t.toLowerCase()));
}

function stripHash(t: string) {
  return t.replace(/^#/, "");
}

function canonicalPostUrl(raw?: string | null): string {
  if (!raw) return "";
  const url = raw.trim();
  const tt = url.match(/tiktok\.com\/.*?(?:\/video\/|\/v\/|share_item_id=)(\d{6,})/i);
  if (tt) return `https://www.tiktok.com/video/${tt[1]}`;
  const ig = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/`;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

// ---------- Instagram via Meta Graph Hashtag Search ----------
async function discoverInstagram(sb: any, tags: string[]) {
  // Pick any connected IG Business account to act as the "querier"
  const { data: igAcct } = await sb
    .from("instagram_accounts")
    .select("ig_user_id, page_access_token, user_access_token, username")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!igAcct) {
    return { upserted: 0, fetched: 0, error: "no_ig_account_connected" };
  }
  const token = igAcct.page_access_token || igAcct.user_access_token;
  const userId = igAcct.ig_user_id;
  if (!token || !userId) return { upserted: 0, fetched: 0, error: "ig_account_missing_token" };

  const posts: any[] = [];
  const errors: any[] = [];

  for (const rawTag of tags) {
    const tag = stripHash(rawTag);
    try {
      // 1) Resolve hashtag id
      const idRes = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/ig_hashtag_search?user_id=${userId}&q=${encodeURIComponent(tag)}&access_token=${token}`,
      );
      const idJson = await idRes.json();
      const tagId = idJson?.data?.[0]?.id;
      if (!tagId) {
        errors.push({ tag, msg: idJson?.error?.message || "hashtag_not_found" });
        continue;
      }

      // 2) Pull recent + top media for that hashtag
      const fields = "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,children{media_url,thumbnail_url},thumbnail_url";
      for (const endpoint of ["recent_media", "top_media"]) {
        const r = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${tagId}/${endpoint}?user_id=${userId}&fields=${fields}&access_token=${token}`,
        );
        const j = await r.json();
        if (j?.error) {
          errors.push({ tag, endpoint, msg: j.error.message });
          continue;
        }
        for (const m of j?.data ?? []) posts.push(m);
      }
    } catch (e) {
      errors.push({ tag, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return { fetched: posts.length, upserted: 0, errors, _posts: posts };
}

// ---------- TikTok via EnsembleData ----------
async function discoverTikTokED(tags: string[]) {
  if (!ENSEMBLEDATA_TOKEN) return { fetched: 0, upserted: 0, error: "ensembledata_not_configured", _posts: [] };
  const posts: any[] = [];
  const errors: any[] = [];

  for (const rawTag of tags) {
    const tag = stripHash(rawTag);
    try {
      // EnsembleData TikTok hashtag posts. Try each token on quota errors.
      let r: Response | null = null;
      let j: any = null;
      for (const tok of ED_TOKENS) {
        r = await fetch(`https://ensembledata.com/apis/tt/hashtag/posts?name=${encodeURIComponent(tag)}&cursor=0&token=${tok}`);
        j = await r.json().catch(() => ({}));
        if (r.ok) break;
        if (r.status !== 402 && r.status !== 429 && r.status !== 403 && r.status !== 495) break;
      }
      if (!r || !r.ok) {
        errors.push({ tag, msg: `ED ${r?.status}: ${JSON.stringify(j).slice(0, 200)}` });
        continue;
      }
      const items = j?.data?.data ?? j?.data ?? [];
      for (const it of items) posts.push(it);
    } catch (e) {
      errors.push({ tag, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return { fetched: posts.length, upserted: 0, errors, _posts: posts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let runId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    if (!contest_id) {
      return new Response(JSON.stringify({ error: "contest_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contest } = await sb
      .from("contests")
      .select("*, campaigns(hashtag, hashtags_extra)")
      .eq("id", contest_id)
      .single();
    if (!contest) throw new Error("contest not found");

    const tags: string[] = [contest.hashtag, contest.campaigns?.hashtag, ...(contest.campaigns?.hashtags_extra || [])]
      .filter(Boolean)
      .map((t: string) => (t.startsWith("#") ? t : `#${t}`));
    if (tags.length === 0) throw new Error("contest hashtag missing");

    const { data: run } = await sb
      .from("contestant_sync_runs")
      .insert({ contest_id, source: "hashtag", triggered_by: body.triggered_by ?? "manual", status: "running" })
      .select("id")
      .single();
    runId = run?.id ?? null;

    let upserted = 0;
    let fetched = 0;
    let skipped_creator = 0;
    const errors: any[] = [];

    // Pull all influencer handles from the agency roster — these are paid
    // creators and must NEVER appear as contestants in any contest.
    const cleanH = (s?: string | null) =>
      (s || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase() || "";
    const { data: roster } = await sb.from("influencers").select("handle, alt_handles");
    const rosterHandles = new Set<string>();
    for (const r of (roster ?? []) as any[]) {
      const h = cleanH(r.handle); if (h) rosterHandles.add(h);
      for (const a of (r.alt_handles ?? [])) { const c = cleanH(a); if (c) rosterHandles.add(c); }
    }
    const { data: existingEntries } = await sb
      .from("contest_entries")
      .select("handle, instagram_handle, tiktok_handle, facebook_handle, post_url")
      .eq("contest_id", contest_id);
    const countedHandles = new Set<string>();
    for (const entry of existingEntries ?? []) {
      if (!entry.post_url) continue;
      for (const handle of [entry.handle, entry.instagram_handle, entry.tiktok_handle, entry.facebook_handle]) {
        const h = cleanH(handle);
        if (h) countedHandles.add(h);
      }
    }
    const isCreator = (h?: string | null) => {
      const c = cleanH(h);
      return !!c && rosterHandles.has(c);
    };
    const alreadyCounted = (h?: string | null) => {
      const c = cleanH(h);
      return !!c && countedHandles.has(c);
    };

    // ---- Instagram ----
    const ig = await discoverInstagram(sb, tags);
    fetched += ig.fetched;
    if (ig.error) errors.push({ source: "instagram", msg: ig.error });
    if (ig.errors) errors.push(...ig.errors.map((e: any) => ({ source: "instagram", ...e })));
    for (const p of ig._posts ?? []) {
      const caption = p.caption || "";
      if (!captionHas(caption, tags)) continue;
      const post_url = canonicalPostUrl(p.permalink);
      if (!post_url) continue;
      // Try to extract the author username from the permalink (best effort).
      const igAuthor = (p.username || p.owner?.username || (p.permalink?.match(/instagram\.com\/([A-Za-z0-9._]+)\//i)?.[1])) ?? null;
      if (isCreator(igAuthor)) { skipped_creator++; continue; }
      if (alreadyCounted(igAuthor)) continue;
      const thumb = p.thumbnail_url || p.media_url || p?.children?.data?.[0]?.thumbnail_url || p?.children?.data?.[0]?.media_url || null;
      const stats = { views: 0, likes: Number(p.like_count || 0), comments: Number(p.comments_count || 0), shares: 0 };
      const { error } = await sb.from("contest_entries").upsert(
        {
          contest_id,
          platform: "instagram",
          post_url,
          handle: cleanH(igAuthor) || null,
          caption: caption.slice(0, 1000),
          thumbnail_url: thumb,
          posted_at: p.timestamp || null,
          ...stats,
          score: score(stats),
          status: "approved",
          source: "meta_graph",
          last_polled_at: new Date().toISOString(),
        },
        { onConflict: "contest_id,post_url" },
      );
      if (error) errors.push({ source: "instagram", post_url, msg: error.message });
      else { upserted++; if (igAuthor) countedHandles.add(cleanH(igAuthor)); }
    }

    // ---- TikTok (EnsembleData) ----
    const tt = await discoverTikTokED(tags);
    fetched += tt.fetched;
    if (tt.error) errors.push({ source: "tiktok", msg: tt.error });
    if (tt.errors) errors.push(...tt.errors.map((e: any) => ({ source: "tiktok", ...e })));
    for (const v of tt._posts ?? []) {
      // Normalize across EnsembleData TikTok response shapes
      const aweme = v.aweme_detail || v;
      const caption: string = aweme.desc || v.desc || "";
      if (!captionHas(caption, tags)) continue;
      const author = aweme.author?.unique_id || aweme.author?.uniqueId || v.author?.unique_id || "";
      if (isCreator(author)) { skipped_creator++; continue; }
      if (alreadyCounted(author)) continue;
      const videoId = aweme.aweme_id || aweme.id || v.id;
      const rawUrl = aweme.share_url || (author && videoId ? `https://www.tiktok.com/@${author}/video/${videoId}` : null);
      const post_url = canonicalPostUrl(rawUrl);
      if (!post_url) continue;
      const stats = {
        views: Number(aweme.statistics?.play_count ?? v.play_count ?? 0),
        likes: Number(aweme.statistics?.digg_count ?? v.digg_count ?? 0),
        comments: Number(aweme.statistics?.comment_count ?? v.comment_count ?? 0),
        shares: Number(aweme.statistics?.share_count ?? v.share_count ?? 0),
      };
      const thumb = aweme.video?.cover?.url_list?.[0] || aweme.video?.origin_cover?.url_list?.[0] || aweme.cover || null;
      const postedAt = aweme.create_time
        ? new Date(Number(aweme.create_time) * 1000).toISOString()
        : v.createTimeISO || null;

      const { error } = await sb.from("contest_entries").upsert(
        {
          contest_id,
          platform: "tiktok",
          post_url,
          handle: author ? author.toLowerCase() : null,
          caption: caption.slice(0, 1000),
          thumbnail_url: thumb,
          posted_at: postedAt,
          ...stats,
          score: score(stats),
          status: "approved",
          source: "ensembledata",
          last_polled_at: new Date().toISOString(),
        },
        { onConflict: "contest_id,post_url" },
      );
      if (error) errors.push({ source: "tiktok", post_url, msg: error.message });
      else { upserted++; if (author) countedHandles.add(cleanH(author)); }
    }

    if (runId) {
      await sb
        .from("contestant_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          fetched,
          upserted,
          errors,
          status: errors.length ? "partial" : "ok",
        })
        .eq("id", runId);
    }

    // Recompute scores/rounds
    try {
      await sb.functions.invoke("contest-poll", { body: { contest_id } });
    } catch (_) {}

    return new Response(JSON.stringify({ fetched, upserted, skipped_creator, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId)
      await sb
        .from("contestant_sync_runs")
        .update({ finished_at: new Date().toISOString(), status: "error", errors: [{ msg }] })
        .eq("id", runId);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
