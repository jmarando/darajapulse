// Pulls live story frames + insights from connected Instagram / Facebook accounts.
// Stories expire after 24h, so this is meant to run on a schedule (every few hours).
// Creators without a connected account are covered by manual screenshot logging in the UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const GRAPH = "https://graph.facebook.com/v21.0";

async function graph(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Graph ${path} ${r.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return json;
}

function readInsights(payload: any) {
  const out: Record<string, number> = {};
  for (const m of payload?.data ?? []) {
    const v = m?.values?.[0]?.value;
    if (typeof v === "number") out[m.name] = v;
  }
  return out;
}

async function syncInstagram(acct: any, influencerId: string, campaignIds: string[]) {
  const token = acct.page_access_token;
  const frames = await graph(`${acct.ig_user_id}/stories`, {
    fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp,caption",
    access_token: token,
  });
  let captured = 0;
  for (const f of frames?.data ?? []) {
    let ins: Record<string, number> = {};
    try {
      ins = readInsights(await graph(`${f.id}/insights`, {
        metric: "impressions,reach,replies,exits,taps_forward,taps_back",
        access_token: token,
      }));
    } catch (_) { /* insights unavailable for some media types */ }

    const postedAt = f.timestamp ? new Date(f.timestamp).toISOString() : new Date().toISOString();
    for (const campaignId of campaignIds) {
      const { error } = await supabase.from("stories").upsert({
        campaign_id: campaignId,
        influencer_id: influencerId,
        platform: "instagram",
        external_id: f.id,
        posted_at: postedAt,
        expires_at: new Date(new Date(postedAt).getTime() + 24 * 3600_000).toISOString(),
        media_url: f.thumbnail_url ?? f.media_url ?? null,
        permalink: f.permalink ?? null,
        caption: f.caption ?? null,
        reach: ins.reach ?? null,
        impressions: ins.impressions ?? null,
        replies: ins.replies ?? null,
        taps_forward: ins.taps_forward ?? null,
        taps_back: ins.taps_back ?? null,
        exits: ins.exits ?? null,
        source: "instagram_api",
        verified: true,
      }, { onConflict: "platform,external_id" });
      if (!error) captured++;
    }
  }
  return captured;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { campaign_id } = body as { campaign_id?: string };

    // Which creators are we covering, and which campaigns should each frame land on?
    let ciq = supabase.from("campaign_influencers").select("campaign_id, influencer_id");
    if (campaign_id) ciq = ciq.eq("campaign_id", campaign_id);
    const { data: ci, error: ciErr } = await ciq;
    if (ciErr) throw ciErr;

    const byInfluencer = new Map<string, string[]>();
    for (const row of ci ?? []) {
      const list = byInfluencer.get(row.influencer_id) ?? [];
      list.push(row.campaign_id);
      byInfluencer.set(row.influencer_id, list);
    }
    const influencerIds = [...byInfluencer.keys()];
    if (influencerIds.length === 0) {
      return new Response(JSON.stringify({ accounts: 0, captured: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: igAccounts } = await supabase
      .from("instagram_accounts")
      .select("influencer_id, ig_user_id, page_access_token, username")
      .in("influencer_id", influencerIds);

    const results: any[] = [];
    let captured = 0;
    for (const acct of igAccounts ?? []) {
      try {
        const n = await syncInstagram(acct, acct.influencer_id, byInfluencer.get(acct.influencer_id) ?? []);
        captured += n;
        results.push({ account: acct.username ?? acct.ig_user_id, ok: true, captured: n });
      } catch (e) {
        console.error(`stories-sync failed for ${acct.username ?? acct.ig_user_id}:`, (e as Error).message);
        results.push({ account: acct.username ?? acct.ig_user_id, ok: false, error: String((e as Error).message) });
      }
    }

    return new Response(JSON.stringify({ accounts: (igAccounts ?? []).length, captured, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
