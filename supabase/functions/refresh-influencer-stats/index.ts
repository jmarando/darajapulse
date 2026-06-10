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

type Stats = {
  platform: string;
  username?: string;
  followers: number;
  engagement_rate: number; // percent
  posts_sampled: number;
};

const cleanHandle = (s?: string | null) =>
  (s || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook|twitter|x|youtube)\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();

const isLikelyHandle = (h: string) => /^[a-z0-9._-]{2,40}$/i.test(h);

async function edFetch(buildUrl: (token: string) => string): Promise<{ res: Response; json: any } | null> {
  if (ED_TOKENS.length === 0) return null;
  let last: { res: Response; json: any } | null = null;
  for (const tok of ED_TOKENS) {
    const res = await fetch(buildUrl(tok));
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { res, json };
    last = { res, json };
    if (![402, 403, 429, 495].includes(res.status)) break;
  }
  return last;
}

// ---------- OAuth-backed fetchers ----------
async function fetchIG_OAuth(igUserId: string, token: string): Promise<Stats | null> {
  const infoRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}?fields=username,followers_count&access_token=${token}`,
  );
  const info = await infoRes.json();
  if (!infoRes.ok || info.error) return null;
  const followers = Number(info.followers_count ?? 0);
  const mediaRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media?fields=like_count,comments_count&limit=12&access_token=${token}`,
  );
  const media = await mediaRes.json();
  const posts: any[] = media.data ?? [];
  const total = posts.reduce((s, p) => s + Number(p.like_count ?? 0) + Number(p.comments_count ?? 0), 0);
  const avg = posts.length ? total / posts.length : 0;
  const er = followers > 0 ? (avg / followers) * 100 : 0;
  return { platform: "instagram", username: info.username, followers, engagement_rate: Number(er.toFixed(2)), posts_sampled: posts.length };
}

async function fetchFB_OAuth(pageId: string, token: string): Promise<Stats | null> {
  const infoRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=username,followers_count,fan_count&access_token=${token}`,
  );
  const info = await infoRes.json();
  if (!infoRes.ok || info.error) return null;
  const followers = Number(info.followers_count ?? info.fan_count ?? 0);
  const postsRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/posts?fields=likes.summary(true),comments.summary(true),shares&limit=12&access_token=${token}`,
  );
  const postsJson = await postsRes.json();
  const posts: any[] = postsJson.data ?? [];
  const total = posts.reduce((s, p) => s + (p.likes?.summary?.total_count ?? 0) + (p.comments?.summary?.total_count ?? 0) + (p.shares?.count ?? 0), 0);
  const avg = posts.length ? total / posts.length : 0;
  const er = followers > 0 ? (avg / followers) * 100 : 0;
  return { platform: "facebook", username: info.username, followers, engagement_rate: Number(er.toFixed(2)), posts_sampled: posts.length };
}

async function fetchTikTok_OAuth(accessToken: string): Promise<Stats | null> {
  const profRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const prof = await profRes.json();
  const user = prof?.data?.user;
  if (!user) return null;
  const followers = Number(user.follower_count ?? 0);
  const totalLikes = Number(user.likes_count ?? 0);
  const videos = Number(user.video_count ?? 0);
  const avgLikes = videos > 0 ? totalLikes / videos : 0;
  const er = followers > 0 ? (avgLikes / followers) * 100 : 0;
  return { platform: "tiktok", username: user.display_name, followers, engagement_rate: Number(er.toFixed(2)), posts_sampled: videos };
}

// ---------- Public-handle fetchers (EnsembleData) ----------
async function fetchTikTok_Public(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle);
  if (!isLikelyHandle(h)) return null;
  const info = await edFetch((tok) => `https://ensembledata.com/apis/tt/user/info?username=${encodeURIComponent(h)}&token=${tok}`);
  if (!info?.res.ok) return null;
  const u = info.json?.data?.user || info.json?.user || info.json?.data || {};
  const stats = info.json?.data?.stats || u?.stats || {};
  const followers = Number(u.follower_count ?? stats.followerCount ?? stats.follower_count ?? 0);
  if (!followers) return null;

  // Engagement from last ~12 posts
  let er = 0, sampled = 0;
  const posts = await edFetch((tok) => `https://ensembledata.com/apis/tt/user/posts?username=${encodeURIComponent(h)}&depth=1&token=${tok}`);
  const arr: any[] = posts?.json?.data?.data || posts?.json?.data || [];
  const items = Array.isArray(arr) ? arr.slice(0, 12) : [];
  if (items.length && followers > 0) {
    const total = items.reduce((s, it) => {
      const a = it.aweme_detail || it;
      const st = a.statistics || {};
      return s + Number(st.digg_count ?? 0) + Number(st.comment_count ?? 0) + Number(st.share_count ?? 0);
    }, 0);
    const avg = total / items.length;
    er = (avg / followers) * 100;
    sampled = items.length;
  }
  return { platform: "tiktok", username: h, followers, engagement_rate: Number(er.toFixed(2)), posts_sampled: sampled };
}

