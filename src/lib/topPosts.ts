import type { MetricSnapshot } from "@/lib/metrics";

export type TopPostRef = {
  id: string;
  post_url?: string | null;
  platform?: string | null;
  thumbnail_url?: string | null;
  caption?: string | null;
  influencers?: { full_name?: string | null; handle?: string | null } | null;
};

export type TopPickKind = "views" | "engagement" | "intent";

export type TopPick<P extends TopPostRef = TopPostRef> = {
  kind: TopPickKind;
  post: P;
  metrics: MetricSnapshot;
  /** Likes, comments, shares and saves. */
  interactions: number;
  /** Interactions as a percentage of views. */
  rate: number;
  /** Saves and shares, the signals of stronger intent. */
  intent: number;
};

/** A post needs this many views before its engagement rate can win: a few likes on a handful of views would top it. */
const MIN_VIEWS_FOR_RATE = 200;

/**
 * Three posts worth showing: the most viewed, the one with the highest engagement rate and the one with the
 * most saves and shares. One post can win more than one. Posts nobody has read yet are left out.
 */
export function pickTopPosts<P extends TopPostRef>(posts: P[], metrics: Map<string, MetricSnapshot>): TopPick<P>[] {
  const all = posts
    .map((post) => {
      const m = metrics.get(post.id) || {};
      const interactions = Number(m.likes || 0) + Number(m.comments || 0) + Number(m.shares || 0) + Number(m.saves || 0);
      const views = Number(m.views || 0);
      return { post, metrics: m as MetricSnapshot, interactions, rate: views ? (interactions / views) * 100 : 0, intent: Number(m.saves || 0) + Number(m.shares || 0) };
    })
    .filter((x) => Number(x.metrics.views || 0) > 0);
  if (all.length === 0) return [];

  const best = (list: typeof all, by: (x: (typeof all)[number]) => number) => [...list].sort((a, b) => by(b) - by(a))[0];
  const established = all.filter((x) => Number(x.metrics.views || 0) >= MIN_VIEWS_FOR_RATE);
  const picks: [TopPickKind, (typeof all)[number]][] = [
    ["views", best(all, (x) => Number(x.metrics.views || 0))],
    ["engagement", best(established.length ? established : all, (x) => x.rate)],
    ["intent", best(all, (x) => x.intent)],
  ];
  return picks.map(([kind, x]) => ({ kind, post: x.post, metrics: x.metrics, interactions: x.interactions, rate: x.rate, intent: x.intent }));
}
