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
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

// Facebook / most social CDNs 403 or return a login wall to a generic bot UA.
// A real desktop UA gets through their public og:image path far more often.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Facebook Graph oEmbed — works for public FB posts/reels/videos using an
// app access token (APP_ID|APP_SECRET). Returns { thumbnail_url } for videos
// and reels, and often for photo posts too.
async function fbOEmbed(url: string): Promise<string | null> {
  if (!META_APP_ID || !META_APP_SECRET) return null;
  const token = `${META_APP_ID}|${META_APP_SECRET}`;
  const endpoints = [
    "https://graph.facebook.com/v20.0/oembed_video",
    "https://graph.facebook.com/v20.0/oembed_post",
    "https://graph.facebook.com/v20.0/oembed_page",
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${ep}?url=${encodeURIComponent(url)}&access_token=${token}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.thumbnail_url) return j.thumbnail_url as string;
    } catch { /* try next */ }
  }
  return null;
}

// TikTok has a public, unauthenticated oEmbed endpoint that always returns
// thumbnail_url for any public video URL.
async function tiktokOEmbed(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.thumbnail_url ?? null;
  } catch { return null; }
}

// Instagram Graph oEmbed (requires same META_APP_ID|SECRET).
async function igOEmbed(url: string): Promise<string | null> {
  if (!META_APP_ID || !META_APP_SECRET) return null;
  const token = `${META_APP_ID}|${META_APP_SECRET}`;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${token}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.thumbnail_url ?? null;
  } catch { return null; }
}

function platformFor(url: string): "facebook" | "tiktok" | "instagram" | "other" {
  const u = url.toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.com")) return "facebook";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return "other";
}

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

  // Try platform-native oEmbed first (works even when og:image is blocked).
  const plat = platformFor(url);
  let thumb: string | null = null;
  if (plat === "facebook") thumb = await fbOEmbed(url);
  else if (plat === "tiktok") thumb = await tiktokOEmbed(url);
  else if (plat === "instagram") thumb = await igOEmbed(url);

  // Fallback to og:image scrape.
  if (!thumb) {
    const html = await fetchHtml(url);
    thumb = html ? extractImage(html) : null;
  }

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
