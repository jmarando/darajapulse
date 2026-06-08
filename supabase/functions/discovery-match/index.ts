// Rank existing discovery_creators against a user brief using Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIER_BANDS: Record<string, [number, number]> = {
  nano: [1000, 10000],
  micro: [10000, 100000],
  mid: [100000, 500000],
  macro: [500000, 50_000_000],
  any: [0, 50_000_000],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const brief = await req.json();
    const platforms: string[] = brief.platforms?.length ? brief.platforms : ["instagram", "tiktok", "youtube", "twitter", "facebook"];
    const tier = brief.budget_tier || "any";
    const [minF, maxF] = TIER_BANDS[tier] || TIER_BANDS.any;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: candidates, error } = await supabase
      .from("discovery_creators")
      .select("id, full_name, handle, platform, niche, follower_count, engagement_rate, city, bio")
      .in("platform", platforms)
      .gte("follower_count", minF)
      .lte("follower_count", maxF)
      .limit(250);
    if (error) throw error;
    if (!candidates?.length) {
      return new Response(JSON.stringify({ matches: [], reason: "no candidates" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are an influencer matchmaker. Given a brief and a list of candidate creators, return the top 15 best matches.

BRIEF:
${JSON.stringify(brief, null, 2)}

CANDIDATES (id, handle, platform, niche, followers, city, bio):
${candidates.map((c, i) => `${i + 1}. id=${c.id} | @${c.handle} on ${c.platform} | niche=${(c.niche || []).join(",")} | followers=${c.follower_count} | city=${c.city || "-"} | bio=${(c.bio || "").slice(0, 100)}`).join("\n")}

Return STRICT JSON: {"matches":[{"creator_id":"uuid","score":0-100,"reason":"one sentence","angle":"short content angle"}]} ordered by score desc.`;

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
      if (res.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI ${res.status}: ${t}`);
    }
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(txt); } catch { parsed = { matches: [] }; }
    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

    // Save search
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      try {
        const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
        const { data: u } = await userClient.auth.getUser();
        userId = u?.user?.id ?? null;
      } catch { /* ignore */ }
    }
    await supabase.from("discovery_searches").insert({ user_id: userId, brief, results: matches });

    return new Response(JSON.stringify({ matches, candidate_count: candidates.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("match fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
