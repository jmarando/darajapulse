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
  /** The listing's price, only when the house shows prices (get_public_storefront leaves it null otherwise). */
  price_kes?: number | null;
  /** What one price buys, as a noun: "spot", "week", "4 weeks". */
  price_unit?: string | null;
  /** The choices a listing offers (time of day, pack size, station), each with its own price when prices are shown. */
  options?: PriceOption[] | null;
  /** Whether a buyer can book and pay for it online (only when the house shows prices). */
  bookable?: boolean | null;
  /** "cpm": the price is per 1,000 views or listens and the buyer sets a budget. */
  price_model?: "unit" | "cpm" | null;
  /** The least a CPM listing can be booked for. */
  min_spend_kes?: number | null;
  /** What material the listing needs and how its preview is drawn (see AD_FORMATS in storefrontBooking). */
  ad_format?: string | null;
};

/** One choice on a listing. No price means on request, or that the house doesn't show prices. */
export type PriceOption = { label: string; price_kes?: number | null; unit?: string | null };

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
  radio: "On air", tv: "TV", web: "Web", mixed: "Package", print: "Print", podcast: "Podcast", event: "Event",
};
export const platformLabel = (platform?: string | null): string =>
  (platform && PLATFORM_LABEL[platform]) || (platform ? platform[0].toUpperCase() + platform.slice(1) : "Other");

/** What the reach number on a card counts. */
export const reachLabel = (kind?: string | null, platform?: string | null): string =>
  kind === "owned_account" ? "followers" : platform === "radio" ? "listeners a week" : platform === "web" && kind === "ad_slot" ? "visitors a month" : "reach";

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

/** The ways a buyer can spend with a house, in the order the storefront shows them. */
export type WayKey = "packages" | "radio" | "tv" | "web" | "print" | "audio" | "social" | "talent" | "events" | "other";
export const WAYS: { key: WayKey; title: string; blurb: string }[] = [
  { key: "packages", title: "Packages", blurb: "Ready-made plans that mix channels" },
  { key: "radio", title: "Radio", blurb: "Airtime on every station, from one spot to a whole show" },
  { key: "tv", title: "TV", blurb: "Airtime and sponsorships on TV" },
  { key: "web", title: "Websites", blurb: "Banners and sponsored stories" },
  { key: "print", title: "Print", blurb: "Ads in the newspaper" },
  { key: "audio", title: "Podcasts and streaming", blurb: "Audio ads in podcasts, live streams and mixes" },
  { key: "social", title: "Social accounts", blurb: "Posts on the house's own accounts" },
  { key: "talent", title: "Talent", blurb: "Presenters and personalities" },
  { key: "events", title: "Events", blurb: "On the ground, on air and online" },
  { key: "other", title: "More", blurb: "Everything else on offer" },
];

const AD_WAY: Record<string, WayKey> = { radio: "radio", tv: "tv", web: "web", print: "print", podcast: "audio", event: "events" };

/** Which way to buy a listing sits under: packages, social and talent by kind, everything else by its medium. */
export function wayOf(item: Pick<Listing, "kind" | "platform">): WayKey {
  if (item.kind === "bundle") return "packages";
  if (item.kind === "owned_account") return "social";
  if (item.kind === "influencer") return "talent";
  return AD_WAY[item.platform ?? ""] ?? "other";
}

/** "Kiss 100" from "Kiss 100: Spot adverts"; without a colon, the first part of the subtitle, else the title. */
export function propertyOf(item: Pick<Listing, "title" | "subtitle">): string {
  const at = item.title.indexOf(": ");
  if (at > 0) return item.title.slice(0, at);
  return (item.subtitle ?? "").split(" · ")[0].trim() || item.title;
}

/** "Spot adverts" from "Kiss 100: Spot adverts"; the whole title when it names no property. */
export function formatOf(item: Pick<Listing, "title">): string {
  const at = item.title.indexOf(": ");
  return at > 0 ? item.title.slice(at + 2) : item.title;
}

export type GridCell = { itemId: string; option: string; price: number | null };
export type GridRow = { label: string; unit: string | null; cells: (GridCell | null)[] };
export type RateGrid = { format: string; columns: { name: string; item: Listing }[]; rows: GridRow[] };

/**
 * A rate card from listings named "Station: Format" that offer choices: one grid per format, a column per station and a
 * row per choice, as a media house prints it. A format sold by one station only, a listing without choices, and one
 * whose title names no station stay out ("loose") and show as rows of their own.
 */
export function buildRateGrids(items: Listing[]): { grids: RateGrid[]; loose: Listing[] } {
  const byFormat = new Map<string, Listing[]>();
  for (const item of items) {
    if (!item.options?.length || !item.title.includes(": ")) continue;
    const format = formatOf(item);
    const list = byFormat.get(format) ?? [];
    if (!list.some((i) => propertyOf(i) === propertyOf(item))) list.push(item);
    byFormat.set(format, list);
  }
  const grids: RateGrid[] = [];
  const used = new Set<string>();
  for (const [format, list] of byFormat) {
    if (list.length < 2) continue;
    const rows: GridRow[] = [];
    for (const item of list) {
      for (const o of item.options ?? []) {
        if (rows.some((r) => r.label === o.label)) continue;
        rows.push({ label: o.label, unit: o.unit ?? item.price_unit ?? null, cells: [] });
      }
    }
    for (const row of rows) {
      row.cells = list.map((item) => {
        const o = item.options?.find((x) => x.label === row.label);
        return o ? { itemId: item.id, option: o.label, price: typeof o.price_kes === "number" ? o.price_kes : null } : null;
      });
    }
    list.forEach((i) => used.add(i.id));
    grids.push({ format, columns: list.map((item) => ({ name: propertyOf(item), item })), rows });
  }
  return { grids, loose: items.filter((i) => !used.has(i.id)) };
}

