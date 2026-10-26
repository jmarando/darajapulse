import type { TrendMetric } from "@/lib/campaignTrend";
import type { MetricSnapshot } from "@/lib/metrics";
import { compact } from "@/lib/reportInsights";

export type MetricTile = {
  key: TrendMetric;
  label: string;
  value: string;
  /** False until the numbers load, and for shares, saves and reach while nothing has been reported. */
  available: boolean;
  /** True when some of the figure was filled in from views and likes. */
  estimated: boolean;
};
export type TileTotals = { views: number; likes: number; comments: number; shares: number; saves: number; reach: number; er: number };
export type Estimated = { shares: boolean; saves: boolean; reach: boolean };

/** Which of shares, saves and reach were filled in, rather than reported, for any post. */
export function estimatedMetrics(rows: Iterable<MetricSnapshot>): Estimated {
  const out: Estimated = { shares: false, saves: false, reach: false };
  for (const m of rows) {
    const e = m.estimated_fields as Partial<Estimated> | undefined;
    if (e?.shares) out.shares = true;
    if (e?.saves) out.saves = true;
    if (e?.reach) out.reach = true;
  }
  return out;
}

/** The figures shown above the chart, in order. Engagement adds shares and saves, so it is estimated when they are. */
export function buildMetricTiles(totals: TileTotals, loaded: boolean, estimated: Estimated): MetricTile[] {
  const tile = (key: TrendMetric, label: string, shown: string, reported = true, estimate = false): MetricTile => ({
    key,
    label,
    value: loaded ? shown : "—",
    available: loaded && reported,
    estimated: loaded && reported && estimate,
  });
  return [
    tile("views", "Views", compact(totals.views)),
    tile("likes", "Likes", compact(totals.likes)),
    tile("comments", "Comments", compact(totals.comments)),
    tile("engagement", "Engagement", `${totals.er.toFixed(1)}%`, true, estimated.shares || estimated.saves),
    tile("shares", "Shares", compact(totals.shares), totals.shares > 0, estimated.shares),
    tile("saves", "Saves", compact(totals.saves), totals.saves > 0, estimated.saves),
    tile("reach", "Reach", compact(totals.reach), totals.reach > 0, estimated.reach),
  ];
}
