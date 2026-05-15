// For every registered contestant in a contest, scrape their IG + TikTok
// recent posts via Apify and upsert any post whose caption contains the
// contest hashtag as a `contest_entries` row (status='approved', source='apify').
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN")!;

const score = (e: { shares?: any; comments?: any; likes?: any }) =>
  Number(e.shares || 0) * 3 + Number(e.comments || 0) * 2 + Number(e.likes || 0);

async function runApify(actorId: string, input: any): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=true&format=json&timeout=120`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actorId} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

function captionHas(text: string | undefined, tags: string[]): boolean {
  if (!text) return false;
  const lc = text.toLowerCase();
  return tags.some(t => lc.includes(t.toLowerCase()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let runId: string | null = null;

  try {
    if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured");
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    const only_handle: string | undefined = body.only_handle;
    if (!contest_id) {
      return new Response(JSON.stringify({ error: "contest_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: contest } = await sb.from("contests").select("*, campaigns(hashtag, hashtags_extra)").eq("id", contest_id).single();
    if (!contest) throw new Error("contest not found");

    const tags: string[] = [contest.hashtag, contest.campaigns?.hashtag, ...(contest.campaigns?.hashtags_extra || [])]
      .filter(Boolean)
      .map((t: string) => t.startsWith("#") ? t : `#${t}`);
    if (tags.length === 0) throw new Error("contest hashtag missing");

    let q = sb.from("contest_entries").select("id, instagram_handle, tiktok_handle").eq("contest_id", contest_id);
    const { data: contestants } = await q;
    let regs = (contestants || []).filter(c => c.instagram_handle || c.tiktok_handle);
    if (only_handle) {
      const h = only_handle.replace(/^@/, "").toLowerCase();
      regs = regs.filter(c => c.instagram_handle === h || c.tiktok_handle === h);
    }

    const { data: run } = await sb.from("contestant_sync_runs").insert({
      contest_id, source: "apify", triggered_by: body.triggered_by ?? "manual", status: "running",
    }).select("id").single();
    runId = run?.id ?? null;

    let upserted = 0;
    const errors: any[] = [];

    // Build deduped lists
    const igHandles = Array.from(new Set(regs.map(r => r.instagram_handle).filter(Boolean) as string[]));
    const ttHandles = Array.from(new Set(regs.map(r => r.tiktok_handle).filter(Boolean) as string[]));

    // Instagram — apify/instagram-profile-scraper
    if (igHandles.length) {
      try {
        const items = await runApify("apify~instagram-profile-scraper", {
          usernames: igHandles,
          resultsLimit: 30,
        });
        for (const it of items) {
          const handle = (it.ownerUsername || it.username || "").toLowerCase();
          const posts = Array.isArray(it.latestPosts) ? it.latestPosts : (it.url ? [it] : []);
          for (const p of posts) {
            const caption = p.caption || p.text || "";
            if (!captionHas(caption, tags)) continue;
            const post_url = p.url || p.shortcode ? (p.url || `https://www.instagram.com/p/${p.shortcode}/`) : null;
            if (!post_url) continue;
            const stats = {
              views: Number(p.videoViewCount || p.videoPlayCount || p.views || 0),
              likes: Number(p.likesCount || 0),
              comments: Number(p.commentsCount || 0),
              shares: 0,
            };
            const { error } = await sb.from("contest_entries").upsert({
              contest_id,
              platform: "instagram",
              post_url,
              handle,
              caption: caption.slice(0, 1000),
              thumbnail_url: p.displayUrl || p.thumbnailUrl || null,
              posted_at: p.timestamp || p.takenAt || null,
              ...stats,
              score: score(stats),
              status: "approved",
              source: "apify",
              last_polled_at: new Date().toISOString(),
            }, { onConflict: "contest_id,post_url" });
            if (error) errors.push({ handle, url: post_url, msg: error.message });
            else upserted++;
          }
        }
      } catch (e) {
        errors.push({ source: "instagram", msg: e instanceof Error ? e.message : String(e) });
      }
    }

    // TikTok — clockworks/tiktok-scraper
    if (ttHandles.length) {
      try {
        const items = await runApify("clockworks~tiktok-scraper", {
          profiles: ttHandles,
          resultsPerPage: 30,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
        });
        for (const p of items) {
          const caption = p.text || p.desc || "";
          if (!captionHas(caption, tags)) continue;
          const handle = (p.authorMeta?.name || p.authorUsername || "").toLowerCase();
          const post_url = p.webVideoUrl || p.videoUrl;
          if (!post_url) continue;
          const stats = {
            views: Number(p.playCount || 0),
            likes: Number(p.diggCount || p.likes || 0),
            comments: Number(p.commentCount || 0),
            shares: Number(p.shareCount || 0),
          };
          const { error } = await sb.from("contest_entries").upsert({
            contest_id,
            platform: "tiktok",
            post_url,
            handle,
            caption: caption.slice(0, 1000),
            thumbnail_url: p.videoMeta?.coverUrl || p.covers?.[0] || null,
            posted_at: p.createTimeISO || (p.createTime ? new Date(p.createTime * 1000).toISOString() : null),
            ...stats,
            score: score(stats),
            status: "approved",
            source: "apify",
            last_polled_at: new Date().toISOString(),
          }, { onConflict: "contest_id,post_url" });
          if (error) errors.push({ handle, url: post_url, msg: error.message });
          else upserted++;
        }
      } catch (e) {
        errors.push({ source: "tiktok", msg: e instanceof Error ? e.message : String(e) });
      }
    }

    if (runId) {
      await sb.from("contestant_sync_runs").update({
        finished_at: new Date().toISOString(),
        fetched: igHandles.length + ttHandles.length,
        upserted,
        errors,
        status: errors.length ? "partial" : "ok",
      }).eq("id", runId);
    }

    // Recompute scores/rounds
    try { await sb.functions.invoke("contest-poll", { body: { contest_id } }); } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ ig: igHandles.length, tt: ttHandles.length, upserted, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) await sb.from("contestant_sync_runs").update({ finished_at: new Date().toISOString(), status: "error", errors: [{ msg }] }).eq("id", runId);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
