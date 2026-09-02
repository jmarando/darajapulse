// Shared Apify profile fetcher — primary source for public creator stats.
// Ensemble is only used as a fallback in callers.

const APIFY = Deno.env.get("APIFY_API_TOKEN") ?? "";

export const apifyEnabled = () => !!APIFY;

const PROFILE_ACTORS = {
  tiktok: "clockworks~tiktok-scraper",
  instagram: "apify~instagram-profile-scraper",
  facebook: "apify~facebook-pages-scraper",
};

export type ProfileStats = {
  platform: string;
  username?: string;
  followers: number;
  engagement_rate: number; // percent
  posts_sampled: number;
  raw?: any;
};

const num = (v: any) => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0").replace(/[,_]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

export async function runApifyActor(actor: string, input: unknown, timeoutSecs = 120): Promise<any[]> {
  if (!APIFY) throw new Error("APIFY_API_TOKEN not configured");
  const url =
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}&timeout=${timeoutSecs}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${actor} ${r.status}: ${text.slice(0, 300)}`);
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : [];
  } catch {
    throw new Error(`Apify non-JSON: ${text.slice(0, 200)}`);
  }
}

async function tiktokProfile(handle: string): Promise<ProfileStats | null> {
  const items = await runApifyActor(PROFILE_ACTORS.tiktok, {
    profiles: [handle],
    resultsPerPage: 12,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    profileScrapeSections: ["videos"],
  });
  if (!items.length) return null;
  const author = items[0]?.authorMeta ?? items[0]?.author ?? {};
  const followers = num(author.fans ?? author.followers ?? author.followerCount);
  if (!followers) return null;
  const vids = items.filter((i: any) => i?.playCount != null || i?.diggCount != null).slice(0, 12);
  let er = 0;
  if (vids.length) {
    const total = vids.reduce(
      (s: number, v: any) => s + num(v.diggCount) + num(v.commentCount) + num(v.shareCount),
      0,
    );
    er = ((total / vids.length) / followers) * 100;
  }
  return {
    platform: "tiktok",
    username: author.name ?? author.uniqueId ?? handle,
    followers,
    engagement_rate: Number(er.toFixed(2)),
    posts_sampled: vids.length,
    raw: items[0],
  };
}

async function instagramProfile(handle: string): Promise<ProfileStats | null> {
  const items = await runApifyActor(PROFILE_ACTORS.instagram, { usernames: [handle] });
  const p = items[0];
  if (!p) return null;
  const followers = num(p.followersCount ?? p.followers);
  if (!followers) return null;
  const posts: any[] = Array.isArray(p.latestPosts) ? p.latestPosts.slice(0, 12) : [];
  let er = 0;
  if (posts.length) {
    const total = posts.reduce(
      (s: number, x: any) => s + num(x.likesCount) + num(x.commentsCount),
      0,
    );
    er = ((total / posts.length) / followers) * 100;
  }
  return {
    platform: "instagram",
    username: p.username ?? handle,
    followers,
    engagement_rate: Number(er.toFixed(2)),
    posts_sampled: posts.length,
    raw: p,
  };
}

async function facebookProfile(handle: string): Promise<ProfileStats | null> {
  const url = /^https?:\/\//i.test(handle) ? handle : `https://www.facebook.com/${handle}`;
  const items = await runApifyActor(PROFILE_ACTORS.facebook, { startUrls: [{ url }] });
  const p = items[0];
  if (!p) return null;
  const followers = num(p.followers ?? p.followersCount ?? p.likes ?? p.likesCount);
  if (!followers) return null;
  return {
    platform: "facebook",
    username: p.username ?? p.title ?? handle,
    followers,
    engagement_rate: 0,
    posts_sampled: 0,
    raw: p,
  };
}

/** Apify-first public profile stats. Returns null when unsupported or on failure. */
export async function apifyProfileStats(platform: string, handle: string): Promise<ProfileStats | null> {
  if (!APIFY || !handle) return null;
  const p = (platform || "").toLowerCase();
  try {
    if (p === "tiktok") return await tiktokProfile(handle);
    if (p === "instagram") return await instagramProfile(handle);
    if (p === "facebook") return await facebookProfile(handle);
  } catch (e) {
    console.error(`apifyProfileStats ${p} ${handle} failed:`, e instanceof Error ? e.message : String(e));
  }
  return null;
}
