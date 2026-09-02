import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { apifyProfileStats } from "../_shared/apify-profile.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ED_TOKENS = [
  Deno.env.get("ENSEMBLEDATA_API_TOKEN"),
  Deno.env.get("ENSEMBLE_DATA_API_TOKEN"),
].filter((t): t is string => !!t && t.length > 0);

const cleanHandle = (s?: string | null) =>
  (s || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook|fb|twitter|x|youtube|youtu)\.(com|be)\//i, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();

const isLikelyHandle = (h: string) => /^[a-z0-9._-]{2,60}$/i.test(h);

async function edFetch(buildUrl: (token: string) => string): Promise<{ ok: boolean; json: any } | null> {
  if (ED_TOKENS.length === 0) return null;
  let last: { ok: boolean; json: any } | null = null;
  for (const tok of ED_TOKENS) {
    try {
      const res = await fetch(buildUrl(tok));
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, json };
      last = { ok: false, json };
      if (![402, 403, 429, 495].includes(res.status)) break;
    } catch { /* try next */ }
  }
  return last;
}

type Stats = { followers: number; engagement_rate: number; username?: string };

async function fetchTT(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle);
  if (!isLikelyHandle(h)) return null;
  const info = await edFetch((tok) => `https://ensembledata.com/apis/tt/user/info?username=${encodeURIComponent(h)}&token=${tok}`);
  if (!info?.ok) return null;
  const u = info.json?.data?.user || info.json?.user || info.json?.data || {};
  const stats = info.json?.data?.stats || u?.stats || {};
  const followers = Number(u.follower_count ?? stats.followerCount ?? stats.follower_count ?? 0);
  if (!followers) return null;
  let er = 0;
  const posts = await edFetch((tok) => `https://ensembledata.com/apis/tt/user/posts?username=${encodeURIComponent(h)}&depth=1&token=${tok}`);
  const arr: any[] = posts?.json?.data?.data || posts?.json?.data || [];
  const items = Array.isArray(arr) ? arr.slice(0, 12) : [];
  if (items.length && followers > 0) {
    const total = items.reduce((s, it) => {
      const a = it.aweme_detail || it;
      const st = a.statistics || {};
      return s + Number(st.digg_count ?? 0) + Number(st.comment_count ?? 0) + Number(st.share_count ?? 0);
    }, 0);
    er = ((total / items.length) / followers) * 100;
  }
  return { followers, engagement_rate: Number(er.toFixed(2)), username: h };
}

async function fetchIG(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle);
  if (!isLikelyHandle(h)) return null;
  const info = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/info?username=${encodeURIComponent(h)}&token=${tok}`);
  if (!info?.ok) return null;
  const u = info.json?.data?.user || info.json?.data || info.json?.user || info.json || {};
  const followers = Number(u.follower_count ?? u.edge_followed_by?.count ?? 0);
  const userId = String(u.id ?? u.pk ?? "");
  if (!followers) return null;
  let er = 0;
  if (userId) {
    const posts = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/posts?user_id=${encodeURIComponent(userId)}&depth=1&chunk_size=20&token=${tok}`);
    const arr: any[] = posts?.json?.data?.data || posts?.json?.data || [];
    const items = Array.isArray(arr) ? arr.slice(0, 12) : [];
    if (items.length && followers > 0) {
      const total = items.reduce((s, it) => s + Number(it.like_count ?? 0) + Number(it.comment_count ?? 0), 0);
      er = ((total / items.length) / followers) * 100;
    }
  }
  return { followers, engagement_rate: Number(er.toFixed(2)), username: h };
}

async function fetchYT(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle).replace(/^@/, "");
  if (!isLikelyHandle(h)) return null;
  const r = await edFetch((tok) => `https://ensembledata.com/apis/youtube/channel/detailed-info?channel_name=${encodeURIComponent(h)}&token=${tok}`);
  if (!r?.ok) return null;
  const d = r.json?.data || r.json || {};
  const followers = Number(d.subscriber_count ?? d.subscriberCount ?? d.followers ?? 0);
  if (!followers) return null;
  return { followers, engagement_rate: 0, username: h };
}

async function fetchFB(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle);
  if (!isLikelyHandle(h)) return null;
  const r = await edFetch((tok) => `https://ensembledata.com/apis/fb/page/info?username=${encodeURIComponent(h)}&token=${tok}`);
  if (!r?.ok) return null;
  const d = r.json?.data || r.json || {};
  const followers = Number(d.followers ?? d.follower_count ?? d.fan_count ?? 0);
  if (!followers) return null;
  return { followers, engagement_rate: 0, username: h };
}

async function fetchTW(handle: string): Promise<Stats | null> {
  const h = cleanHandle(handle);
  if (!isLikelyHandle(h)) return null;
  const r = await edFetch((tok) => `https://ensembledata.com/apis/twitter/user/info?username=${encodeURIComponent(h)}&token=${tok}`);
  if (!r?.ok) return null;
  const d = r.json?.data || r.json || {};
  const followers = Number(d.followers_count ?? d.public_metrics?.followers_count ?? d.follower_count ?? 0);
  if (!followers) return null;
  return { followers, engagement_rate: 0, username: h };
}

async function fetchAny(platform: string, handle: string): Promise<Stats | null> {
  const p = (platform || "").toLowerCase();
  // Apify is the primary source; Ensemble below is the fallback.
  const h = cleanHandle(handle);
  if (isLikelyHandle(h)) {
    const a = await apifyProfileStats(p, h);
    if (a?.followers) return { followers: a.followers, engagement_rate: a.engagement_rate, username: a.username ?? h };
  }
  if (p === "tiktok") return fetchTT(handle);
  if (p === "instagram") return fetchIG(handle);
  if (p === "youtube") return fetchYT(handle);
  if (p === "facebook") return fetchFB(handle);
  if (p === "twitter" || p === "x") return fetchTW(handle);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const itemIds: string[] | null = body.item_ids ?? (body.item_id ? [body.item_id] : null);
  const agencyId: string | null = body.agency_id ?? null;

  let q = (supabase.from("inventory_items") as any).select("id, platform, handle, follower_count, engagement_rate");
  if (itemIds) q = q.in("id", itemIds);
  else if (agencyId) q = q.eq("agency_id", agencyId);
  else return new Response(JSON.stringify({ ok: false, error: "item_ids or agency_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: rows } = await q;
  const targets = (rows ?? []).filter((r: any) => r.handle && r.platform);

  const results: any[] = [];
  await Promise.all(targets.map(async (r: any) => {
    const s = await fetchAny(r.platform, r.handle);
    if (!s) { results.push({ id: r.id, skipped: "no_data" }); return; }
    const update: any = { follower_count: s.followers };
    if (s.engagement_rate > 0) update.engagement_rate = s.engagement_rate;
    const { error } = await (supabase.from("inventory_items") as any).update(update).eq("id", r.id);
    results.push({ id: r.id, ...update, error: error?.message });
  }));

  return new Response(
    JSON.stringify({ ok: true, checked: targets.length, updated: results.filter(r => !r.skipped).length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
