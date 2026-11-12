// Storefront account reads use the same paid key and profile mappings as the roster.
import { lookupPublicStats } from "./influencer-stats.ts";
import { count, normaliseHandle, type ChannelPlatform } from "./brand-sources.ts";
import { trouble, type ScCall } from "./brand-pull.ts";

export function inventoryTarget(platform: string, input: string): { platform: string; handle: string } | null {
  const p = platform.toLowerCase() === "x" ? "twitter" : platform.toLowerCase();
  if (["instagram", "tiktok", "facebook"].includes(p)) {
    const found = normaliseHandle(p as ChannelPlatform, input);
    return "handle" in found ? { platform: p, handle: found.handle } : null;
  }
  if (!["youtube", "twitter"].includes(p)) return null;
  let handle = input.trim().replace(/^@+/, "");
  if (/^(https?:\/\/|www\.)/i.test(handle)) {
    try {
      const url = new URL(/^https?:\/\//i.test(handle) ? handle : `https://${handle}`);
      const host = url.hostname.replace(/^www\./, "");
      if (p === "twitter" && !["twitter.com", "x.com"].includes(host)) return null;
      if (p === "youtube" && host !== "youtube.com") return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (p === "youtube" && ["watch", "shorts", "playlist", "live"].includes(parts[0])) return null;
      if (p === "youtube" && parts[0] === "channel" && parts.length === 2) handle = parts[1];
      else if (parts.length === 1) handle = parts[0].replace(/^@/, "");
      else return null;
    } catch { return null; }
  }
  return /^[a-zA-Z0-9._-]{1,100}$/.test(handle) ? { platform: p, handle } : null;
}

export async function inventoryStats(platform: string, handle: string, call: ScCall) {
  const target = inventoryTarget(platform, handle);
  if (!target) return { outcome: "invalid_account", charged: 0, balance: null } as const;
  if (["instagram", "tiktok", "facebook"].includes(target.platform)) {
    // A requested storefront refresh asks for fresh figures, not a seven-day cached copy.
    return lookupPublicStats({ platform: target.platform as ChannelPlatform, handle: target.handle }, (path, params) => {
      const { cache_max_age: _cache, ...fresh } = params;
      return call(path, fresh);
    });
  }
  try {
    const answer = await call(target.platform === "youtube" ? "/v1/youtube/channel" : "/v1/twitter/profile",
      target.platform === "youtube" ? { handle: target.handle } : { screen_name: target.handle });
    const problem = trouble(answer);
    const charged = typeof answer.json?.credits_charged === "number" ? Math.max(0, answer.json.credits_charged) : problem ? 0 : 1;
    const balance = count(answer.json?.credits_remaining);
    if (problem) return { outcome: problem, charged, balance };
    const j = answer.json;
    const raw = target.platform === "youtube" ? j?.subscriberCountInt ?? j?.subscriberCount
      : j?.legacy?.followers_count ?? j?.followers_count ?? j?.user?.legacy?.followers_count;
    const followers = count(raw);
    if (followers === null || followers === 0) return { outcome: "no_data", charged, balance };
    return { outcome: "found", charged, balance, stats: { followers, engagement_rate: null } };
  } catch { return { outcome: "failed", charged: 0, balance: null }; }
}