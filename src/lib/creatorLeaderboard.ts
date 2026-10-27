import { rankPerformers, type PerformerRow, type PerformerStats, type RosterEntry } from "@/lib/topPerformers";

export type LeaderboardRow = PerformerRow & {
  followers: number;
  /** Views divided by the creator's followers: above 1 means the posts reached beyond their own audience. Null without a follower count. */
  reachEfficiency: number | null;
};

/** The creators who delivered the most views, as Top performers ranks them, with how far each reached past their followers. */
export function buildLeaderboard(roster: RosterEntry[], stats: Map<string, PerformerStats>, totalViews: number, limit = 12): LeaderboardRow[] {
  const followersOf = new Map(roster.map((x) => [x.id, Number(x.influencers?.follower_count || 0)]));
  return rankPerformers(roster, stats, totalViews, limit).map((r) => {
    const followers = followersOf.get(r.id) ?? 0;
    return { ...r, followers, reachEfficiency: followers > 0 ? r.views / followers : null };
  });
}
