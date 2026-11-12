// The creator roster's follower numbers. A connected account reads its own, free. Everyone else is looked up through
// ScrapeCreators about once a fortnight, within a daily allowance. The rules live in _shared/influencer-stats.ts.
//
// Callers
//   - the nightly job (x-job-key "refresh-influencer-stats"): every agency's roster
//   - agency staff ("Refresh stats" on the roster): their own agency's creators, within the same daily allowance
//   - a super admin or another function, with body { influencer_ids } to name creators
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCaller } from "../_shared/auth.ts";
import {
  GONE_LOCK_PREFIX, GONE_WAIT_SECONDS, LOG_CONTEXT, dailyCredits, goneLockName, nairobiDayStart, pickPublicLookups, runLookups, stopNote,
  type RosterRow, type Spend,
} from "../_shared/influencer-stats.ts";
import { scrapeCreatorsGet } from "../_shared/scrapecreators.ts";

import { GRAPH_VERSION } from "../_shared/meta-graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const LOCK = "refresh-influencer-stats";

type Stats = {
  platform: string;
  username?: string;
  followers: number;
  engagement_rate: number | null; // percent; null when the source can't measure it
  posts_sampled: number;
  measured_at?: string | null;
  posts_error?: string; // why Meta refused a connected page's posts
};

// ---------- OAuth-backed fetchers ----------
async function fetchIG_OAuth(igUserId: string, token: string): Promise<Stats | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const infoRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}?fields=username,followers_count`,
    { headers },
  );
  const info = await infoRes.json();
  if (!infoRes.ok || info.error) return null;
  const followers = Number(info.followers_count ?? 0);
  const mediaRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media?fields=like_count,comments_count&limit=12`,
    { headers },
  );
  const media = await mediaRes.json();
  const posts: any[] = media.data ?? [];
  const total = posts.reduce((s, p) => s + Number(p.like_count ?? 0) + Number(p.comments_count ?? 0), 0);
  const avg = posts.length ? total / posts.length : 0;
  const er = followers > 0 ? (avg / followers) * 100 : 0;
  return { platform: "instagram", username: info.username, followers, engagement_rate: Number(er.toFixed(2)), posts_sampled: posts.length };
}

