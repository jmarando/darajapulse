// Rank a media house's inventory against a client brief using Lovable AI.
// Public endpoint used by the storefront ("Match to my brief"). No auth needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const agencySlug: string | undefined = body.agency_slug;
    const brief = body.brief || {};
    if (!agencySlug) {
      return new Response(JSON.stringify({ error: "agency_slug required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, slug")
      .eq("slug", agencySlug)
      .maybeSingle();
    if (!agency) {
      return new Response(JSON.stringify({ error: "agency not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: items, error } = await supabase
      .from("inventory_items")
      .select("id, kind, title, subtitle, platform, handle, follower_count, engagement_rate, audience_demo, tags, deliverable_type")
      .eq("agency_id", agency.id)
      .eq("is_active", true)
      .limit(500);
    if (error) throw error;

    if (!items?.length) {
      return new Response(JSON.stringify({ matches: [], candidate_count: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `You are matching a media house's inventory to a client brief.
BRIEF: ${JSON.stringify(brief, null, 2)}

INVENTORY (id, title, kind, platform, handle, followers, engagement%, tags):
${items.map((c, i) => `${i + 1}. id=${c.id} | ${c.title} | ${c.kind} | ${c.platform} | @${c.handle || "-"} | followers=${c.follower_count || 0} | er=${c.engagement_rate || 0} | tags=${(c.tags || []).join(",")}`).join("\n")}

Rules:
- Pick ONLY items that genuinely fit the brief's topic, audience, or format. Skip anything off-topic.
- Prefer 3-8 great matches over many mediocre ones.
- Score 80+ excellent, 60-79 good, 40-59 weak (omit anything below 40).
- The "reason" MUST name the item by its exact title or @handle from the list above — never invent names.
- Group same-personality-across-platforms in your reasoning but return each platform row separately if all fit.

Return STRICT JSON: {"matches":[{"item_id":"uuid","score":0-100,"reason":"one sentence naming the actual item","angle":"content angle in 5-10 words"}]} ordered by score desc.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Output strict JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI ${res.status}: ${t}`);
    }
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(txt); } catch { parsed = { matches: [] }; }
    const raw = Array.isArray(parsed.matches) ? parsed.matches : [];

    const byId = new Map(items.map(c => [c.id, c]));
    const allTitles = items.map(c => (c.title || "").toLowerCase()).filter(Boolean);
    const allHandles = items.map(c => (c.handle || "").toLowerCase()).filter(Boolean);
    const matches = raw
      .filter((m: any) => m && byId.has(m.item_id) && Number(m.score) >= 40)
      .map((m: any) => {
        const c = byId.get(m.item_id)!;
        const reason = String(m.reason || "");
        const lower = reason.toLowerCase();
        const ownTitle = (c.title || "").toLowerCase();
        const ownHandle = (c.handle || "").toLowerCase();
        const mentionsOther = [...allTitles, ...allHandles].some(h =>
          h && h !== ownTitle && h !== ownHandle && lower.includes(h)
        );
        return {
          item_id: c.id,
          score: Math.round(Number(m.score) || 0),
          reason: mentionsOther ? `Strong fit for the brief (${c.title}).` : reason,
          angle: String(m.angle || "").slice(0, 120),
          item: c,
        };
      })
      .sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify({ matches, candidate_count: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("storefront-match fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
