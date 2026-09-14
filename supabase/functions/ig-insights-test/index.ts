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
      .order("updated_at", { ascending: false });
    if (username) q = q.eq("username", username);

    const { data, error } = await q;
    if (error) throw error;
    const accounts = (data ?? []).filter((a) => a.page_access_token || a.user_access_token);
    if (!accounts.length) return json({ error: "No connected Instagram account with a token" }, 404);

    const results: unknown[] = [];

    for (const acct of accounts) {
      const token = acct.page_access_token || acct.user_access_token;
      const calls: Record<string, unknown> = {};

      const hit = async (label: string, url: string) => {
        const r = await fetch(url);
        calls[label] = { status: r.status, body: await r.json().catch(() => null) };
      };

      // Account-level insights (each requires instagram_manage_insights)
      await hit(
        "insights_day",
        `${GRAPH}/${acct.ig_user_id}/insights?metric=views,profile_views&period=day&metric_type=total_value&access_token=${token}`,
      );
      await hit(
        "insights_week",
        `${GRAPH}/${acct.ig_user_id}/insights?metric=reach&period=week&access_token=${token}`,
      );
      await hit(
        "insights_lifetime_audience",
        `${GRAPH}/${acct.ig_user_id}/insights?metric=follower_count&period=day&access_token=${token}`,
      );
      await hit(
        "insights_demographics",
        `${GRAPH}/${acct.ig_user_id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=country&access_token=${token}`,
      );

      // Media, then per-media insights (also instagram_manage_insights)
      const r2 = await fetch(
        `${GRAPH}/${acct.ig_user_id}/media?fields=id,caption,media_type,permalink&limit=5&access_token=${token}`,
      );
      const media = await r2.json().catch(() => null);
      calls.media = { status: r2.status, count: media?.data?.length ?? 0 };

      for (const m of (media?.data ?? []).slice(0, 5)) {
        await hit(
          `media_insights_${m.id}`,
          `${GRAPH}/${m.id}/insights?metric=reach,likes,comments,shares,saved&access_token=${token}`,
        );
      }

      results.push({
        account: { ig_user_id: acct.ig_user_id, username: acct.username, scope: acct.scope },
        calls,
      });
    }

    return json({ accounts: results.length, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
