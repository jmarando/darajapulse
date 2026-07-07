// Fetches a post URL server-side, extracts an og:image / twitter:image /
// video preview, persists it to posts.thumbnail_url for future loads, and
// returns the resolved URL. This is the "once and for all" fallback for
// posts (esp. Facebook) whose thumbnail wasn't populated during metric refresh.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UA =
  "Mozilla/5.0 (compatible; DarajaPulseBot/1.0; +https://darajapulse.com)";

function extractImage(html: string): string | null {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m?.[1] ? decode(m[1]) : null;
  };
  return (
    pick(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)/i) ||
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ||
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i) ||
    pick(/<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)/i) ||
    pick(/"thumbnail_url":\s*"([^"]+)"/i) ||
    pick(/"display_url":\s*"([^"]+)"/i) ||
    pick(/"cover":\s*"([^"]+)"/i) ||
    null
  );
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const postId: string | null = body.post_id ?? null;
  const providedUrl: string | null = body.url ?? null;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let url = providedUrl;
  if (!url && postId) {
    const { data } = await (supabase.from("posts") as any)
      .select("post_url, thumbnail_url")
      .eq("id", postId)
      .maybeSingle();
    if (data?.thumbnail_url) {
      return new Response(JSON.stringify({ ok: true, thumbnail_url: data.thumbnail_url, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    url = data?.post_url ?? null;
  }

  if (!url) {
    return new Response(JSON.stringify({ ok: false, error: "missing url or post_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const html = await fetchHtml(url);
  const thumb = html ? extractImage(html) : null;

  if (thumb && postId) {
    await (supabase.from("posts") as any)
      .update({ thumbnail_url: thumb })
      .eq("id", postId)
      .is("thumbnail_url", null);
  }

  return new Response(JSON.stringify({ ok: !!thumb, thumbnail_url: thumb }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