/** A station on the rate card: its weekly listeners and picture, from any of its formats. */
export type Station = { name: string; reach: number; cover: string | null };

/** The rate card's stations, each once, in the order their columns first appear. */
export function stationColumns(grids: RateGrid[]): Station[] {
  const byName = new Map<string, Station>();
  for (const grid of grids) {
    for (const { name, item } of grid.columns) {
      const s = byName.get(name) ?? { name, reach: 0, cover: null };
      s.reach = Math.max(s.reach, Number(item.follower_count) || 0);
      s.cover = s.cover ?? item.cover_url ?? null;
      byName.set(name, s);
    }
  }
  return [...byName.values()];
}

/** One station's column of a grid, without the rows it doesn't sell. Null shows every station. */
export function filterGrid(grid: RateGrid, station: string | null): RateGrid {
  if (!station) return grid;
  const at = grid.columns.findIndex((c) => c.name === station);
  if (at < 0) return { ...grid, columns: [], rows: [] };
  return {
    ...grid,
    columns: [grid.columns[at]],
    rows: grid.rows.filter((r) => r.cells[at]).map((r) => ({ ...r, cells: [r.cells[at]] })),
  };
}

/** A way to buy as the page shows it: its listings, a picture, and the price it starts from when prices show. */
export type Section = { key: WayKey; title: string; blurb: string; items: Listing[]; cover: string | null; fromPrice: number | null };

/**
 * What a listing sells for at the least: its cheapest priced choice, else its own price; for one sold per 1,000 views,
 * its minimum spend (its rate per 1,000 isn't something a buyer can buy). Null when on request.
 */
export function lowestPrice(item: Pick<Listing, "options" | "price_kes" | "price_model" | "min_spend_kes">): number | null {
  const prices = (item.options?.length ? item.options.map((o) => o.price_kes) : [item.price_kes])
    .filter((p): p is number => typeof p === "number" && p > 0);
  if (!prices.length) return null;
  if (item.price_model === "cpm") return typeof item.min_spend_kes === "number" && item.min_spend_kes > 0 ? item.min_spend_kes : null;
  return Math.min(...prices);
}

/**
 * The ways to buy that have listings, in the storefront's order. A section starts from the cheapest price among
 * listings sold by a unit; one without a unit (advert production) mixes jingles with sound effects and would mislead.
 * Each section's picture is the first one an earlier section isn't already showing.
 */
export function sectionsOf(items: Listing[], showPrices: boolean): Section[] {
  const used = new Set<string>();
  return WAYS.map((way) => {
    const list = items.filter((i) => wayOf(i) === way.key);
    const prices = showPrices ? list.filter((i) => i.price_unit).map(lowestPrice).filter((p): p is number => p !== null) : [];
    const covers = list.map((i) => i.cover_url).filter((c): c is string => Boolean(c));
    const cover = covers.find((c) => !used.has(c)) ?? covers[0] ?? null;
    if (list.length && cover) used.add(cover);
    return { ...way, items: list, cover, fromPrice: prices.length ? Math.min(...prices) : null };
  }).filter((s) => s.items.length > 0);
}

/** What a listing's subtitle says after the property: "the-star.co.ke, Kenya's news site". */
export const aboutOf = (item: Pick<Listing, "subtitle">): string | null => (item.subtitle ?? "").split(" · ").slice(1).join(" · ").trim() || null;

/**
 * A property's listings under one heading ("The Star online"), or the listings that name no property (name null). The
 * description and picture are the ones every listing in it shares, else null, so one show's details never stand for a
 * whole podcast network.
 */
export type OfferGroup = { key: string; name: string | null; about: string | null; cover: string | null; reach: number; items: Listing[] };

/**
 * Listings named "Property: Format" grouped under their property, with what the property is ("the-star.co.ke, Kenya's
 * news site"), its picture and its biggest reach. Listings without a property stay together, where the first appears.
 */
export function offerGroups(items: Listing[]): OfferGroup[] {
  const groups: OfferGroup[] = [];
  const byKey = new Map<string, OfferGroup>();
  for (const item of items) {
    const name = item.title.includes(": ") ? propertyOf(item) : null;
    const key = name ? `property:${name}` : "loose";
    let group = byKey.get(key);
    if (!group) {
      group = { key, name, about: null, cover: null, reach: 0, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  const shared = (values: (string | null)[]) => (new Set(values).size === 1 ? values[0] : null);
  for (const g of groups) {
    g.about = g.name ? shared(g.items.map(aboutOf)) : null;
    g.cover = shared(g.items.map((i) => i.cover_url ?? null));
    g.reach = Math.max(0, ...g.items.map((i) => Number(i.follower_count) || 0));
  }
  return groups;
}

/** "packages, radio and print". */
export function naturalList(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "9.5 a week", "3 a day": how often an account posts, in the unit that reads naturally. */
export function fmtCadence(perWeek: number | null | undefined): string {
  const n = Number(perWeek);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 14) return `${Math.round(n / 7)} a day`;
  if (n >= 1) return `${n % 1 === 0 ? n : n.toFixed(1)} a week`;
  return `${Math.max(1, Math.round(n * 4.3))} a month`;
}
