import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ID = Deno.env.get("META_APP_ID")!;
const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://darajapulse.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(
      `${APP_ORIGIN}/connect/instagram/done?status=error&reason=${encodeURIComponent(error)}`,
      302,
    );
  }
  if (!code || !state) return new Response("Missing code/state", { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: st } = await supabase
    .from("instagram_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (!st) {
    console.error("ig invalid or reused oauth state", { statePrefix: state.slice(0, 8) });
    return Response.redirect(`${APP_ORIGIN}/connect/instagram/done?status=error&reason=invalid_state`, 302);
  }
  await supabase.from("instagram_oauth_states").delete().eq("state", state);

  const redirectUri = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;

  // 1. Exchange code for short-lived user token
  const tokRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
  );
  const tok = await tokRes.json();
  if (!tok.access_token) {
    console.error("ig token error", tok);
    return Response.redirect(`${APP_ORIGIN}/connect/instagram/done?status=error&reason=token`, 302);
  }

  // 2. Long-lived user token (~60 days)
  const llRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tok.access_token}`,
  );
  const ll = await llRes.json();
  const userToken = ll.access_token ?? tok.access_token;
  const expiresAt = ll.expires_in
    ? new Date(Date.now() + ll.expires_in * 1000).toISOString()
    : null;

  // 3. List pages → grab first Page with linked IG Business/Creator account
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url},connected_instagram_account{id,username}&access_token=${userToken}`,
  );
  const pages = await pagesRes.json();
  if (!pagesRes.ok || pages.error) {
    console.error("ig pages error", {
      status: pagesRes.status,
      message: pages.error?.message,
      type: pages.error?.type,
      code: pages.error?.code,
      fbtrace_id: pages.error?.fbtrace_id,
    });
    return Response.redirect(`${APP_ORIGIN}/connect/instagram/done?status=error&reason=pages_permission`, 302);
  }

  const pageCount = Array.isArray(pages.data) ? pages.data.length : 0;
  const page = (pages.data ?? []).find((p: any) => p.instagram_business_account);
  if (!page) {
    const connectedPage = (pages.data ?? []).find((p: any) => p.connected_instagram_account);
    console.error("ig business account not found", {
      pageCount,
      hasConnectedInstagram: Boolean(connectedPage),
      pageNames: (pages.data ?? []).map((p: any) => p.name).slice(0, 10),
    });
    const reason = pageCount === 0
      ? "no_pages"
      : connectedPage
        ? "ig_not_professional"
        : "no_ig_business";
    return Response.redirect(`${APP_ORIGIN}/connect/instagram/done?status=error&reason=${reason}`, 302);
  }

  const ig = page.instagram_business_account;

  await supabase.from("instagram_accounts").upsert(
    {
      influencer_id: st.influencer_id,
      ig_user_id: ig.id,
      username: ig.username,
      name: ig.name,
      profile_picture_url: ig.profile_picture_url,
      page_id: page.id,
      page_access_token: page.access_token,
      user_access_token: userToken,
      token_expires_at: expiresAt,
      scope: "instagram_basic,instagram_manage_insights,instagram_manage_comments,pages_show_list,pages_read_engagement",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "influencer_id" },
  );

  return Response.redirect(`${APP_ORIGIN}/connect/instagram/done?status=ok`, 302);
});
