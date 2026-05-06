import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Gather report data
    const { data: c } = await supabase.from("campaigns").select("*, clients(name)").eq("id", campaign_id).single();
    const { data: ci } = await supabase.from("campaign_influencers").select("*, influencers(*)").eq("campaign_id", campaign_id);
    const { data: posts } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", campaign_id);
    const postIds = (posts ?? []).map((p: any) => p.id);
    let metrics: any[] = [];
    if (postIds.length) {
      const { data: m } = await supabase.from("post_metrics").select("*").in("post_id", postIds).order("captured_at", { ascending: false });
      metrics = m ?? [];
    }

    // Latest metric per post
    const latest = new Map<string, any>();
    for (const m of metrics) if (!latest.has(m.post_id)) latest.set(m.post_id, m);

    // Aggregate by platform
    const byPlatform: Record<string, any> = {};
    let totals = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 };
    for (const p of posts ?? []) {
      const m = latest.get(p.id);
      if (!m) continue;
      const k = p.platform;
      const cur = byPlatform[k] ?? { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 };
      cur.posts += 1;
      cur.views += Number(m.views || 0);
      cur.likes += Number(m.likes || 0);
      cur.comments += Number(m.comments || 0);
      cur.shares += Number(m.shares || 0);
      byPlatform[k] = cur;
      totals.views += Number(m.views || 0);
      totals.likes += Number(m.likes || 0);
      totals.comments += Number(m.comments || 0);
      totals.shares += Number(m.shares || 0);
      totals.saves += Number(m.saves || 0);
      totals.reach += Number(m.reach || 0);
    }

    // Per-creator
    const byCreator = (ci ?? []).map((x: any) => {
      const ps = (posts ?? []).filter((p: any) => p.influencer_id === x.influencer_id);
      let v = 0, l = 0, cm = 0;
      for (const p of ps) {
        const m = latest.get(p.id);
        if (!m) continue;
        v += Number(m.views || 0); l += Number(m.likes || 0); cm += Number(m.comments || 0);
      }
      return {
        name: x.influencers?.full_name,
        handle: x.influencers?.handle,
        platform: x.influencers?.primary_platform,
        followers: x.influencers?.follower_count,
        fee_kes: x.fee_kes,
        posts: ps.length,
        views: v, likes: l, comments: cm,
      };
    });

    const reportContext = {
      campaign: { name: c?.name, client: c?.clients?.name, objective: c?.objective, budget_kes: c?.budget_kes, hashtag: c?.hashtag },
      totals,
      by_platform: byPlatform,
      creators: byCreator,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a senior influencer marketing strategist for the Kenyan market. Write a concise, client-ready 'Learnings & Recommendations' section based on campaign performance data. Use 2 short paragraphs OR 4-6 bullet points. Be specific: cite numbers, platforms, and top creators. End with 2-3 forward-looking recommendations. Tone: confident, data-driven, no fluff. Plain text only, no markdown headers." },
          { role: "user", content: `Campaign report:\n${JSON.stringify(reportContext, null, 2)}` },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    const learnings = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ learnings }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
