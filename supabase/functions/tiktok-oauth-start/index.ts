import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const influencer_id = url.searchParams.get("influencer_id");
  if (!influencer_id) {
    return new Response(JSON.stringify({ error: "influencer_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await supabase.from("tiktok_oauth_states").insert({ state, influencer_id });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const redirectUri = `${SUPABASE_URL}/functions/v1/tiktok-oauth-callback`;
  const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
  auth.searchParams.set("client_key", CLIENT_KEY);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "user.info.basic,video.list");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);

  return Response.redirect(auth.toString(), 302);
});
