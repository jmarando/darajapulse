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
      `${APP_ORIGIN}/connect/facebook/done?status=error&reason=${encodeURIComponent(error)}`,
      302,
    );
  }
  if (!code || !state) return new Response("Missing code/state", { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: st } = await supabase
    .from("facebook_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (!st) return new Response("Invalid state", { status: 400 });
  await supabase.from("facebook_oauth_states").delete().eq("state", state);

  const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

  // 1. Exchange code for short-lived user token
  const tokRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
  );
  const tok = await tokRes.json();
  if (!tok.access_token) {
    console.error("fb token error", tok);
    return Response.redirect(`${APP_ORIGIN}/connect/facebook/done?status=error&reason=token`, 302);
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

  // 3. List pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,username,access_token,picture{url},category&access_token=${userToken}`,
  );
  const pages = await pagesRes.json();
  if (!pagesRes.ok || pages.error) {
    console.error("fb pages error", {
      status: pagesRes.status,
      message: pages.error?.message,
      type: pages.error?.type,
      code: pages.error?.code,
      fbtrace_id: pages.error?.fbtrace_id,
    });
    return Response.redirect(
      `${APP_ORIGIN}/connect/facebook/done?status=error&reason=pages_permission`,
      302,
    );
  }

  const list = Array.isArray(pages.data) ? pages.data : [];
  if (list.length === 0) {
    return Response.redirect(`${APP_ORIGIN}/connect/facebook/done?status=error&reason=no_pages`, 302);
  }

  // For now, link the first Page the user admins. A future iteration can show a picker.
  const page = list[0];

  await supabase.from("facebook_accounts").upsert(
    {
      influencer_id: st.influencer_id,
      page_id: page.id,
      page_name: page.name,
      page_username: page.username ?? null,
      picture_url: page.picture?.data?.url ?? null,
      category: page.category ?? null,
      page_access_token: page.access_token,
      user_access_token: userToken,
      token_expires_at: expiresAt,
      scope: "pages_show_list,pages_read_engagement,pages_read_user_content,read_insights",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "influencer_id" },
  );

  return Response.redirect(`${APP_ORIGIN}/connect/facebook/done?status=ok`, 302);
});
