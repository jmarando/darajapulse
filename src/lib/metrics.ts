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

export const withMetricFallbacks = (row: MetricSnapshot = {}) => {
  const views = Math.max(0, Number(row.views || 0));
  const likes = Math.max(0, Number(row.likes || 0));
  const comments = Math.max(0, Number(row.comments || 0));
  const rawShares = Math.max(0, Number(row.shares || 0));
  const rawSaves = Math.max(0, Number(row.saves || 0));
  const rawReach = Math.max(0, Number(row.reach || 0));
  const rawImpressions = Math.max(0, Number(row.impressions || 0));
  const estimated: Record<string, boolean> = {};

  const shares = rawShares || (views > 0 ? Math.round(Math.max(views * 0.0025, likes * 0.06, comments * 1.2)) : 0);
  const saves = rawSaves || (views > 0 ? Math.round(Math.max(views * 0.0035, likes * 0.08, comments * 1.5)) : 0);
  const reach = rawReach || (views > 0 ? Math.round(views * 0.68) : 0);
  const impressions = rawImpressions || Math.max(views, reach);

  if (!rawShares && shares) estimated.shares = true;
  if (!rawSaves && saves) estimated.saves = true;
  if (!rawReach && reach) estimated.reach = true;
  if (!rawImpressions && impressions) estimated.impressions = true;

  return { ...row, views, likes, comments, shares, saves, reach, impressions, estimated_fields: estimated };
};

export const peakMetricSnapshot = (rows: MetricSnapshot[] = []) => {
  const peak: MetricSnapshot = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 };
  for (const row of rows) {
    const normalized = withMetricFallbacks(row);
    for (const key of METRIC_KEYS) peak[key] = Math.max(Number(peak[key] || 0), Number(normalized?.[key] || 0));
    if (!peak.captured_at || (row.captured_at && new Date(row.captured_at) > new Date(peak.captured_at))) peak.captured_at = row.captured_at;
  }
  return withMetricFallbacks(peak);
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

export const fetchAllPostMetrics = async (client: any, postIds: string[], columns = "*") => {
  const rows: MetricSnapshot[] = [];
  for (let i = 0; i < postIds.length; i += 100) {
    const ids = postIds.slice(i, i + 100);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client
        .from("post_metrics")
        .select(columns)
        .in("post_id", ids)
        .order("captured_at", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
};