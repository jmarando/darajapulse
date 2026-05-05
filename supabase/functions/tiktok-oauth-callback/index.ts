import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://id-preview--bbe5b359-6c29-4404-a95d-05e79dcf2d04.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return Response.redirect(`${APP_ORIGIN}/connect/tiktok/done?status=error&reason=${encodeURIComponent(error)}`, 302);
  if (!code || !state) return new Response("Missing code/state", { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: st } = await supabase.from("tiktok_oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st) return new Response("Invalid state", { status: 400 });
  await supabase.from("tiktok_oauth_states").delete().eq("state", state);

  const redirectUri = `${SUPABASE_URL}/functions/v1/tiktok-oauth-callback`;
  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const tok = await tokenRes.json();
  if (!tok.access_token) {
    console.error("tiktok token error", tok);
    return Response.redirect(`${APP_ORIGIN}/connect/tiktok/done?status=error&reason=token`, 302);
  }

  // Fetch user info
  const infoRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const info = await infoRes.json();
  const u = info?.data?.user ?? {};

  const expires_at = new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString();
  const refresh_expires_at = new Date(Date.now() + (tok.refresh_expires_in ?? 86400 * 365) * 1000).toISOString();

  await supabase.from("tiktok_accounts").upsert({
    influencer_id: st.influencer_id,
    open_id: tok.open_id ?? u.open_id,
    union_id: u.union_id,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at,
    refresh_expires_at,
    scope: tok.scope,
    updated_at: new Date().toISOString(),
  }, { onConflict: "influencer_id" });

  return Response.redirect(`${APP_ORIGIN}/connect/tiktok/done?status=ok`, 302);
});
