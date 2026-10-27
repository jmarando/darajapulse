export type PerformerStats = { views: number; likes: number; comments: number; shares: number; saves: number; posts: number };

export type PerformerRow = {
  id: string;
  name: string;
  handle: string;
  posts: number;
  views: number;
  /** Likes, comments, shares and saves. */
  interactions: number;
  /** Interactions as a percentage of views. */
  rate: number;
  likes: number;
  comments: number;
  sharesSaves: number;
  /** This creator's part of the campaign's views, from 0 to 1. */
  share: number;
};

/** A creator on the campaign: the roster row, with the creator's profile joined on. */
export type RosterEntry = {
  id: string;
  influencer_id: string;
  influencers?: { full_name?: string | null; handle?: string | null; follower_count?: number | null } | null;
};

/** The creators who delivered the most views, with what they delivered. Creators with no views are left out. */
export function rankPerformers(roster: RosterEntry[], stats: Map<string, PerformerStats>, totalViews: number, limit = 3): PerformerRow[] {
  const rows: PerformerRow[] = [];
  for (const x of roster) {
    const s = stats.get(x.influencer_id);
    if (!s || !(s.views > 0)) continue;
    const interactions = s.likes + s.comments + s.shares + s.saves;
    rows.push({
      id: x.id,
      name: x.influencers?.full_name ?? "—",
      handle: String(x.influencers?.handle ?? "").replace(/^@/, ""),
      posts: s.posts,
      views: s.views,
      interactions,
      rate: (interactions / s.views) * 100,
      likes: s.likes,
      comments: s.comments,
      sharesSaves: s.shares + s.saves,
      share: totalViews > 0 ? s.views / totalViews : 0,
    });
  }
  return rows.sort((a, b) => b.views - a.views).slice(0, limit);
}
