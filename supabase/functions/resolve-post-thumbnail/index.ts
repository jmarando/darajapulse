// Fetches a post URL server-side, extracts an og:image / twitter:image /
// video preview, persists it to posts.thumbnail_url for future loads, and
// returns the resolved URL. This is the "once and for all" fallback for
// posts (esp. Facebook) whose thumbnail wasn't populated during metric refresh.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IMAGE_CACHE_SECONDS = 60 * 60 * 6;
const THUMB_BUCKET = "post-thumbnails";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const ED_TOKENS = [
  Deno.env.get("ENSEMBLEDATA_API_TOKEN"),
  Deno.env.get("ENSEMBLE_DATA_API_TOKEN"),
].filter((t): t is string => !!t && t.length > 0);

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

async function ed(path: string, params: Record<string, string>) {
  let lastErr: unknown = null;
  for (const token of ED_TOKENS) {
    try {
      const qs = new URLSearchParams({ ...params, token }).toString();
      const r = await fetch(`https://ensembledata.com/apis${path}?${qs}`, { headers: { "Accept": "application/json" } });
      const text = await r.text();
      const json = JSON.parse(text);
      if (r.ok) return json;
      lastErr = new Error(`Ensemble ${r.status}: ${text.slice(0, 200)}`);
    } catch (error) {
      lastErr = error;
    }
  }
  throw lastErr ?? new Error("Ensemble unavailable");
}

