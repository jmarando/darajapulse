import { withMetricFallbacks } from "@/lib/metrics";

export type PublicationRow = {
  post_id: string;
  deliverable_id: string | null;
  deliverable_title: string | null;
  deliverable_status: string | null;
  deliverable_content_type: string | null;
  deliverable_due_date: string | null;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string | null;
  campaign_country: string | null;
  client_id: string | null;
  client_name: string | null;
  influencer_id: string | null;
  influencer_name: string | null;
  influencer_handle: string | null;
  influencer_country: string | null;
  influencer_city: string | null;
  platform: string;
  post_url: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  post_status: string | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  last_synced: string | null;
};

export const normalizeRow = (r: any): PublicationRow => {
  const m = withMetricFallbacks({
    views: r.views, likes: r.likes, comments: r.comments,
    shares: r.shares, saves: r.saves, reach: r.reach, impressions: r.impressions,
  });
  return {
    ...r,
    views: m.views, likes: m.likes, comments: m.comments,
    shares: m.shares, saves: m.saves, reach: m.reach, impressions: m.impressions,
  } as PublicationRow;
};

export type Totals = {
  deliverables: number;
  publications: number;
  creators: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  engagement: number;
  er: number;
};

const blank = (): Totals => ({
  deliverables: 0, publications: 0, creators: 0, views: 0, likes: 0, comments: 0,
  shares: 0, saves: 0, reach: 0, impressions: 0, engagement: 0, er: 0,
});

/** Unique deliverable key — a post with no deliverable counts as its own. */
export const deliverableKey = (r: PublicationRow) => r.deliverable_id || `post:${r.post_id}`;

export const totalsFor = (rows: PublicationRow[]): Totals => {
  const t = blank();
  const dels = new Set<string>();
  const creators = new Set<string>();
  for (const r of rows) {
    t.publications += 1;
    dels.add(deliverableKey(r));
    if (r.influencer_id) creators.add(r.influencer_id);
    t.views += r.views; t.likes += r.likes; t.comments += r.comments;
    t.shares += r.shares; t.saves += r.saves; t.reach += r.reach; t.impressions += r.impressions;
  }
  t.deliverables = dels.size;
  t.creators = creators.size;
  t.engagement = t.likes + t.comments + t.shares + t.saves;
  t.er = t.views > 0 ? (t.engagement / t.views) * 100 : 0;
  return t;
};

export type Group<T = Record<string, unknown>> = Totals & { key: string; label: string; rows: PublicationRow[] } & T;

export const groupBy = (
  rows: PublicationRow[],
  keyOf: (r: PublicationRow) => string,
  labelOf: (r: PublicationRow) => string,
): Group[] => {
  const map = new Map<string, PublicationRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, label: labelOf(list[0]), rows: list, ...totalsFor(list) }))
    .sort((a, b) => b.views - a.views);
};

export const monthKey = (iso?: string | null) => (iso ? iso.slice(0, 7) : "unknown");
export const monthLabel = (key: string) => {
  if (key === "unknown") return "Undated";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export const byPlatform = (rows: PublicationRow[]) =>
  groupBy(rows, (r) => r.platform, (r) => r.platform);

export const byInfluencer = (rows: PublicationRow[]) =>
  groupBy(rows, (r) => r.influencer_id || "unknown", (r) => r.influencer_name || "Unknown creator");

export const byMonth = (rows: PublicationRow[]) =>
  groupBy(rows, (r) => monthKey(r.posted_at), (r) => monthLabel(monthKey(r.posted_at)))
    .sort((a, b) => a.key.localeCompare(b.key));

/** Country of a publication — the creator's, falling back to the campaign market. */
/**
 * Where the creator is based. Deliberately NOT the campaign's target market and
 * never the audience geography — a blank here means "we don't know", not Kenya.
 */
export const rowCountry = (r: PublicationRow) => r.influencer_country || "";

/** True when the creator's country was defaulted or guessed rather than confirmed. */
export const isUnverifiedCountry = (r: PublicationRow) =>
  !!r.influencer_country && r.influencer_country_source !== "verified";

export const byCountry = (rows: PublicationRow[], nameOf: (c: string) => string) =>
  groupBy(rows, (r) => rowCountry(r) || "unknown", (r) => (rowCountry(r) ? nameOf(rowCountry(r)) : "Not specified"));

export const byDeliverable = (rows: PublicationRow[]) =>
  groupBy(rows, deliverableKey, (r) => r.deliverable_title || r.caption?.slice(0, 60) || "Untitled deliverable");

export const platformCounts = (rows: PublicationRow[]) => {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.platform] = (out[r.platform] || 0) + 1;
  return out;
};

export const fmtNum = (n: number) => Math.round(n || 0).toLocaleString();
export const fmtShort = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n || 0)}`;
export const titleCase = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : "");
