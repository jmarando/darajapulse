// The rules behind Listening's morning view: one verdict for the last day, the figures beside it and the posts
// that need an answer. Pure, with no Deno or app imports, so the page uses it now and the alert emails can use
// the same rules later and never disagree with it. The numbers are starting values; they become per-brand
// settings.

export type Mood = "positive" | "neutral" | "negative";

export type BriefTopic = { id: string; kind: "brand" | "competitor" | "category"; label: string; active?: boolean };

export type BriefMention = {
  id: string;
  topic_id: string;
  source: string;
  url: string;
  title: string | null;
  reach: number | null;
  published_at: string | null;
  found_at: string;
  sentiment: Mood | null;
  theme: string | null;
};

export const MORNING_HOURS = 24;
/** A negative post this seen is worth a look. */
export const WATCH_VIEWS = 5_000;
/** A negative post this seen needs an answer. */
export const ACT_VIEWS = 50_000;
export const NEEDS_YOU_VIEWS = 1_000;
export const NEEDS_YOU_MAX = 3;
/** A rise in negative posts counts from this many in a day, and from this many times the usual day. */
export const SPIKE_MIN = 5;
export const SPIKE_FACTOR = 3;
/** Below this share of the day's posts read, there is not enough to call it clear. */
export const MIN_READ_SHARE = 0.5;

export type VerdictLevel = "act" | "watch" | "clear" | "unsure";
export type NeedsYou = { mention: BriefMention; views: number; move: "Respond" };
export type CategoryRow = { label: string; posts: number; before: number; net: number | null };

export type MorningView = {
  verdict: { level: VerdictLevel; headline: string };
  /** Posts about the brand in the last day and in the day before it. */
  posts: { now: number; before: number };
  /** Positive share of the rated posts about the brand, 0 to 100. */
  mood: { now: number | null; before: number | null };
  /** The brand's share of the brand and its competitors' posts, 0 to 100. */
  share: { now: number | null; before: number | null };
  needsYou: NeedsYou[];
  category: CategoryRow[];
  /** Posts about the brand in the last day that have no mood yet. */
  unread: number;
  /** Platforms whose posts about the brand in the last day report no views at all. */
  noViews: string[];
};

const OFF_TOPIC = "off-topic";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CATEGORY_ROWS = 5;

/** When a post happened: the platform's date, else when it was found. */
const when = (m: BriefMention) => Date.parse(m.published_at ?? m.found_at);

const short = (x: number) => String(Math.round(x * 10) / 10);

