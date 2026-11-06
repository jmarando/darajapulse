// The organic report: from one document of rows (get_brand_report_rows) to what the page, share link, deck and email
// all show. One module, so they cannot disagree. Pure, so the tests run without Deno. A number no source gave stays
// null and reads as a dash, never 0, because a missing number is not a collapse.
import type { Audience } from "./brand-pull.ts";
import { PLATFORM_NAME, type PostFormat, type PostMetrics } from "./brand-sources.ts";
import { views as shortViews } from "./listening-brief.ts";
import { buildCadence, type Cadence } from "./posting-cadence.ts";
import { pickTopPosts, type TopPick } from "./top-posts.ts";

export type ReportSnapshot = PostMetrics & { source: string; captured_at: string; counted_late: boolean };
export type ReportPost = {
  id: string;
  channel_id: string;
  period: "current" | "previous";
  url: string | null;
  posted_at: string;
  format: PostFormat;
  caption: string | null;
  thumbnail_url: string | null;
  snapshot: ReportSnapshot | null;
};
export type ReportChannel = {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  source: "public" | "connected";
  status: string;
  last_good_pull_at: string | null;
  audience: Audience | null;
};
export type ReportDoc = {
  client: { name: string; logo_url: string | null };
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  channels: ReportChannel[];
  days: { channel_id: string; day: string; followers: number | null; source: string }[];
  posts: ReportPost[];
};
export type Tile = { value: number | null; previous: number | null; change: number | null };
export type PlatformRow = {
  channel_id: string;
  platform: string;
  name: string;
  handle: string;
  followers: number | null;
  change: number | null;
  posts: number;
  views: number | null;
  rate: number | null;
  tag: "Connected" | "Public";
};
export type FormatRow = { format: PostFormat; posts: number; avgViews: number | null };
/** A brand post, named so the campaign's top-post card can show it: its channel stands where a creator would. */
export type ReportPostRef = {
  id: string;
  post_url: string | null;
  platform: string;
  thumbnail_url: string | null;
  caption: string | null;
  influencers: { full_name: string; handle: string };
};
export type OrganicReport = {
  isEmpty: boolean;
  tiles: { followers: Tile; posts: Tile; views: Tile; interactions: Tile; rate: Tile };
  platforms: PlatformRow[];
  picks: TopPick<ReportPostRef>[];
  formats: FormatRow[];
  cadence: Cadence;
  connected: { any: boolean; avgReach: number | null; organicViews: number | null; paidViews: number | null; audience: Audience | null };
  sourcesLine: string;
  notes: string[];
};

const platformName = (p: string) => PLATFORM_NAME[p] ?? p;
const NAIROBI_UTC_OFFSET = 3;
const DAY = 86_400_000;
const STALE_DAYS = 2;

const known = (values: (number | null | undefined)[]) => values.filter((v): v is number => v !== null && v !== undefined);
const sumKnown = (values: (number | null | undefined)[]) => {
  const list = known(values);
  return list.length ? list.reduce((a, b) => a + b, 0) : null;
};
const tile = (value: number | null, previous: number | null): Tile => ({
  value,
  previous,
  change: value !== null && previous !== null ? value - previous : null,
});

/** Likes, comments, shares and saves that a source reported. Null when it reported none of them. */
const interactionsOf = (p: ReportPost) => {
  const s = p.snapshot;
  return s ? sumKnown([s.likes, s.comments, s.shares, s.saves]) : null;
};

/**
 * Interactions ÷ views × 100, counting only posts with numbers on both sides of the division. A post with views and no
 * reactions, as Facebook's public reel list gives, would drag the rate down for want of a number nobody reported.
 */
function rateOf(posts: ReportPost[]): number | null {
  const both = posts.filter((p) => (p.snapshot?.views ?? 0) > 0 && interactionsOf(p) !== null);
  if (!both.length) return null;
  const views = both.reduce((sum, p) => sum + (p.snapshot?.views ?? 0), 0);
  return (both.reduce((sum, p) => sum + (interactionsOf(p) ?? 0), 0) / views) * 100;
}

const viewsOf = (posts: ReportPost[]) => sumKnown(posts.map((p) => p.snapshot?.views));
const interactionsTotal = (posts: ReportPost[]) => sumKnown(posts.map(interactionsOf));

