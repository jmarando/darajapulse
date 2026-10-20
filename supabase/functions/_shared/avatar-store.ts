// Creator profile photos from Instagram, Facebook and TikTok are signed CDN links
// that stop working within days, so Discovery keeps its own copy in a public bucket.
// Photos from anywhere else are kept as given.

const BUCKET = "creator-avatars";
const EXPIRING_HOSTS = /(cdninstagram\.com|fbcdn\.net|tiktokcdn[\w.-]*\.com|ibyteimg\.com)/i;
const MAX_BYTES = 2_000_000;

export const isExpiringAvatar = (url: string | null | undefined) => !!url && EXPIRING_HOSTS.test(url);

let bucketReady = false;
async function ensureBucket(supabase: any) {
  if (bucketReady) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  // "already exists" is the normal case after the first run.
  if (error && !/exist/i.test(error.message ?? "")) throw error;
  bucketReady = true;
}

/**
 * Returns a lasting URL for a profile photo: our stored copy for expiring social CDN
 * links, the link itself otherwise. If the copy fails, the original link is returned
 * so the photo still shows until it expires (a later backfill retries it).
 * `key` names the stored file, e.g. "instagram/some_handle".
 */
export async function storeAvatar(supabase: any, url: string | null | undefined, key: string): Promise<string | null> {
  if (!url) return null;
  if (!isExpiringAvatar(url)) return url;
  const copy = await copyAvatar(supabase, url, key);
  return copy ?? url;
}

/** Copies the photo into storage; null when the link is dead or isn't an image. */
export async function copyAvatar(supabase: any, url: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;

    await ensureBucket(supabase);
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${key.toLowerCase().replace(/[^a-z0-9/_.-]/g, "_")}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: true, cacheControl: "604800" });
    if (error) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Versioned so a refreshed photo isn't hidden behind the old cached one.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}

/** Finds the profile photo link in a ScrapeCreators profile response. */
export function profilePhotoFrom(raw: unknown): string | null {
  // Largest first: the highest-ranked of these keys found anywhere in the response wins.
  const preference = [
    "profile_pic_url_hd", "hd_profile_pic_url_info", "avatarlarger", "avatar_larger",
    "profile_pic_url", "avatarmedium", "avatar_medium", "avatar",
  ];
  let best = null as { rank: number; url: string } | null;
  const isUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    for (const [k, v] of Object.entries(node)) {
      const rank = preference.indexOf(k.toLowerCase());
      // Values are a link, or { url } / { url_list: [...] } (hd_profile_pic_url_info, avatar_larger).
      const url = isUrl(v) ? v : isUrl((v as any)?.url) ? (v as any).url : isUrl((v as any)?.url_list?.[0]) ? (v as any).url_list[0] : null;
      if (rank >= 0 && url && (!best || rank < best.rank)) best = { rank, url };
      else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(raw, 0);
  return best?.url ?? null;
}
