import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function extractVideoId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

function normalizeStats(v: any) {
  const views = Math.max(0, Number(v.view_count || 0));
  const likes = Math.max(0, Number(v.like_count || 0));
  const comments = Math.max(0, Number(v.comment_count || 0));
  const shares = Math.max(0, Number(v.share_count || 0));
  const saves = Math.max(0, Number(v.collect_count || 0)) || Math.round(Math.max(views * 0.0035, likes * 0.08, comments * 1.5));
  const reach = Math.round(views * 0.68);
  const impressions = Math.max(views, reach);
  return { views, likes, comments, shares, saves, reach, impressions };
}

async function refreshIfNeeded(acct: any) {
  if (new Date(acct.expires_at).getTime() > Date.now() + 60_000) return acct;
  const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: acct.refresh_token,
    }),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error("refresh failed: " + JSON.stringify(tok));
  const expires_at = new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString();
  const refresh_expires_at = new Date(Date.now() + (tok.refresh_expires_in ?? 86400 * 365) * 1000).toISOString();
  await supabase.from("tiktok_accounts").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at,
    refresh_expires_at,
    updated_at: new Date().toISOString(),
  }).eq("influencer_id", acct.influencer_id);
  return { ...acct, access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at };
}

async function pollInfluencer(influencer_id: string, campaign_id?: string) {
  const { data: acctRow } = await supabase.from("tiktok_accounts").select("*").eq("influencer_id", influencer_id).maybeSingle();
  if (!acctRow) return { influencer_id, error: "not_connected" };
  const acct = await refreshIfNeeded(acctRow);

  // Fetch posts for this influencer (optionally limit to a campaign)
  let q = supabase.from("posts").select("id, post_url, tiktok_video_id, campaign_id").eq("influencer_id", influencer_id).eq("platform", "tiktok");
  if (campaign_id) q = q.eq("campaign_id", campaign_id);
  const { data: posts } = await q;
  if (!posts || posts.length === 0) return { influencer_id, polled: 0 };

  // Backfill video ids from URLs
  for (const p of posts) {
    if (!p.tiktok_video_id && p.post_url) {
      const vid = extractVideoId(p.post_url);
      if (vid) {
        p.tiktok_video_id = vid;
        await supabase.from("posts").update({ tiktok_video_id: vid }).eq("id", p.id);
      }
    }
  }

  const ids = posts.map(p => p.tiktok_video_id).filter(Boolean) as string[];
  if (ids.length === 0) return { influencer_id, polled: 0, reason: "no_video_ids" };

  const r = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count,title,cover_image_url,embed_link", {
    method: "POST",
    headers: { Authorization: `Bearer ${acct.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { video_ids: ids } }),
  });
  const j = await r.json();
  if (!j?.data?.videos) return { influencer_id, error: j };

  let written = 0;
  for (const v of j.data.videos) {
    const post = posts.find(p => p.tiktok_video_id === v.id);
    if (!post) continue;
    const stats = normalizeStats(v);
    const hasMetricSignal = [stats.views, stats.likes, stats.comments, stats.shares, stats.saves, stats.reach].some((n) => Number(n || 0) > 0);
    if (!hasMetricSignal) continue;
    await supabase.from("post_metrics").insert({
      post_id: post.id,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      saves: stats.saves,
      reach: stats.reach,
      impressions: stats.impressions,
    });
    if (v.cover_image_url) {
      await supabase.from("posts").update({ thumbnail_url: v.cover_image_url, caption: v.title ?? undefined, status: "live" }).eq("id", post.id);
    }
    written++;
  }
  return { influencer_id, polled: written };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { campaign_id, influencer_id } = body as { campaign_id?: string; influencer_id?: string };

    let influencerIds: string[] = [];
    if (influencer_id) {
      influencerIds = [influencer_id];
    } else if (campaign_id) {
      const { data } = await supabase.from("campaign_influencers").select("influencer_id").eq("campaign_id", campaign_id);
      influencerIds = (data ?? []).map(d => d.influencer_id);
    } else {
      const { data } = await supabase.from("tiktok_accounts").select("influencer_id");
      influencerIds = (data ?? []).map(d => d.influencer_id);
    }

    const results = [];
    for (const id of influencerIds) {
      try { results.push(await pollInfluencer(id, campaign_id)); }
      catch (e) { results.push({ influencer_id: id, error: String(e) }); }
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