async function fetchFB_OAuth(pageId: string, token: string): Promise<Stats | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const infoRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=username,followers_count,fan_count`,
    { headers },
  );
  const info = await infoRes.json();
  if (!infoRes.ok || info.error) return null;
  const followers = Number(info.followers_count ?? info.fan_count ?? 0);
  const postsRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/posts?fields=likes.summary(true),comments.summary(true),shares&limit=12`,
    { headers },
  );
  const postsJson = await postsRes.json();
  // A refusal isn't a page with no posts (Meta refuses these counts without pages_read_user_content): keep the followers,
  // leave the stored rate alone, and say why.
  if (!postsRes.ok || postsJson.error) {
    const why = String(postsJson.error?.message ?? `HTTP ${postsRes.status}`);
    console.warn(`refresh-influencer-stats: Facebook page ${pageId} refused its posts: ${why}`);
    return { platform: "facebook", username: info.username, followers, engagement_rate: null, posts_sampled: 0, posts_error: why };
  }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "refresh-influencer-stats" });
  if (caller instanceof Response) return caller;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const influencerIds: string[] | null = body.influencer_ids ?? (body.influencer_id ? [body.influencer_id] : null);
  const agencyId: string | null = body.agency_id ?? null;
  // The most public lookups one run may try. What it may spend is the daily allowance further down.
  const limit: number = Number(body.limit ?? 100);
  // Skip connected creators refreshed within the last N hours unless force=true.
  const staleHours: number = Number(body.stale_hours ?? 20);
  const force: boolean = !!body.force;

  // Load target influencers
  let q = (supabase.from("influencers") as any).select("id, handle, primary_platform, last_metrics_sync, agency_id");
  if (influencerIds) q = q.in("id", influencerIds);
  if (agencyId) q = q.eq("agency_id", agencyId);
  // Staff refresh their own agency's roster: what a press spends, and the numbers it hands back, stay theirs.
  if (caller.kind === "user" && !caller.isSuperAdmin) {
    const { data: own } = await supabase.from("user_roles").select("agency_id").eq("user_id", caller.userId);
    q = q.in("agency_id", (own ?? []).map((r: any) => r.agency_id).filter(Boolean));
  }
  const { data: infRows } = await q;
  const rows: RosterRow[] = infRows ?? [];

  const [igRes, fbRes, ttRes] = await Promise.all([
    supabase.from("instagram_accounts").select("influencer_id, ig_user_id, page_access_token"),
    supabase.from("facebook_accounts").select("influencer_id, page_id, page_access_token"),
    supabase.from("tiktok_accounts").select("influencer_id, access_token"),
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

  const results: any[] = [];
  const save = async (id: string) => {
    const stats = perInfluencer[id];
    if (!stats || stats.length === 0) {
      results.push({ influencer_id: id, skipped: "no_source" });
      return;
    }
    const maxFollowers = Math.max(...stats.map((s) => s.followers), 0);
    // A source that can't measure engagement leaves the stored rate alone.
    const measured = stats.filter((s) => s.engagement_rate !== null);
    const totalFollowers = measured.reduce((s, x) => s + x.followers, 0);
    const weightedER = totalFollowers > 0
      ? measured.reduce((s, x) => s + (x.engagement_rate as number) * x.followers, 0) / totalFollowers
      : 0;

    const { error } = await (supabase.from("influencers") as any)
      .update({
        follower_count: maxFollowers,
        ...(measured.length ? { engagement_rate: Number(weightedER.toFixed(2)) } : {}),
        last_metrics_sync: stats[0].measured_at ?? new Date().toISOString(),
      })
      .eq("id", id);

    results.push({
      influencer_id: id,
      follower_count: maxFollowers,
      engagement_rate: measured.length ? Number(weightedER.toFixed(2)) : null,
      sources: sourcePerInfluencer[id],
      breakdown: stats,
      error: error?.message,
    });
  };

  // A few at a time, so a run stops soon after its credits are used.
  const CONCURRENCY = 5;
  const now = Date.now();
  const deadline = now + 110_000;
  let skippedForTime = 0;

  // Connected accounts first: they're free, so they don't wait for credits.
  const isStale = (r: RosterRow) =>
    force || !!influencerIds || !r.last_metrics_sync || now - new Date(r.last_metrics_sync).getTime() > staleHours * 3600 * 1000;
  const connected = rows.filter((r) => (igMap[r.id] || fbMap[r.id] || ttMap[r.id]) && isStale(r));
  const refreshConnected = async (r: RosterRow) => {
    const id = r.id;
    const ig = igMap[id]; const fb = fbMap[id]; const tt = ttMap[id];
    if (ig) push(id, await fetchIG_OAuth(ig.ig_user_id, ig.page_access_token), "oauth_ig");
    if (fb) push(id, await fetchFB_OAuth(fb.page_id, fb.page_access_token), "oauth_fb");
    if (tt) push(id, await fetchTikTok_OAuth(tt.access_token), "oauth_tt");
  };
  for (let i = 0; i < connected.length; i += CONCURRENCY) {
    if (Date.now() > deadline) { skippedForTime = connected.length - i; break; }
    const batch = connected.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(refreshConnected));
    await Promise.all(batch.filter((r) => perInfluencer[r.id]).map((r) => save(r.id)));
  }
  const checked = new Set<string>(connected.map((r) => r.id));

  // Everyone else through ScrapeCreators, within today's credits. One run at a time, so two can't spend the same credits.
  let note: string | null = null;
  let creditsUsed = 0;
  const { data: locked } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 170 });
  if (!locked) {
    note = "Another refresh is running, so this one skipped the public lookups.";
  } else {
    try {
      const [spentRes, balanceRes, goneRes, liveRes] = await Promise.all([
        supabase.from("scraper_credit_log").select("credits").eq("context", LOG_CONTEXT).gte("created_at", nairobiDayStart(now)),
        supabase.from("scraper_credit_log").select("credits_remaining").eq("provider", "scrapecreators").not("credits_remaining", "is", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("job_locks").select("name").like("name", `${GONE_LOCK_PREFIX}%`).gt("locked_until", new Date(now).toISOString()),
        supabase.from("campaign_influencers").select("influencer_id, campaigns!inner(status)").eq("campaigns.status", "live"),
      ]);
      const spentToday = (spentRes.data ?? []).reduce((sum: number, row: any) => sum + Number(row.credits), 0);
      const queue = pickPublicLookups(rows.filter((r) => !perInfluencer[r.id]), {
        now,
        waiting: new Set((goneRes.data ?? []).map((row: any) => row.name)),
        live: new Set((liveRes.data ?? []).map((row: any) => row.influencer_id)),
        explicit: !!influencerIds,
        limit,
      });
      const spend: Spend = {
        allowance: dailyCredits(Deno.env.get("INFLUENCER_STATS_DAILY_CREDITS")) - spentToday,
        used: 0,
        balance: balanceRes.data?.credits_remaining ?? null,
        outOfCredits: false,
      };
      if (!queue.length && !connected.length) note = "Nobody is due: creators are looked up once a fortnight.";
      const { tried, skippedForTime: left } = await runLookups({
        queue,
        spend,
        atOnce: CONCURRENCY,
        call: scrapeCreatorsGet,
        outOfTime: () => Date.now() > deadline,
        onBatch: async (done, charged) => {
          if (charged > 0) {
            await supabase.from("scraper_credit_log").insert({ provider: "scrapecreators", credits: charged, credits_remaining: spend.balance, context: LOG_CONTEXT });
          }
          await Promise.all(done.map(async ({ row, target, lookup }) => {
            checked.add(row.id);
            if (lookup.outcome === "found") push(row.id, lookup.stats, `scrapecreators_${target.platform}`);
            if (lookup.outcome === "gone") await supabase.rpc("take_job_lock", { _name: goneLockName(target), _seconds: GONE_WAIT_SECONDS });
            await save(row.id);
          }));
        },
      });
      skippedForTime += left;
      creditsUsed = spend.used;
      note = note ?? stopNote(spend, queue.length - tried);
    } finally {
      await supabase.rpc("release_job_lock", { _name: LOCK });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked: checked.size, updated: results.filter((r) => !r.skipped).length, skipped_for_time: skippedForTime, credits_used: creditsUsed, note, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
