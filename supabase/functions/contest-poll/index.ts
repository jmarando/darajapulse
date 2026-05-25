import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// Weighted formula: shares*3 + comments*2 + likes*1
const score = (e: any) => Number(e.shares || 0) * 3 + Number(e.comments || 0) * 2 + Number(e.likes || 0) + Number(e.views || 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { contest_id } = await req.json();
    if (!contest_id) return new Response(JSON.stringify({ error: "contest_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: contest } = await sb.from("contests").select("*").eq("id", contest_id).single();
    if (!contest) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: entries } = await sb.from("contest_entries").select("*").eq("contest_id", contest_id);
    const start = new Date(contest.start_date).getTime();
    const roundMs = (contest.round_days || 14) * 86400 * 1000;
    const cutoffs: number[] = Array.isArray(contest.manual_round_cutoffs) && contest.manual_round_cutoffs.length
      ? contest.manual_round_cutoffs.map((c: string) => new Date(c).getTime()).sort((a, b) => a - b)
      : [];

    const roundFor = (t: number) => {
      if (cutoffs.length) {
        let r = 1;
        for (const c of cutoffs) if (t >= c) r++;
        return r;
      }
      return Math.max(1, Math.floor((t - start) / roundMs) + 1);
    };

    let updated = 0;
    for (const e of entries ?? []) {
      const t = new Date(e.posted_at || e.created_at).getTime();
      const round_number = roundFor(t);
      const sc = score(e);
      await sb.from("contest_entries").update({ score: sc, round_number, last_polled_at: new Date().toISOString() }).eq("id", e.id);
      updated++;
    }

    // Auto-mark winner per completed round
    const now = Date.now();
    const roundEnds: number[] = cutoffs.length
      ? [...cutoffs, new Date(contest.end_date).getTime()]
      : Array.from({ length: Math.ceil((new Date(contest.end_date).getTime() - start) / roundMs) }, (_, i) => start + (i + 1) * roundMs);
    for (let i = 0; i < roundEnds.length; i++) {
      const roundEnd = roundEnds[i];
      const r = i + 1;
      if (roundEnd > now) continue;
      const { data: top } = await sb.from("contest_entries")
        .select("id").eq("contest_id", contest_id).eq("round_number", r)
        .in("status", ["approved", "winner"]).order("score", { ascending: false }).limit(1).maybeSingle();
      if (top) {
        await sb.from("contest_entries").update({ status: "approved" }).eq("contest_id", contest_id).eq("round_number", r).eq("status", "winner");
        await sb.from("contest_entries").update({ status: "winner" }).eq("id", top.id);
      }
    }

    return new Response(JSON.stringify({ updated, rounds: roundEnds.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
