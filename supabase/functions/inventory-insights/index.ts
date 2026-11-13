// Reads each storefront account's latest public posts and saves what they say: typical views, how often it posts,
// engagement and its best recent posts. The storefront shows it when a buyer opens a listing.
//
// Callers: a signed-in admin of the storefront (item_ids or agency_id), or the scheduled job ({ due: true }), which
// re-reads accounts not read for a week. A failed read saves only the attempt: an old reading stays until a good one.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller } from "../_shared/auth.ts";
import { storeAvatar } from "../_shared/avatar-store.ts";
import { insightTarget, readChannel, summarise, type ChannelInsights } from "../_shared/channel-insights.ts";
import { scrapeCreatorsGet, SCRAPECREATORS_ENABLED } from "../_shared/scrapecreators.ts";
import type { ScCall } from "../_shared/brand-pull.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** The scheduled job re-reads an account once a week; a button press skips accounts read in the last day. */
const DUE_DAYS = 7;
const FRESH_HOURS = 20;
/** Public reads stop below this balance, because campaign metrics and Listening spend from the same account. */
const CREDIT_FLOOR = 300;
const JOB_BATCH = 40;
const DEADLINE_MS = 110_000;

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

type Row = { id: string; kind: string; platform: string | null; handle: string | null; cover_url: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "inventory-insights" });
  if (caller instanceof Response) return caller;
  if (!SCRAPECREATORS_ENABLED) return reply({ error: "ScrapeCreators is not configured" }, 503);
  let body: { item_ids?: unknown; item_id?: unknown; agency_id?: unknown; due?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { body = {}; }
  const itemIds = (body.item_ids ?? (body.item_id ? [body.item_id] : null)) as unknown[] | null;
  const agencyId = (body.agency_id ?? null) as string | null;
  const due = body.due === true;
  if (itemIds !== null && (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 200 || !itemIds.every(uuid))) return reply({ error: "Invalid item IDs" }, 400);
  if (agencyId !== null && !uuid(agencyId)) return reply({ error: "Invalid agency ID" }, 400);
  if (!itemIds && !agencyId && !due) return reply({ error: "item_ids, agency_id or due required" }, 400);
  if (due && caller.kind === "user") return reply({ error: "Only the scheduled job reads every due account" }, 403);

  const service = createClient(SUPABASE_URL, SERVICE_KEY);
  // A user's rows are resolved through RLS first, so nobody can read another house's accounts on its credits.
  const reader = caller.kind === "user" ? createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  }) : service;
  let q = reader.from("inventory_items").select("id, kind, platform, handle, cover_url").eq("is_active", true).in("kind", ["owned_account", "influencer"]);
  if (itemIds) q = q.in("id", itemIds);
  else if (agencyId) q = q.eq("agency_id", agencyId);
  const { data: rows, error } = await q;
  if (error) return reply({ error: error.message }, 500);

  const now = Date.now();
  const readable = (rows ?? []).filter((r: Row) => insightTarget(r.platform, r.handle));
  const { data: past } = await service.from("inventory_item_insights").select("item_id, last_attempt_at").in("item_id", readable.map((r: Row) => r.id));
  const lastTry = new Map((past ?? []).map((p: { item_id: string; last_attempt_at: string | null }) => [p.item_id, p.last_attempt_at ? Date.parse(p.last_attempt_at) : 0]));
  // One listing asked for by id is always read. A whole house skips what was read today; the job takes what's a week old.
  const wait = itemIds?.length === 1 ? 0 : due ? DUE_DAYS * 86_400_000 : FRESH_HOURS * 3_600_000;
  let targets = readable.filter((r: Row) => now - (lastTry.get(r.id) ?? 0) >= wait)
    .sort((a: Row, b: Row) => (lastTry.get(a.id) ?? 0) - (lastTry.get(b.id) ?? 0));
  if (due) targets = targets.slice(0, JOB_BATCH);

  let credits = 0;
  let balance: number | null = null;
  const call: ScCall = async (path, params) => {
    const answer = await scrapeCreatorsGet(path, params);
    const charged = typeof answer.json?.credits_charged === "number" ? Math.max(0, answer.json.credits_charged) : answer.status >= 200 && answer.status < 300 ? 1 : 0;
    credits += charged;
    if (typeof answer.json?.credits_remaining === "number") balance = answer.json.credits_remaining;
    return answer;
  };

  const deadline = now + DEADLINE_MS;
  const outOfTime = () => Date.now() > deadline;
  const results: Record<string, unknown>[] = [];
  const done = new Map<string, ChannelInsights | { failed: string }>();
  let stopped: string | null = null;

  for (const row of targets as Row[]) {
    if (outOfTime()) { stopped = "time"; break; }
    if (balance !== null && balance < CREDIT_FLOOR) { stopped = "credit_floor"; break; }
    const target = insightTarget(row.platform, row.handle)!;
    const key = `${target.platform}:${target.handle}`;
    let outcome = done.get(key);
    if (!outcome) {
      const read = await readChannel(target, call, Date.now(), outOfTime);
      if (!read.ok) outcome = { failed: read.kind };
      else {
        const insights = summarise(read.channel, read.posts, Date.now());
        // Instagram, TikTok and Facebook pictures are signed links that die within days: keep our own copies.
        insights.account.avatar_url = await storeAvatar(service, insights.account.avatar_url, `storefront/${target.platform}/${target.handle}`);
        for (const [n, post] of insights.top.entries()) {
          post.thumbnail_url = await storeAvatar(service, post.thumbnail_url, `storefront/${target.platform}/${target.handle}-top-${n + 1}`);
        }
        outcome = insights;
      }
      done.set(key, outcome);
    }
    const attempt = new Date().toISOString();
    if ("failed" in outcome) {
      await service.from("inventory_item_insights").upsert({ item_id: row.id, last_attempt_at: attempt, last_error: outcome.failed }, { onConflict: "item_id" });
      results.push({ id: row.id, skipped: outcome.failed });
      if (outcome.failed === "out_of_credits") { stopped = "out_of_credits"; break; }
      continue;
    }
    const { error: saveError } = await service.from("inventory_item_insights").upsert(
      { item_id: row.id, insights: outcome, read_at: attempt, last_attempt_at: attempt, last_error: null }, { onConflict: "item_id" });
    // The read also refreshes the follower count, and gives a listing without a picture the account's own photo.
    const update: Record<string, unknown> = {};
    if ((outcome.account.followers ?? 0) > 0) update.follower_count = outcome.account.followers;
    if (!row.cover_url && outcome.account.avatar_url) update.cover_url = outcome.account.avatar_url;
    if (Object.keys(update).length) await service.from("inventory_items").update(update).eq("id", row.id);
    results.push({
      id: row.id, name: outcome.account.name, followers: outcome.account.followers, posts: outcome.summary.posts,
      median_views: outcome.summary.median_views, ...(saveError ? { error: saveError.message } : {}),
    });
  }

  if (credits > 0) {
    const { error: logError } = await service.from("scraper_credit_log").insert({ provider: "scrapecreators", credits, credits_remaining: balance, context: "inventory_insights" });
    if (logError) console.error("inventory-insights: credit logging failed", logError.message);
  }
  return reply({
    ok: true, checked: targets.length, read: results.filter((r) => !r.skipped && !r.error).length,
    remaining: targets.length - results.length, stopped, credits_used: credits, credits_remaining: balance, results,
  });
});
