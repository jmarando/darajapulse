import { buildPeakMetricsByPost, buildWindowMetricsByPost, type MetricSnapshot } from "@/lib/metrics";

export type TrendMetric = "views" | "reach" | "likes" | "comments" | "shares" | "saves" | "engagement";
export type TrendPoint = { d: string; v: number; at: number };
export type TrendResult = { points: TrendPoint[]; firstReadingAt: number | null; postedBeforeReadings: boolean };

const DAY = 86_400_000;
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
const endOfDay = (ms: number) => new Date(ms).setHours(23, 59, 59, 999);
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** One figure of a reading, or likes, comments, shares and saves added together for engagement. */
export function metricValue(m: MetricSnapshot, metric: TrendMetric): number {
  if (metric === "engagement") return Number(m.likes || 0) + Number(m.comments || 0) + Number(m.shares || 0) + Number(m.saves || 0);
  return Number(m[metric] || 0);
}

/**
 * The line behind "Views over time": what the campaign's posts had delivered by the end of
 * each day (or hour, for a one-day window). Social figures only ever grow, so each post counts
 * at its highest reading so far; inside a chosen window it counts what it added since the window began.
 *
 * With no window the line starts at the first reading, not at the first post: before it nothing
 * was measured, and drawing those months as zero would claim the posts had no views.
 */
export function buildTrend({ metrics, postedAt, range, metric, now }: {
  metrics: MetricSnapshot[];
  /** When each post was published, in milliseconds, where known. */
  postedAt: (number | null | undefined)[];
  range?: { from?: Date; to?: Date };
  metric: TrendMetric;
  now: number;
}): TrendResult {
  const sorted = metrics
    .filter((m) => m.captured_at && m.post_id)
    .sort((a, b) => +new Date(a.captured_at!) - +new Date(b.captured_at!));
  if (sorted.length === 0) return { points: [], firstReadingAt: null, postedBeforeReadings: false };

  const firstReadingAt = +new Date(sorted[0].captured_at!);
  const lastReadingAt = +new Date(sorted[sorted.length - 1].captured_at!);
  const posted = postedAt.filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  const postedBeforeReadings = posted.length > 0 && Math.min(...posted) < firstReadingAt - DAY;

  const hasRange = !!(range?.from || range?.to);
  const minDay = range?.from ? startOfDay(+range.from) : startOfDay(firstReadingAt);
  const maxDay = range?.to ? endOfDay(+range.to) : endOfDay(Math.max(lastReadingAt, now));
  const totalDays = Math.max(1, Math.ceil((maxDay - minDay) / DAY));
  const buckets = totalDays <= 1 ? 8 : Math.min(totalDays, 30);
  const span = Math.max(maxDay - minDay, 1);

  const byPost = new Map<string, MetricSnapshot[]>();
  for (const m of sorted) {
    const list = byPost.get(m.post_id as string);
    if (list) list.push(m);
    else byPost.set(m.post_id as string, [m]);
  }

  const points: TrendPoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const t = minDay + (span * (i + 1)) / buckets; // end of the bucket
    let total = 0;
    for (const [postId, rows] of byPost) {
      const reading = hasRange
        ? buildWindowMetricsByPost(rows, minDay, t).get(postId)
        : buildPeakMetricsByPost(rows.filter((m) => +new Date(m.captured_at!) <= t)).get(postId);
      if (reading) total += metricValue(reading, metric);
    }
    const d = totalDays <= 1 ? `${String(new Date(t).getHours()).padStart(2, "0")}:00` : shortDate(t);
    points.push({ d, v: total, at: t });
  }
  return { points, firstReadingAt, postedBeforeReadings };
}
