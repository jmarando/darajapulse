import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ID = Deno.env.get("META_APP_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Scopes required for hashtag search, insights, mentions on IG Business via FB Login
// Keep to scopes that are available by default on a new Meta app.
// Add insights/comments/business_management back once they're approved
// (or added under App Review → Permissions and Features) in the Meta dashboard.
const SCOPES = [
  "public_profile",
  "email",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!APP_ID || APP_ID.length < 6) {
    return new Response(
      "Instagram is not configured: META_APP_ID is missing on the server.",
      { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain" } },
    );
  }

  const url = new URL(req.url);
  const influencer_id = url.searchParams.get("influencer_id");
  if (!influencer_id) {
    return new Response(JSON.stringify({ error: "influencer_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await supabase.from("instagram_oauth_states").insert({ state, influencer_id });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;
  const auth = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  auth.searchParams.set("client_id", APP_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", SCOPES);
  auth.searchParams.set("state", state);

  return Response.redirect(auth.toString(), 302);
});