/** A channel's followers at the end of the period, and the change since the last line before it. */
function followersOf(doc: ReportDoc, channelId: string): { value: number | null; change: number | null } {
  const lines = doc.days
    .filter((d) => d.channel_id === channelId && d.followers !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  const latestUpTo = (day: string, inclusive: boolean) =>
    [...lines].reverse().find((d) => (inclusive ? d.day <= day : d.day < day))?.followers ?? null;
  const value = latestUpTo(doc.to, true);
  const before = latestUpTo(doc.from, false);
  return { value, change: value !== null && before !== null ? value - before : null };
}

/** A connected channel whose token was rejected is on public numbers until someone reconnects it. */
const onMeta = (c: ReportChannel) => c.source === "connected" && c.status !== "needs_reconnect";

const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

function sourcesLineOf(channels: ReportChannel[]): string {
  const namesOf = (list: ReportChannel[]) => [...new Set(list.map((c) => platformName(c.platform)))];
  const meta = namesOf(channels.filter(onMeta));
  const open = namesOf(channels.filter((c) => !onMeta(c)));
  return [meta.length ? `${listNames(meta)} from Meta.` : "", open.length ? `${listNames(open)} from public numbers.` : ""].filter(Boolean).join(" ");
}

const nairobiLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" });

function notesOf(channels: ReportChannel[], posts: ReportPost[], now: number): string[] {
  const notes: string[] = [];
  const late = posts.map((p) => p.snapshot).filter((s) => s?.counted_late).map((s) => s!.captured_at).sort();
  if (late.length) {
    const on = nairobiLabel(late[late.length - 1]);
    notes.push(`Views for posts before ${on} were counted on ${on}.`);
  }
  for (const c of channels) {
    const name = `${platformName(c.platform)} (@${c.handle})`;
    if (c.status === "needs_reconnect") notes.push(`${name} needs reconnecting. Public numbers are showing until then.`);
    if (c.status === "paused") notes.push(`Public numbers for ${name} are paused.`);
    if (!c.last_good_pull_at) {
      notes.push(`${name} hasn't been read yet.`);
    } else {
      const age = now - Date.parse(c.last_good_pull_at);
      if (age > STALE_DAYS * DAY) notes.push(`${name} was last updated ${Math.floor(age / DAY)} days ago.`);
    }
  }
  return notes;
}

function formatsOf(posts: ReportPost[]): FormatRow[] {
  const groups = new Map<PostFormat, ReportPost[]>();
  for (const p of posts) groups.set(p.format, [...(groups.get(p.format) ?? []), p]);
  const rows = [...groups.entries()].map(([format, list]) => {
    const views = known(list.map((p) => p.snapshot?.views));
    return { format, posts: list.length, avgViews: views.length ? views.reduce((a, b) => a + b, 0) / views.length : null };
  });
  return rows.sort((a, b) => (b.avgViews ?? -1) - (a.avgViews ?? -1));
}

function connectedOf(channels: ReportChannel[], posts: ReportPost[]): OrganicReport["connected"] {
  const onMetaChannels = channels.filter(onMeta);
  const ids = new Set(onMetaChannels.map((c) => c.id));
  const own = posts.filter((p) => ids.has(p.channel_id));
  const reach = known(own.map((p) => p.snapshot?.reach));
  const split = own.filter((p) => p.snapshot?.views_paid !== null && p.snapshot?.views_paid !== undefined && p.snapshot?.views !== null);
  const paid = sumKnown(split.map((p) => p.snapshot?.views_paid));
  return {
    any: onMetaChannels.length > 0,
    avgReach: reach.length ? reach.reduce((a, b) => a + b, 0) / reach.length : null,
    organicViews: split.length ? split.reduce((sum, p) => sum + (p.snapshot!.views! - p.snapshot!.views_paid!), 0) : null,
    paidViews: paid,
    audience: onMetaChannels.find((c) => c.audience)?.audience ?? null,
  };
}

export function buildOrganicReport(doc: ReportDoc, now: number): OrganicReport {
  // A handle that was never found has nothing to report, and staff see why on the card.
  const channels = doc.channels.filter((c) => !(c.status === "error" && !c.last_good_pull_at));
  const byId = new Map(channels.map((c) => [c.id, c]));
  const own = doc.posts.filter((p) => byId.has(p.channel_id));
  const current = own.filter((p) => p.period === "current");
  const previous = own.filter((p) => p.period === "previous");
  const isEmpty = channels.length === 0;

  const followers = channels.map((c) => followersOf(doc, c.id));
  const metrics = new Map(current.flatMap((p) => (p.snapshot ? [[p.id, p.snapshot] as const] : [])));
  const refs = current.map((p): ReportPostRef => {
    const c = byId.get(p.channel_id)!;
    return {
      id: p.id,
      post_url: p.url,
      platform: c.platform,
      thumbnail_url: p.thumbnail_url,
      caption: p.caption,
      influencers: { full_name: c.display_name ?? `@${c.handle}`, handle: c.handle },
    };
  });
  const cadencePosts = current.map((p) => ({ id: p.id, posted_at: p.posted_at }));

  return {
    isEmpty,
    tiles: {
      followers: { value: sumKnown(followers.map((f) => f.value)), previous: null, change: sumKnown(followers.map((f) => f.change)) },
      posts: isEmpty ? tile(null, null) : tile(current.length, previous.length),
      views: tile(viewsOf(current), viewsOf(previous)),
      interactions: tile(interactionsTotal(current), interactionsTotal(previous)),
      rate: tile(rateOf(current), rateOf(previous)),
    },
    platforms: channels.map((c, i) => {
      const list = current.filter((p) => p.channel_id === c.id);
      return {
        channel_id: c.id,
        platform: c.platform,
        name: c.display_name ?? `@${c.handle}`,
        handle: c.handle,
        followers: followers[i].value,
        change: followers[i].change,
        posts: list.length,
        views: viewsOf(list),
        rate: rateOf(list),
        tag: onMeta(c) ? "Connected" : "Public",
      };
    }),
    // "0 saves and shares" or "0.0% engagement" would be a zero for numbers nobody reported.
    picks: pickTopPosts(refs, metrics).filter((p) => {
      const { likes, comments, shares, saves } = p.metrics;
      if (p.kind === "intent") return saves != null || shares != null;
      if (p.kind === "engagement") return likes != null || comments != null || shares != null || saves != null;
      return true;
    }),
    formats: formatsOf(current),
    cadence: buildCadence(cadencePosts, metrics, NAIROBI_UTC_OFFSET),
    connected: connectedOf(channels, current),
    sourcesLine: sourcesLineOf(channels),
    notes: notesOf(channels, current, now),
  };
}

/** The last whole calendar month, in Nairobi time. */
export function lastFullMonth(now: number): { from: string; to: string; label: string } {
  const nairobi = new Date(now + NAIROBI_UTC_OFFSET * 3_600_000);
  const first = new Date(Date.UTC(nairobi.getUTCFullYear(), nairobi.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(nairobi.getUTCFullYear(), nairobi.getUTCMonth(), 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    label: first.toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }),
  };
}

export type MonthlyEmailData = {
  skip: boolean;
  subject: string;
  brand_name: string;
  month_label: string;
  tiles: { label: string; value: string; change: string | null }[];
  top_post: { title: string; platform: string; views: string; url: string } | null;
  notes: string[];
  sources_line: string;
};

const signedText = (v: number | null, show: (n: number) => string) => (v === null ? null : `${v > 0 ? "+" : v < 0 ? "-" : ""}${show(Math.abs(v))}`);
const percentText = (n: number) => `${n.toFixed(1)}%`;

/** What the monthly email says. Nothing to say (no channels, or no numbers for the month) means nothing is sent. */
export function monthlyEmailData(report: OrganicReport, ctx: { brandName: string; monthLabel: string }): MonthlyEmailData {
  const { followers, posts, views, interactions, rate } = report.tiles;
  const line = (label: string, tile: Tile, show: (n: number) => string) => ({ label, value: tile.value === null ? "—" : show(tile.value), change: signedText(tile.change, show) });
  const count = posts.value ?? 0;
  const postsWord = `${count} ${count === 1 ? "post" : "posts"}`;
  const top = report.picks.find((p) => p.kind === "views");
  return {
    skip: report.isEmpty || (followers.value === null && count === 0),
    subject: `${ctx.brandName} in ${ctx.monthLabel}: ${views.value === null ? postsWord : `${shortViews(views.value)} views on ${postsWord}`}`,
    brand_name: ctx.brandName,
    month_label: ctx.monthLabel,
    tiles: [
      line("Followers", followers, shortViews),
      line("Posts", posts, (n) => String(n)),
      line("Views", views, shortViews),
      line("Interactions", interactions, shortViews),
      line("Engagement rate", rate, percentText),
    ],
    top_post: top
      ? { title: top.post.caption?.trim().slice(0, 80) || "A post", platform: platformName(top.post.platform), views: shortViews(Number(top.metrics.views)), url: top.post.post_url ?? "" }
      : null,
    notes: report.notes,
    sources_line: report.sourcesLine,
  };
}