/** A view count the short way: 950, 12.3k, 50k, 1.2M. */
export function views(n: number): string {
  if (n >= 999_950) return `${short(n / 1_000_000)}M`;
  if (n >= 1_000) return `${short(n / 1_000)}k`;
  return String(Math.round(n));
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

/** The positive share of the posts that have a mood, or null when none has. */
const positiveShare = (list: BriefMention[]) => {
  const rated = list.filter((m) => m.sentiment);
  return percent(rated.filter((m) => m.sentiment === "positive").length, rated.length);
};

/** Each post once, however many keywords found it; the copy with the most views is kept. */
function once(list: BriefMention[]): BriefMention[] {
  const seen = new Map<string, BriefMention>();
  for (const m of list) {
    const have = seen.get(m.url);
    if (!have || (m.reach ?? -1) > (have.reach ?? -1)) seen.set(m.url, m);
  }
  return [...seen.values()];
}

export function morningView(input: {
  brandName: string;
  topics: BriefTopic[];
  mentions: BriefMention[];
  now: number;
  /** The earliest time the mentions cover, so the week before is only used when it is all there. */
  loadedFrom: number;
}): MorningView {
  const { brandName, topics, mentions, now, loadedFrom } = input;
  const start = now - MORNING_HOURS * HOUR;
  const dayBefore = start - MORNING_HOURS * HOUR;
  const inLastDay = (m: BriefMention) => when(m) >= start && when(m) <= now;
  const inDayBefore = (m: BriefMention) => when(m) >= dayBefore && when(m) < start;

  const relevant = mentions.filter((m) => m.theme !== OFF_TOPIC);
  const idsOf = (kind: BriefTopic["kind"]) => new Set(topics.filter((t) => t.kind === kind).map((t) => t.id));
  const brandIds = idsOf("brand");
  const rivalIds = idsOf("competitor");

  const own = once(relevant.filter((m) => brandIds.has(m.topic_id)));
  const ownNow = own.filter(inLastDay);
  const ownBefore = own.filter(inDayBefore);
  const rivals = relevant.filter((m) => rivalIds.has(m.topic_id));
  const rivalsNow = rivals.filter(inLastDay).length;
  const rivalsBefore = rivals.filter(inDayBefore).length;

  const negativeNow = ownNow.filter((m) => m.sentiment === "negative");
  // A post with no view count is never read as 0 views: it simply cannot be judged on spread.
  const biggest = negativeNow.reduce((most, m) => Math.max(most, m.reach ?? 0), 0);
  const read = ownNow.filter((m) => m.sentiment).length;
  const unread = ownNow.length - read;

  const weekBefore = loadedFrom <= now - 8 * DAY
    ? own.filter((m) => m.sentiment === "negative" && when(m) >= now - 8 * DAY && when(m) < start).length
    : null;
  const usual = weekBefore === null ? null : weekBefore / 7;
  const spike = usual !== null && negativeNow.length >= SPIKE_MIN && negativeNow.length >= SPIKE_FACTOR * Math.max(usual, 1);

  let verdict: MorningView["verdict"];
  if (biggest >= ACT_VIEWS) {
    verdict = { level: "act", headline: `A negative post about ${brandName} has ${views(biggest)} views.` };
  } else if (biggest >= WATCH_VIEWS) {
    verdict = { level: "watch", headline: `A negative post about ${brandName} is picking up: ${views(biggest)} views.` };
  } else if (spike) {
    verdict = {
      level: "watch",
      headline: `${negativeNow.length} negative posts about ${brandName} in the last day, against about ${Math.max(1, Math.round(usual!))} a day last week.`,
    };
  } else if (!ownNow.length) {
    verdict = { level: "unsure", headline: `No posts about ${brandName} in the last ${MORNING_HOURS} hours.` };
  } else if (read / ownNow.length < MIN_READ_SHARE) {
    verdict = { level: "unsure", headline: `${unread} of ${ownNow.length} posts about ${brandName} are still to be read.` };
  } else {
    verdict = {
      level: "clear",
      headline: `Nothing needs you today. ${ownNow.length} ${ownNow.length === 1 ? "post" : "posts"} about ${brandName} in the last day.`,
    };
  }

  const needsYou: NeedsYou[] = negativeNow
    .filter((m) => (m.reach ?? 0) >= NEEDS_YOU_VIEWS)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0) || when(b) - when(a))
    .slice(0, NEEDS_YOU_MAX)
    .map((m) => ({ mention: m, views: m.reach as number, move: "Respond" as const }));

  const reportsViews = new Map<string, boolean>();
  for (const m of ownNow) reportsViews.set(m.source, (reportsViews.get(m.source) ?? false) || m.reach != null);
  const noViews = [...reportsViews].filter(([, reports]) => !reports).map(([source]) => source).sort();

  const category: CategoryRow[] = topics
    .filter((t) => t.kind === "category")
    .map((t) => {
      const list = relevant.filter((m) => m.topic_id === t.id);
      const now_ = list.filter(inLastDay);
      const rated = now_.filter((m) => m.sentiment);
      const good = rated.filter((m) => m.sentiment === "positive").length;
      const bad = rated.filter((m) => m.sentiment === "negative").length;
      return {
        label: t.label,
        posts: now_.length,
        before: list.filter(inDayBefore).length,
        net: rated.length ? Math.round(((good - bad) / rated.length) * 100) || 0 : null,
      };
    })
    .filter((row) => row.posts > 0)
    .sort((a, b) => b.posts - a.posts || a.label.localeCompare(b.label))
    .slice(0, CATEGORY_ROWS);

  return {
    verdict,
    posts: { now: ownNow.length, before: ownBefore.length },
    mood: { now: positiveShare(ownNow), before: positiveShare(ownBefore) },
    share: {
      now: percent(ownNow.length, ownNow.length + rivalsNow),
      before: percent(ownBefore.length, ownBefore.length + rivalsBefore),
    },
    needsYou,
    category,
    unread,
    noViews,
  };
}
