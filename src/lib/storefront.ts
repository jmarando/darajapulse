/** A storefront listing as get_public_storefront returns it. */
export type Listing = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  platform?: string | null;
  handle?: string | null;
  cover_url?: string | null;
  follower_count?: number | null;
  engagement_rate?: number | null;
  audience_demo?: Record<string, unknown> | null;
  demo_source?: string | null;
  deliverable_type?: string | null;
  turnaround_days?: number | null;
  revisions?: number | null;
  tags?: string[] | null;
  /** What the account's latest public posts say, when they've been read. The posts themselves load on opening. */
  insights_summary?: InsightsSummary | null;
};

/** The summary inventory-insights saves for an account (see supabase/functions/_shared/channel-insights.ts). */
export type InsightsSummary = {
  posts: number;
  posts_per_week: number | null;
  median_views: number | null;
  median_interactions: number | null;
  engagement_rate: number | null;
  engagement_basis: "views" | "followers" | null;
  latest_post_at: string | null;
};

export type InsightPost = {
  url: string | null; posted_at: string; format: string;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; interactions: number | null;
  caption: string | null; thumbnail_url: string | null;
};

/** One account's full reading, as get_public_listing_insights returns it. */
export type ChannelInsights = {
  read_at: string;
  account: { name: string | null; followers: number | null; avatar_url: string | null };
  summary: InsightsSummary;
  recent: InsightPost[];
  top: InsightPost[];
};

/** The platforms whose posts the storefront can read: a listing elsewhere has no recent-posts section. */
export const READABLE_PLATFORMS = ["tiktok", "instagram", "facebook", "youtube"];

/** What the storefront's request form collects. */
export type RequestForm = {
  contact_name: string; contact_email: string; contact_phone: string; company: string;
  budget_kes: string; target_start: string; target_end: string; message: string;
};
export const EMPTY_REQUEST: RequestForm = {
  contact_name: "", contact_email: "", contact_phone: "", company: "", budget_kes: "", target_start: "", target_end: "", message: "",
};

/** One pick from the brief matcher (storefront-match). */
export type PlanMatch = { item_id: string; score: number; reason: string; angle?: string };

/** A listing's engagement rate for its card: a percentage when the platform gave one, a dash when nobody knows it. */
export const fmtEngagement = (rate: unknown): string => {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(1)}%` : "—";
};

/** 2.2M, 931.6K, 440: how storefront numbers are written. */
export const fmtCompact = (value: unknown): string => {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

export const KIND_LABEL: Record<string, string> = { owned_account: "Owned channel", influencer: "Talent", ad_slot: "Ad slot", bundle: "Package" };

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", twitter: "X", facebook: "Facebook",
  radio: "On air", tv: "TV", web: "Print & web", mixed: "Package",
};
export const platformLabel = (platform?: string | null): string =>
  (platform && PLATFORM_LABEL[platform]) || (platform ? platform[0].toUpperCase() + platform.slice(1) : "Other");

/** What the reach number on a card counts. */
export const reachLabel = (kind?: string | null, platform?: string | null): string =>
  kind === "owned_account" ? "followers" : platform === "radio" ? "listeners a week" : "reach";

/** Where to aim a cover photo: people's faces sit high in their portraits. */
export const coverPosition = (kind?: string | null): string => (kind === "influencer" ? "50% 18%" : "50% 50%");

/** The live profile behind a listing, for people who want to see the account itself. Null when the handle isn't one. */
export function profileUrl(platform?: string | null, handle?: string | null): string | null {
  const raw = (handle ?? "").trim();
  if (!raw || /\s/.test(raw)) return null;
  const h = raw.replace(/^@/, "").replace(/^\//, "");
  if (!/^[A-Za-z0-9._-]+$/.test(h)) return null;
  switch (platform) {
    case "instagram": return `https://www.instagram.com/${h}/`;
    case "tiktok": return `https://www.tiktok.com/@${h}`;
    case "facebook": return `https://www.facebook.com/${h}`;
    case "twitter": return `https://x.com/${h}`;
    case "youtube": return `https://www.youtube.com/@${h}`;
    default: return null;
  }
}

