// Canonicalize social post URLs so the same post with different tracking
// params (e.g. _d=..., share_item_id, u_code) is treated as one entry.
export function canonicalPostUrl(raw?: string | null): string {
  if (!raw) return "";
  const url = raw.trim();
  // TikTok: extract numeric video id from any of the common URL shapes.
  const tt = url.match(/tiktok\.com\/.*?(?:\/video\/|\/v\/|share_item_id=)(\d{6,})/i);
  if (tt) return `https://www.tiktok.com/video/${tt[1]}`;
  // Instagram: /p/{shortcode}/ or /reel/{shortcode}/
  const ig = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/`;
  // Strip query/fragment as a last resort
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

export function cleanHandle(s?: string | null): string {
  return (s || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
}