function igShortcode(url: string): string | null {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

async function ensembleThumbnail(url: string): Promise<string | null> {
  if (ED_TOKENS.length === 0) return null;
  const plat = platformFor(url);
  try {
    if (plat === "instagram") {
      const code = igShortcode(url);
      if (!code) return null;
      const j = await ed("/instagram/post/details", { code });
      const data = j?.data ?? j;
      const item = data?.shortcode_media ?? data?.items?.[0] ?? data;
      return item?.display_url ?? item?.thumbnail_url ?? item?.image_versions2?.candidates?.[0]?.url ?? null;
    }
    if (plat === "tiktok") {
      const j = await ed("/tt/post/info", { url });
      const data = j?.data ?? j;
      const item = data?.aweme_detail ?? data?.itemInfo?.itemStruct ?? data?.item ?? data;
      const cover = item?.video?.cover ?? item?.video?.origin_cover ?? data?.cover ?? null;
      return typeof cover === "string" ? cover : cover?.url_list?.[0] ?? null;
    }
    if (plat === "facebook") {
      const j = await ed("/facebook/post/details", { url });
      const data = j?.data ?? j;
      return data?.thumbnail_url ?? data?.image ?? null;
    }
  } catch (error) {
    console.error("Ensemble thumbnail failed:", error instanceof Error ? error.message : String(error));
  }
  return null;
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

function isExpiredSignedThumbnail(src?: string | null): boolean {
  if (!src) return false;
  try {
    const parsed = new URL(decode(src));
    const expires = parsed.searchParams.get("x-expires") || parsed.searchParams.get("expires");
    const instagramExpiry = parsed.searchParams.get("oe");
    const expiry = expires && /^\d+$/.test(expires)
      ? Number(expires)
      : instagramExpiry && /^[0-9a-f]+$/i.test(instagramExpiry)
        ? parseInt(instagramExpiry, 16)
        : null;
    if (!expiry) return false;
    return expiry * 1000 < Date.now() + 6 * 60 * 60 * 1000;
  } catch {
    return false;
  }
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveThumbnail(supabase: ReturnType<typeof createClient>, postId: string | null, providedUrl: string | null) {
  let url = providedUrl;
  let cached: string | null = null;
  if (postId) {
    const { data } = await (supabase.from("posts") as any)
      .select("post_url, thumbnail_url")
      .eq("id", postId)
      .maybeSingle();
    cached = data?.thumbnail_url ?? null;
    url = url ?? data?.post_url ?? null;
  }

  if (cached && !isExpiredSignedThumbnail(cached)) return { url, thumb: cached, cached: true };
  if (!url) return { url: null, thumb: null, cached: false };

  const plat = platformFor(url);
  let thumb: string | null = await ensembleThumbnail(url);
  if (!thumb && plat === "facebook") thumb = await fbOEmbed(url);
  else if (!thumb && plat === "tiktok") thumb = await tiktokOEmbed(url);
  else if (!thumb && plat === "instagram") thumb = await igOEmbed(url);

  if (!thumb) {
    const html = await fetchHtml(url);
    thumb = html ? extractImage(html) : null;
  }

  if (thumb && postId) {
    await (supabase.from("posts") as any)
      .update({ thumbnail_url: thumb })
      .eq("id", postId);
  }

  return { url, thumb, cached: false };
}

function storagePathFromThumbnailUrl(src?: string | null): string | null {
  if (!src) return null;
  try {
    const parsed = new URL(decode(src));
    const marker = `/storage/v1/object/public/${THUMB_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${THUMB_BUCKET}/`;
    const pathname = decodeURIComponent(parsed.pathname);
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex >= 0) return pathname.slice(markerIndex + marker.length);
    const signedMarkerIndex = pathname.indexOf(signedMarker);
    if (signedMarkerIndex >= 0) return pathname.slice(signedMarkerIndex + signedMarker.length);
  } catch { /* not a storage URL */ }
  return null;
}

async function cachedImageResponse(supabase: ReturnType<typeof createClient>, postId: string | null, thumbnailUrl?: string | null) {
  const candidates = [
    storagePathFromThumbnailUrl(thumbnailUrl),
    postId,
    postId ? `${postId}.png` : null,
    postId ? `manual/${postId}.png` : null,
  ].filter((path, index, all): path is string => !!path && all.indexOf(path) === index);

  if (candidates.length === 0) return null;

  try {
    for (const path of candidates) {
      const { data } = await supabase.storage.from(THUMB_BUCKET).download(path);
      if (!data) continue;
      return new Response(data.stream(), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": data.type || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch {
    return null;
  }

  return null;
}

async function imageResponse(src: string, supabase: ReturnType<typeof createClient>, postId: string | null) {
  const attempts = [src];
  try {
    const u = new URL(src);
    attempts.push(`https://images.weserv.nl/?url=${encodeURIComponent(`${u.host}${u.pathname}${u.search}`)}`);
  } catch { /* no proxy candidate */ }

  for (const candidate of attempts) {
    try {
      const res = await fetch(candidate, {
        headers: {
          "User-Agent": UA,
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": "https://www.tiktok.com/",
        },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("Content-Type") || "image/jpeg";
      if (!contentType.toLowerCase().startsWith("image/")) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.byteLength) continue;
      if (postId) {
        await supabase.storage.from(THUMB_BUCKET).upload(`${postId}`, bytes, {
          contentType,
          cacheControl: "31536000",
          upsert: true,
        });
      }
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Cache-Control": `public, max-age=${IMAGE_CACHE_SECONDS}`,
        },
      });
    } catch { /* try next */ }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestUrl = new URL(req.url);
  const wantsImage = requestUrl.searchParams.get("image") === "1";

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const postId: string | null = body.post_id ?? requestUrl.searchParams.get("post_id") ?? null;
  const providedUrl: string | null = body.url ?? requestUrl.searchParams.get("url") ?? null;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const resolved = await resolveThumbnail(supabase, postId, providedUrl);

  if (!resolved.url) {
    return json({ ok: false, error: "missing url or post_id" }, 400);
  }

  if (wantsImage) {
    const cached = await cachedImageResponse(supabase, postId, resolved.thumb);
    if (cached) return cached;
    if (resolved.thumb) {
      const image = await imageResponse(resolved.thumb, supabase, postId);
      if (image) return image;
    }
    return new Response("thumbnail unavailable", { status: 404, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  }

  return json({ ok: !!resolved.thumb, thumbnail_url: resolved.thumb, cached: resolved.cached });
});
