export type MetricSnapshot = {
  post_id?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  impressions?: number | null;
  captured_at?: string | null;
  [key: string]: any;
};

const METRIC_KEYS = ["views", "likes", "comments", "shares", "saves", "reach", "impressions"] as const;

export const peakMetricSnapshot = (rows: MetricSnapshot[] = []) => {
  const peak: MetricSnapshot = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
  for (const row of rows) {
    for (const key of METRIC_KEYS) peak[key] = Math.max(Number(peak[key] || 0), Number(row?.[key] || 0));
    if (!peak.captured_at || (row.captured_at && new Date(row.captured_at) > new Date(peak.captured_at))) peak.captured_at = row.captured_at;
  }
  return peak;
};

export const buildPeakMetricsByPost = (rows: MetricSnapshot[] = []) => {
  const grouped = new Map<string, MetricSnapshot[]>();
  for (const row of rows) {
    if (!row.post_id) continue;
    grouped.set(row.post_id, [...(grouped.get(row.post_id) ?? []), row]);
  }
  const peaks = new Map<string, MetricSnapshot>();
  for (const [postId, list] of grouped) peaks.set(postId, { post_id: postId, ...peakMetricSnapshot(list) });
  return peaks;
};