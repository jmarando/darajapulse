import { scrapeCreatorsProfile, SCRAPECREATORS_ENABLED } from "../_shared/scrapecreators.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async () => {
  if (!SCRAPECREATORS_ENABLED) {
    return new Response(JSON.stringify({ ok: false, error: "SCRAPECREATORS_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const profile = await scrapeCreatorsProfile("instagram", "nasa");
  return new Response(JSON.stringify({
    ok: !!profile,
    credits_remaining: profile?.creditsRemaining ?? null,
    followers: profile?.raw?.data?.user?.edge_followed_by?.count ?? profile?.raw?.followers_count ?? null,
    error: profile ? null : "profile lookup failed (check function logs)",
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