const NOTE = /^(reach is|followers as at|followers refreshed)/i;

/** A listing's detail: what a buyer gets (one line each), and any note on where its numbers come from. */
export function whatYouGet(item: { kind?: string | null; deliverable_type?: string | null; description?: string | null }): { lines: string[]; note: string | null } {
  const parts = (item.description ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const notes = parts.filter((l) => NOTE.test(l));
  const lines = parts.filter((l) => !NOTE.test(l));
  const deliverable = (item.deliverable_type ?? "").trim();
  if (deliverable && item.kind !== "bundle" && !lines.some((l) => l.toLowerCase().includes(deliverable.toLowerCase()))) lines.unshift(deliverable);
  return { lines, note: notes.length ? notes.join(" ") : null };
}

/** Combined reach of a set of listings, counting each account or station once. */
export function combinedReach(items: { follower_count?: number | null; kind?: string | null; title?: string | null; subtitle?: string | null }[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const i of items) {
    const n = Number(i.follower_count) || 0;
    if (!n) continue;
    // On-air formats of one station share one audience: count it once.
    const key = i.kind === "ad_slot" ? `station:${(i.subtitle ?? "").split(" · ")[0]}` : `item:${i.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += n;
  }
  return total;
}

/** A storefront card: one listing, or the accounts of one station or person shown together. Cart and plan stay per listing. */
export type ListingGroup = { key: string; name: string; lead: Listing; items: Listing[]; cover: string | null };

const PLATFORM_SUFFIX = /\s+(?:on|—|–|-)\s+(?:facebook|instagram|tiktok|youtube|x|twitter)$/i;

/** "Kiss 100 on Instagram" and "Jeff Kuria — TikTok" name the station or person, Kiss 100 and Jeff Kuria. */
export const baseName = (title: string): string => title.replace(PLATFORM_SUFFIX, "").trim() || title;

/**
 * Social accounts and talent of the same name become one card, so a station on five platforms shows once. Other
 * listings stay one card each. Cards keep the order of first appearance; inside a card the accounts run biggest first
 * and the biggest leads, so the order doesn't depend on how the rows arrive.
 */
export function groupListings(items: Listing[]): ListingGroup[] {
  const groups: ListingGroup[] = [];
  const byKey = new Map<string, ListingGroup>();
  for (const item of items) {
    const joins = item.kind === "owned_account" || item.kind === "influencer";
    const name = joins ? baseName(item.title) : item.title;
    const key = joins ? `${item.kind}:${name.toLowerCase()}` : `item:${item.id}`;
    const found = byKey.get(key);
    if (found) { found.items.push(item); continue; }
    const group = { key, name, lead: item, items: [item], cover: null };
    byKey.set(key, group);
    groups.push(group);
  }
  for (const g of groups) {
    g.items.sort((a, b) => (Number(b.follower_count) || 0) - (Number(a.follower_count) || 0));
    g.lead = g.items[0];
    g.cover = g.lead.cover_url ?? g.items.find((i) => i.cover_url)?.cover_url ?? null;
  }
  return groups;
}

/** A group's following: each account's followers added up. */
export const groupReach = (g: ListingGroup): number => g.items.reduce((sum, i) => sum + (Number(i.follower_count) || 0), 0);

/** The most a typical post gets on any of a group's accounts, or null when none has been read. */
export function bestTypicalViews(items: Listing[]): number | null {
  const views = items.map((i) => i.insights_summary?.median_views).filter((v): v is number => typeof v === "number" && v > 0);
  return views.length ? Math.max(...views) : null;
}

/** "9.5 a week", "3 a day": how often an account posts, in the unit that reads naturally. */
export function fmtCadence(perWeek: number | null | undefined): string {
  const n = Number(perWeek);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 14) return `${Math.round(n / 7)} a day`;
  if (n >= 1) return `${n % 1 === 0 ? n : n.toFixed(1)} a week`;
  return `${Math.max(1, Math.round(n * 4.3))} a month`;
}