async function fetchIG_Public(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle);
  if (!isLikelyHandle(h)) return null;
  const info = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/info?username=${encodeURIComponent(h)}&token=${tok}`);
  if (!info?.res.ok) return null;
  const u = info.json?.data?.user || info.json?.data || info.json?.user || info.json || {};
  const followers = Number(u.follower_count ?? u.edge_followed_by?.count ?? 0);
  const userId = String(u.id ?? u.pk ?? "");
  if (!followers || !userId) return null;

  let er = 0, sampled = 0;
  const posts = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/posts?user_id=${encodeURIComponent(userId)}&depth=1&chunk_size=20&token=${tok}`);
  const arr: any[] = posts?.json?.data?.data || posts?.json?.data || [];
  const items = Array.isArray(arr) ? arr.slice(0, 12) : [];
  if (items.length && followers > 0) {
    const total = items.reduce((s, it) => s + Number(it.like_count ?? 0) + Number(it.comment_count ?? 0), 0);
    const avg = total / items.length;
    er = (avg / followers) * 100;
    sampled = items.length;
  }
  return { platform: "instagram", username: h, followers, engagement_rate: Number(er.toFixed(2)), posts_sampled: sampled };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const influencerIds: string[] | null = body.influencer_ids ?? (body.influencer_id ? [body.influencer_id] : null);
  // For cron, allow capping the batch to avoid burning credits.
  const limit: number = Number(body.limit ?? 100);
  // Skip rows refreshed within the last N hours unless force=true.
  const staleHours: number = Number(body.stale_hours ?? 20);
  const force: boolean = !!body.force;

  // Load target influencers
  let q = (supabase.from("influencers") as any).select("id, handle, primary_platform, last_metrics_sync");
  if (influencerIds) q = q.in("id", influencerIds);
  const { data: infRows } = await q;
  const targets = (infRows ?? []).filter((r: any) => {
    if (force || influencerIds) return true;
    if (!r.last_metrics_sync) return true;
    const age = Date.now() - new Date(r.last_metrics_sync).getTime();
    return age > staleHours * 3600 * 1000;
  }).slice(0, limit);

  // Pull connected accounts only for the chosen targets
  const ids = targets.map((r: any) => r.id);
  const [igRes, fbRes, ttRes] = ids.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from("instagram_accounts").select("influencer_id, ig_user_id, page_access_token").in("influencer_id", ids),
        supabase.from("facebook_accounts").select("influencer_id, page_id, page_access_token").in("influencer_id", ids),
        supabase.from("tiktok_accounts").select("influencer_id, access_token").in("influencer_id", ids),
      ]);

  const byId = <T extends { influencer_id: string }>(rows: T[] | null) => {
    const m: Record<string, T> = {};
    (rows ?? []).forEach((r) => { m[r.influencer_id] = r; });
    return m;
  };
  const igMap = byId(igRes.data as any);
  const fbMap = byId(fbRes.data as any);
  const ttMap = byId(ttRes.data as any);

  const perInfluencer: Record<string, Stats[]> = {};
  const sourcePerInfluencer: Record<string, string[]> = {};
  const push = (id: string, s: Stats | null, source: string) => {
    if (!s) return;
    (perInfluencer[id] ??= []).push(s);
    (sourcePerInfluencer[id] ??= []).push(source);
  };

  await Promise.all(targets.map(async (r: any) => {
    const id = r.id as string;
    const platform = (r.primary_platform || "").toLowerCase();

    // Prefer OAuth where available
    const ig = igMap[id]; const fb = fbMap[id]; const tt = ttMap[id];
    if (ig) push(id, await fetchIG_OAuth(ig.ig_user_id, ig.page_access_token), "oauth_ig");
    if (fb) push(id, await fetchFB_OAuth(fb.page_id, fb.page_access_token), "oauth_fb");
    if (tt) push(id, await fetchTikTok_OAuth(tt.access_token), "oauth_tt");

    // Public-handle fallback for primary platform if nothing yet
    if (!perInfluencer[id]) {
      const handle = r.handle as string | null;
      if (handle) {
        if (platform === "tiktok") push(id, await fetchTikTok_Public(handle), "public_tt");
        else if (platform === "instagram") push(id, await fetchIG_Public(handle), "public_ig");
      }
    }
  }));

  const results: any[] = [];
  for (const r of targets) {
    const id = r.id as string;
    const stats = perInfluencer[id];
    if (!stats || stats.length === 0) {
      results.push({ influencer_id: id, skipped: "no_source" });
      continue;
    }
    const maxFollowers = Math.max(...stats.map((s) => s.followers), 0);
    const totalFollowers = stats.reduce((s, x) => s + x.followers, 0);
    const weightedER = totalFollowers > 0
      ? stats.reduce((s, x) => s + x.engagement_rate * x.followers, 0) / totalFollowers
      : 0;

    const { error } = await (supabase.from("influencers") as any)
      .update({
        follower_count: maxFollowers,
        engagement_rate: Number(weightedER.toFixed(2)),
        last_metrics_sync: new Date().toISOString(),
      })
      .eq("id", id);

    results.push({
      influencer_id: id,
      follower_count: maxFollowers,
      engagement_rate: Number(weightedER.toFixed(2)),
      sources: sourcePerInfluencer[id],
      breakdown: stats,
      error: error?.message,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, checked: targets.length, updated: results.filter((r) => !r.skipped).length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
