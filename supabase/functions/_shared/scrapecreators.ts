// ScrapeCreators provider — per-post lookups for TikTok / Instagram / YouTube / Facebook.
// Docs: https://docs.scrapecreators.com  (auth via x-api-key header)
// Failed lookups are not charged; each successful lookup costs 1 credit.

const SC_KEY = Deno.env.get("SCRAPECREATORS_API_KEY") ?? "";
export const SCRAPECREATORS_ENABLED = SC_KEY.length > 0;

const BASE = "https://api.scrapecreators.com";

export type ScrapedPost = {
  stats: Record<string, number | null | undefined>;
  thumb: string | null;
  caption: string | null;
  postedAt: string | null;
  creditsCharged: number;
  creditsRemaining: number | null;
};

function toIso(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v > 1e12 ? v : v * 1000);
    return isNaN(+d) ? null : d.toISOString();
  }
  if (typeof v === "string") {
    if (/^\d{9,13}$/.test(v)) return toIso(Number(v));
    const d = new Date(v);
    return isNaN(+d) ? null : d.toISOString();
  }
  return null;
}

function num(v: any): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function call(path: string, url: string): Promise<any> {
  if (!SC_KEY) throw new Error("SCRAPECREATORS_API_KEY not configured");
  const qs = new URLSearchParams({ url, trim: "true" }).toString();
  const r = await fetch(`${BASE}${path}?${qs}`, { headers: { "x-api-key": SC_KEY, Accept: "application/json" } });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`ScrapeCreators non-JSON [${r.status}]: ${text.slice(0, 200)}`); }
  if (!r.ok || json?.success === false) {
    throw new Error(`ScrapeCreators ${path} ${r.status}: ${String(json?.message ?? json?.error ?? "failed").slice(0, 200)}`);
  }
  return json;
}

// ---- Public profile lookup (bio, business email/phone, avatar, followers) ----
export type ScrapedProfile = {
  raw: any;
  creditsCharged: number;
  creditsRemaining: number | null;
};

const PROFILE_PATHS: Record<string, { path: string; param: string }> = {
  instagram: { path: "/v1/instagram/profile", param: "handle" },
  tiktok: { path: "/v1/tiktok/profile", param: "handle" },
  youtube: { path: "/v1/youtube/channel", param: "handle" },
};

/** Set once the provider reports an empty balance, so a run stops instead of hammering. */
export let SC_OUT_OF_CREDITS = false;

export async function scrapeCreatorsProfile(platform: string, handle: string): Promise<ScrapedProfile | null> {
  const cfg = PROFILE_PATHS[platform];
  if (!cfg || !SC_KEY || !handle || SC_OUT_OF_CREDITS) return null;
  const qs = new URLSearchParams({ [cfg.param]: handle.replace(/^@/, "") }).toString();
  try {
    const r = await fetch(`${BASE}${cfg.path}?${qs}`, { headers: { "x-api-key": SC_KEY, Accept: "application/json" } });
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch { console.error(`SC profile non-JSON ${cfg.path} ${r.status}: ${text.slice(0, 160)}`); return null; }
    if (!r.ok || json?.success === false) {
      if (r.status === 402) SC_OUT_OF_CREDITS = true;
      console.error(`SC profile ${cfg.path} ${r.status}: ${String(json?.message ?? json?.error ?? "failed").slice(0, 160)}`);
      return null; // failed lookups are not charged
    }
    return {
      raw: json,
      creditsCharged: Math.max(1, num(json?.credits_charged) || 1),
      creditsRemaining: json?.credits_remaining != null ? num(json.credits_remaining) : null,
    };
  } catch (e) {
    console.error(`SC profile ${cfg.path} threw:`, (e as Error).message);
    return null;
  }
}


async function tiktok(url: string): Promise<ScrapedPost> {
  const j = await call("/v2/tiktok/video", url);
  const d = j?.aweme_detail ?? {};
  const s = d?.statistics ?? {};
  return {
    stats: {
      views: num(s.play_count),
      likes: num(s.digg_count),
      comments: num(s.comment_count),
      shares: num(s.share_count) + num(s.whatsapp_share_count),
      saves: num(s.collect_count),
    },
    thumb: d?.video?.cover?.url_list?.[0] ?? d?.video?.origin_cover?.url_list?.[0] ?? null,
    caption: d?.desc ?? null,
    postedAt: toIso(d?.create_time ?? d?.createTime),
    creditsCharged: num(j?.credits_charged),
    creditsRemaining: j?.credits_remaining != null ? num(j.credits_remaining) : null,
  };
}

async function instagram(url: string): Promise<ScrapedPost> {
  const j = await call("/v1/instagram/post", url);
  const m = j?.data?.xdt_shortcode_media ?? j?.xdt_shortcode_media ?? {};
  return {
    stats: {
      views: num(m?.video_play_count ?? m?.video_view_count ?? m?.play_count),
      likes: num(m?.edge_media_preview_like?.count ?? m?.like_count),
      comments: num(m?.edge_media_to_parent_comment?.count ?? m?.edge_media_preview_comment?.count ?? m?.comment_count),
    },
    thumb: m?.thumbnail_src ?? m?.display_url ?? null,
    caption: m?.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
    postedAt: toIso(m?.taken_at_timestamp ?? m?.created_at),
    creditsCharged: num(j?.credits_charged),
    creditsRemaining: j?.credits_remaining != null ? num(j.credits_remaining) : null,
  };
}

async function youtube(url: string): Promise<ScrapedPost> {
  const j = await call("/v1/youtube/video", url);
  const v = j?.video ?? j ?? {};
  return {
    stats: {
      views: num(v?.viewCountInt ?? v?.viewCount ?? v?.views),
      likes: num(v?.likeCountInt ?? v?.likeCount ?? v?.likes),
      comments: num(v?.commentCountInt ?? v?.commentCount ?? v?.comments),
    },
    thumb: v?.thumbnail ?? v?.thumbnailUrl ?? v?.thumbnails?.[0]?.url ?? null,
    caption: v?.title ?? null,
    postedAt: toIso(v?.publishedTime ?? v?.publishDate ?? v?.uploadDate),
    creditsCharged: num(j?.credits_charged),
    creditsRemaining: j?.credits_remaining != null ? num(j.credits_remaining) : null,
  };
}

async function facebook(url: string): Promise<ScrapedPost> {
  const j = await call("/v1/facebook/post", url);
  const p = j?.post ?? j?.data ?? j ?? {};
  return {
    stats: {
      views: num(p?.viewCount ?? p?.video_view_count ?? p?.play_count ?? p?.views),
      likes: num(p?.reactionCount ?? p?.likeCount ?? p?.likes ?? p?.reactions),
      comments: num(p?.commentCount ?? p?.comments),
      shares: num(p?.shareCount ?? p?.shares),
    },
    thumb: p?.thumbnailUrl ?? p?.image ?? p?.thumbnail ?? null,
    caption: p?.text ?? p?.message ?? p?.caption ?? null,
    postedAt: toIso(p?.publishTime ?? p?.publishedAt ?? p?.created_time ?? p?.time),
    creditsCharged: num(j?.credits_charged),
    creditsRemaining: j?.credits_remaining != null ? num(j.credits_remaining) : null,
  };
}

export async function scrapeCreatorsPost(platform: "tiktok" | "instagram" | "youtube" | "facebook", url: string): Promise<ScrapedPost> {
  switch (platform) {
    case "tiktok": return await tiktok(url);
    case "instagram": return await instagram(url);
    case "youtube": return await youtube(url);
    case "facebook": return await facebook(url);
  }
}
