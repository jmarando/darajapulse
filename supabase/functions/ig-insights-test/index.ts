// Makes a real Instagram Graph API insights call for a connected account.
// Purpose: exercise the instagram_manage_insights permission so Meta records
// API usage during App Review testing, and to verify tokens work end to end.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({} as any));
    const username: string | undefined = body.username;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = sb.from("instagram_accounts")
      .select("ig_user_id, username, page_access_token, user_access_token, scope")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (username) q = q.eq("username", username);

    const { data, error } = await q;
    if (error) throw error;
    const acct = data?.[0];
    if (!acct) return json({ error: "No connected Instagram account found" }, 404);

    const token = acct.page_access_token || acct.user_access_token;
    if (!token) return json({ error: "Connected account has no access token" }, 400);

    const calls: Record<string, unknown> = {};

    // 1. Account-level insights (requires instagram_manage_insights)
    const insightsUrl =
      `${GRAPH}/${acct.ig_user_id}/insights?metric=reach&period=day&access_token=${token}`;
    const r1 = await fetch(insightsUrl);
    calls.account_insights = { status: r1.status, body: await r1.json().catch(() => null) };

    // 2. Recent media, then media-level insights
    const r2 = await fetch(
      `${GRAPH}/${acct.ig_user_id}/media?fields=id,caption,media_type,permalink&limit=3&access_token=${token}`,
    );
    const media = await r2.json().catch(() => null);
    calls.media = { status: r2.status, body: media };

    const firstId = media?.data?.[0]?.id;
    if (firstId) {
      const r3 = await fetch(
        `${GRAPH}/${firstId}/insights?metric=reach,likes,comments,shares,saved&access_token=${token}`,
      );
      calls.media_insights = { status: r3.status, body: await r3.json().catch(() => null) };
    }

    return json({
      account: { ig_user_id: acct.ig_user_id, username: acct.username, scope: acct.scope },
      calls,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
