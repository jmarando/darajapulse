import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const TIKTOK_API_KEY = Deno.env.get("TIKTOK_API_KEY");

type Stats = {
  platform: string;
  username?: string;
  followers: number;
  engagement_rate: number; // percent
  posts_sampled: number;
};

async function fetchIG(igUserId: string, token: string): Promise<Stats | null> {
  const infoRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}?fields=username,followers_count&access_token=${token}`,
  );
  const info = await infoRes.json();
  if (!infoRes.ok || info.error) {
    console.error("ig info error", info.error);
    return null;
  }
  const followers = Number(info.followers_count ?? 0);

  const mediaRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media?fields=like_count,comments_count&limit=12&access_token=${token}`,
  );
  const media = await mediaRes.json();
  const posts: any[] = media.data ?? [];
  const totalInteractions = posts.reduce(
    (s, p) => s + Number(p.like_count ?? 0) + Number(p.comments_count ?? 0),
    0,
  );
  const avg = posts.length ? totalInteractions / posts.length : 0;
  const er = followers > 0 ? (avg / followers) * 100 : 0;
  return {
    platform: "instagram",
    username: info.username,
    followers,
    engagement_rate: Number(er.toFixed(2)),
    posts_sampled: posts.length,
  };
}

async function fetchFB(pageId: string, token: string): Promise<Stats | null> {
  const infoRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=username,followers_count,fan_count&access_token=${token}`,
  );
  const info = await infoRes.json();
  if (!infoRes.ok || info.error) {
    console.error("fb info error", info.error);
    return null;
  }
  const followers = Number(info.followers_count ?? info.fan_count ?? 0);

  // Posts engagement (likes + comments + shares) over last 12
  const postsRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/posts?fields=likes.summary(true),comments.summary(true),shares&limit=12&access_token=${token}`,
  );
  const postsJson = await postsRes.json();
  const posts: any[] = postsJson.data ?? [];
  const totalInteractions = posts.reduce((s, p) => {
    const likes = p.likes?.summary?.total_count ?? 0;
    const comments = p.comments?.summary?.total_count ?? 0;
    const shares = p.shares?.count ?? 0;
    return s + likes + comments + shares;
  }, 0);
  const avg = posts.length ? totalInteractions / posts.length : 0;
  const er = followers > 0 ? (avg / followers) * 100 : 0;
  return {
    platform: "facebook",
    username: info.username,
    followers,
    engagement_rate: Number(er.toFixed(2)),
    posts_sampled: posts.length,
  };
}

async function fetchTikTok(accessToken: string): Promise<Stats | null> {
  if (!LOVABLE_API_KEY || !TIKTOK_API_KEY) {
    // Per-user OAuth path: call TikTok directly with stored access token
    const profRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const prof = await profRes.json();
    const user = prof?.data?.user;
    if (!user) {
      console.error("tt profile error", prof);
      return null;
    }
    const followers = Number(user.follower_count ?? 0);
    const totalLikes = Number(user.likes_count ?? 0);
    const videos = Number(user.video_count ?? 0);
    const avgLikesPerVideo = videos > 0 ? totalLikes / videos : 0;
    const er = followers > 0 ? (avgLikesPerVideo / followers) * 100 : 0;
    return {
      platform: "tiktok",
      username: user.display_name,
      followers,
      engagement_rate: Number(er.toFixed(2)),
      posts_sampled: videos,
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const influencerIds: string[] | null = body.influencer_ids ?? (body.influencer_id ? [body.influencer_id] : null);

  // Pull connected accounts
  const [igRes, fbRes, ttRes] = await Promise.all([
    supabase.from("instagram_accounts").select("influencer_id, ig_user_id, page_access_token"),
    supabase.from("facebook_accounts").select("influencer_id, page_id, page_access_token"),
    supabase.from("tiktok_accounts").select("influencer_id, access_token, expires_at"),
  ]);

  const filter = (rows: any[] | null) =>
    (rows ?? []).filter((r) => !influencerIds || influencerIds.includes(r.influencer_id));

  const igRows = filter(igRes.data);
  const fbRows = filter(fbRes.data);
  const ttRows = filter(ttRes.data);

  const perInfluencer: Record<string, Stats[]> = {};
  const push = (id: string, s: Stats | null) => {
    if (!s) return;
    perInfluencer[id] ??= [];
    perInfluencer[id].push(s);
  };

  await Promise.all([
    ...igRows.map(async (r) => push(r.influencer_id, await fetchIG(r.ig_user_id, r.page_access_token))),
    ...fbRows.map(async (r) => push(r.influencer_id, await fetchFB(r.page_id, r.page_access_token))),
    ...ttRows.map(async (r) => push(r.influencer_id, await fetchTikTok(r.access_token))),
  ]);

  // Apply: pick max followers across platforms, weighted-avg engagement
  const results: any[] = [];
  for (const [influencer_id, stats] of Object.entries(perInfluencer)) {
    const maxFollowers = Math.max(...stats.map((s) => s.followers), 0);
    const totalFollowers = stats.reduce((s, x) => s + x.followers, 0);
    const weightedER = totalFollowers > 0
      ? stats.reduce((s, x) => s + x.engagement_rate * x.followers, 0) / totalFollowers
      : 0;

    const { error } = await supabase
      .from("influencers")
      .update({
        follower_count: maxFollowers,
        engagement_rate: Number(weightedER.toFixed(2)),
      })
      .eq("id", influencer_id);

    results.push({
      influencer_id,
      follower_count: maxFollowers,
      engagement_rate: Number(weightedER.toFixed(2)),
      breakdown: stats,
      error: error?.message,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, updated: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
