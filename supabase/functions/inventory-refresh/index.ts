import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller } from "../_shared/auth.ts";
import { inventoryStats, inventoryTarget } from "../_shared/inventory-stats.ts";
import { scrapeCreatorsGet, SCRAPECREATORS_ENABLED } from "../_shared/scrapecreators.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "inventory-refresh" });
  if (caller instanceof Response) return caller;
  if (!SCRAPECREATORS_ENABLED) return reply({ error: "ScrapeCreators is not configured" }, 503);
  let body: any;
  try { body = await req.json(); } catch { return reply({ error: "Invalid request" }, 400); }
  const itemIds = body?.item_ids ?? (body?.item_id ? [body.item_id] : null);
  const agencyId = body?.agency_id ?? null;
  const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (itemIds !== null && (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 200 || !itemIds.every(uuid))) return reply({ error: "Invalid item IDs" }, 400);
  if (agencyId !== null && !uuid(agencyId)) return reply({ error: "Invalid agency ID" }, 400);
  if (!itemIds && !agencyId) return reply({ error: "item_ids or agency_id required" }, 400);
  // Resolve the user's rows through RLS before using the service client to save their new numbers.
  const service = createClient(SUPABASE_URL, SERVICE_KEY);
  const reader = caller.kind === "user" ? createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  }) : service;
  let q = reader.from("inventory_items").select("id, platform, handle, follower_count, engagement_rate");
  if (itemIds) q = q.in("id", itemIds);
  else q = q.eq("agency_id", agencyId);
  const { data: rows, error } = await q;
  if (error) return reply({ error: error.message }, 500);
  if (itemIds && (rows ?? []).length !== new Set(itemIds).size) return reply({ error: "You don't have access to every requested item" }, 403);
  const targets = (rows ?? []).filter(r => r.handle && r.platform);
  const results: any[] = [];
  const deadline = Date.now() + 100_000;
  let outOfCredits = false;
  let creditsUsed = 0;
  let balance: number | null = null;
  const cache = new Map<string, Awaited<ReturnType<typeof inventoryStats>>>();
  for (const row of targets) {
    if (Date.now() > deadline || outOfCredits) break;
    const target = inventoryTarget(row.platform ?? "", row.handle ?? "");
    const key = target ? `${target.platform}:${target.handle}` : row.id;
    const cached = cache.get(key);
    const lookup = cached ?? await inventoryStats(row.platform ?? "", row.handle ?? "", scrapeCreatorsGet);
    if (!cached) {
      cache.set(key, lookup);
      creditsUsed += lookup.charged;
      if (lookup.balance !== null) balance = lookup.balance;
      if (lookup.charged > 0) {
        const { error: logError } = await service.from("scraper_credit_log").insert({ provider: "scrapecreators", credits: lookup.charged, credits_remaining: lookup.balance, context: "inventory_refresh" });
        if (logError) console.error("inventory-refresh: credit logging failed", logError.message);
      }
    }
    if (lookup.outcome !== "found" || !("stats" in lookup)) {
      results.push({ id: row.id, skipped: lookup.outcome });
      outOfCredits = lookup.outcome === "out_of_credits";
      continue;
    }
    const update: { follower_count: number; engagement_rate?: number } = { follower_count: lookup.stats.followers };
    if (lookup.stats.engagement_rate !== null) update.engagement_rate = lookup.stats.engagement_rate;
    const { error: saveError } = await service.from("inventory_items").update(update).eq("id", row.id);
    results.push({ id: row.id, ...update, ...(saveError ? { error: saveError.message } : {}) });
  }
  return reply({ ok: true, provider: "scrapecreators", checked: targets.length,
    updated: results.filter(r => !r.skipped && !r.error).length,
    skipped_for_time: Date.now() > deadline ? targets.length - results.length : 0,
    remaining: targets.length - results.length, out_of_credits: outOfCredits,
    credits_used: creditsUsed, credits_remaining: balance, results });
});
