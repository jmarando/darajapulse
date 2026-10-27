import type { MetricSnapshot } from "@/lib/metrics";
import { platformKey, platformLabel } from "@/lib/reportInsights";

export type ChannelRow = {
  key: string;
  label: string;
  posts: number;
  creators: number;
  views: number;
  reach: number;
  followers: number;
  /** This platform's part of the campaign's views, from 0 to 1. */
  share: number;
  /** Some of the reach was filled in from views, because the platform doesn't report it. */
  reachEstimated: boolean;
};

type ChannelPost = { id: string; platform?: string | null; influencer_id?: string | null };
type ChannelCreator = { influencers?: { primary_platform?: string | null; follower_count?: number | null } | null };

/**
 * The campaign's posts by platform, most views first. A creator's followers are counted under
 * their main platform, and only for platforms the campaign has posts on.
 */
export function buildChannelMix(posts: ChannelPost[], metrics: Map<string, MetricSnapshot>, roster: ChannelCreator[]): ChannelRow[] {
  const by = new Map<string, { posts: number; creators: Set<string>; views: number; reach: number; followers: number; reachEstimated: boolean }>();
  for (const p of posts) {
    const m = metrics.get(p.id);
    const key = platformKey(p.platform);
    const cur = by.get(key) ?? { posts: 0, creators: new Set<string>(), views: 0, reach: 0, followers: 0, reachEstimated: false };
    cur.posts += 1;
    if (p.influencer_id) cur.creators.add(p.influencer_id);
    cur.views += Number(m?.views || 0);
    cur.reach += Number(m?.reach || 0);
    if (m?.estimated_fields?.reach) cur.reachEstimated = true;
    by.set(key, cur);
  }
  for (const x of roster) {
    const cur = by.get(platformKey(x.influencers?.primary_platform));
    if (cur) cur.followers += Number(x.influencers?.follower_count || 0);
  }
  const total = [...by.values()].reduce((a, v) => a + v.views, 0);
  return [...by.entries()]
    .map(([key, v]) => ({
      key,
      label: platformLabel(key),
      posts: v.posts,
      creators: v.creators.size,
      views: v.views,
      reach: v.reach,
      followers: v.followers,
      share: total > 0 ? v.views / total : 0,
      reachEstimated: v.reachEstimated,
    }))
    .sort((a, b) => b.views - a.views);
}
