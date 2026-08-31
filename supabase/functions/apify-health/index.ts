// Quick health check for the Apify token: account info + optional Facebook actor smoke test.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const APIFY = Deno.env.get("APIFY_API_TOKEN") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (!APIFY) return json({ ok: false, error: "APIFY_API_TOKEN not configured" }, 500);

  const body = await req.json().catch(() => ({} as any));
  const fbUrl: string | undefined = body?.facebook_url;

  const out: Record<string, unknown> = {};

  const me = await fetch(`https://api.apify.com/v2/users/me?token=${APIFY}`);
  const meText = await me.text();
  out.account_status = me.status;
  try {
    const j = JSON.parse(meText);
    out.account = { username: j?.data?.username, plan: j?.data?.plan?.id ?? j?.data?.plan?.tier ?? null };
  } catch { out.account_raw = meText.slice(0, 300); }

  if (fbUrl) {
    const r = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${APIFY}&timeout=180`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startUrls: [{ url: fbUrl }], resultsLimit: 1 }),
      },
    );
    const t = await r.text();
    out.facebook_status = r.status;
    try {
      const items = JSON.parse(t);
      out.facebook_items = Array.isArray(items) ? items.length : 0;
      out.facebook_sample = Array.isArray(items) && items[0]
        ? {
            url: items[0].url ?? items[0].topLevelUrl ?? null,
            likes: items[0].likesCount ?? items[0].reactionsCount ?? null,
            comments: items[0].commentsCount ?? null,
            shares: items[0].sharesCount ?? null,
            views: items[0].viewsCount ?? items[0].videoViewCount ?? null,
          }
        : null;
    } catch { out.facebook_raw = t.slice(0, 400); }
  }

  return json({ ok: true, ...out });
});
