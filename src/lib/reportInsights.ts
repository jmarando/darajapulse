// Insight layer for campaign reports: how fresh the numbers are, where the
// views came from, and the few plain-language findings worth leading with.
// Pure functions over posts + their metric history so the public report and
// the agency dashboard read the same story.

export type Snapshot = {
  captured_at?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  impressions?: number | null;
};

export type ReportPost = {
  id: string;
  platform?: string | null;
  influencer_id?: string | null;
  creator?: string | null;
  post_url?: string | null;
  posted_at?: string | null;
  created_at?: string | null;
  history: Snapshot[];
};

const H = 3600_000;
const DAY = 24 * H;

// A platform is "fresh" when its typical post was read in the last day and a
// half (the scheduled refresh runs twice a day), "aging" up to four days.
export const FRESH_HOURS = 36;
export const AGING_HOURS = 96;

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  twitter: "X",
  x: "X",
};

export const platformKey = (p?: string | null) => (p || "other").toLowerCase();
export const platformLabel = (p?: string | null) => {
  const k = platformKey(p);
  return PLATFORM_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
};

export const compact = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  const trim = (s: string) => s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  if (n >= 1e9) return `${trim((n / 1e9).toFixed(2))}B`;
  if (n >= 1e6) return `${trim((n / 1e6).toFixed(n >= 1e7 ? 1 : 2))}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${trim((n / 1e3).toFixed(1))}K`;
  return `${Math.round(n)}`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

const ts = (s?: string | null) => (s ? Date.parse(s) : NaN);

/** Highest views reading a post had at or before `atMs`. Platform counters only grow. */
const peakViews = (history: Snapshot[], atMs = Infinity) => {
  let best = 0;
  for (const h of history) {
    const t = ts(h.captured_at);
    if (!Number.isFinite(t) || t > atMs) continue;
    best = Math.max(best, Number(h.views || 0));
  }
  return best;
};

const latestCapture = (history: Snapshot[]) => {
  let best = -Infinity;
  for (const h of history) {
    const t = ts(h.captured_at);
    if (Number.isFinite(t) && t > best) best = t;
  }
  return Number.isFinite(best) ? best : null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const formatAge = (hours: number) => {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
  if (hours < 48) return "yesterday";
  return `${Math.round(hours / 24)} days ago`;
};

const formatDuration = (hours: number) => {
  if (hours < 24) return `${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const d = Math.round(hours / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};

// ── Freshness ────────────────────────────────────────────────────────────

export type FreshnessStatus = "fresh" | "aging" | "stale" | "missing";

export type PlatformFreshness = {
  platform: string;
  label: string;
  posts: number;
  measured: number;
  /** Median of each post's latest reading: when the bulk of this platform was last read. */
  typicalCapturedAt: string | null;
  latestCapturedAt: string | null;
  ageHours: number | null;
  status: FreshnessStatus;
};

export const statusForAge = (ageHours: number | null): FreshnessStatus =>
  ageHours == null ? "missing" : ageHours <= FRESH_HOURS ? "fresh" : ageHours <= AGING_HOURS ? "aging" : "stale";

export function platformFreshness(posts: ReportPost[], now = Date.now()): PlatformFreshness[] {
  const groups = new Map<string, ReportPost[]>();
  for (const p of posts) {
    const k = platformKey(p.platform);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()]
    .map(([platform, list]) => {
      const latest = list.map((p) => latestCapture(p.history)).filter((t): t is number => t != null);
      const typical = latest.length ? median(latest) : null;
      const ageHours = typical == null ? null : Math.max(0, (now - typical) / H);
      return {
        platform,
        label: platformLabel(platform),
        posts: list.length,
        measured: latest.length,
        typicalCapturedAt: typical == null ? null : new Date(typical).toISOString(),
        latestCapturedAt: latest.length ? new Date(Math.max(...latest)).toISOString() : null,
        ageHours,
        status: statusForAge(ageHours),
      };
    })
    .sort((a, b) => b.posts - a.posts);
}

/**
 * One honest line about currency for headers: how many posts were read
 * recently. Quoting only the newest reading would make a mostly stale
 * campaign look live.
 */
export function readingSummary(posts: ReportPost[], now = Date.now()) {
  const latest = posts.map((p) => latestCapture(p.history)).filter((t): t is number => t != null);
  const recent = latest.filter((t) => now - t <= FRESH_HOURS * H).length;
  const total = posts.length;
  const label =
    latest.length === 0 ? "No readings yet"
    : recent === total ? `All posts read in the last ${FRESH_HOURS} hours`
    : `${recent} of ${total} post${total === 1 ? "" : "s"} read in the last ${FRESH_HOURS} hours`;
  return { total, measured: latest.length, recent, label };
}

// ── Totals over time ─────────────────────────────────────────────────────

export const viewsAt = (posts: ReportPost[], atMs: number) =>
  posts.reduce((sum, p) => sum + peakViews(p.history, atMs), 0);

export function periodDelta(posts: ReportPost[], days: number, now = Date.now()) {
  const current = viewsAt(posts, now);
  // A reading taken exactly when the window opens belongs to the window.
  const previous = viewsAt(posts, now - days * DAY - 1);
  const delta = Math.max(0, current - previous);
  return { current, previous, delta, pct: previous > 0 ? delta / previous : 0 };
}

export type WeekPoint = { end: number; label: string; value: number; current: boolean };

/** Running campaign total at the end of each of the last `weeks` weeks, ending now. */
export function weeklyCumulative(posts: ReportPost[], weeks = 12, now = Date.now()): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let k = weeks - 1; k >= 0; k--) {
    const end = now - k * 7 * DAY;
    out.push({
      end,
      label: new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      value: viewsAt(posts, end),
      current: k === 0,
    });
  }
  const first = out.findIndex((w) => w.value > 0);
  return first === -1 ? out.slice(-1) : out.slice(first);
}

// ── Who delivered ────────────────────────────────────────────────────────

export type Contribution = {
  key: string;
  label: string;
  views: number;
  share: number;
  posts: number;
  platforms: Record<string, number>;
};

export function contributions(posts: ReportPost[], now = Date.now()): Contribution[] {
  const rows = new Map<string, Contribution>();
  for (const p of posts) {
    const key = p.influencer_id || p.creator || "unknown";
    const row = rows.get(key) ?? { key, label: p.creator || "Unknown creator", views: 0, share: 0, posts: 0, platforms: {} };
    const v = peakViews(p.history, now);
    const plat = platformKey(p.platform);
    row.views += v;
    row.posts += 1;
    row.platforms[plat] = (row.platforms[plat] ?? 0) + v;
    rows.set(key, row);
  }
  const total = [...rows.values()].reduce((a, r) => a + r.views, 0);
  return [...rows.values()]
    .map((r) => ({ ...r, share: total > 0 ? r.views / total : 0 }))
    .sort((a, b) => b.views - a.views);
}

const mainPlatform = (c: Contribution) =>
  Object.entries(c.platforms).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";

// ── Findings ─────────────────────────────────────────────────────────────

export type Insight = {
  id: "platform" | "creators" | "hit-post" | "momentum";
  kicker: string;
  value: string;
  caption: string;
  headline: string;
  body: string;
  /** How far the finding departs from an even spread; used to rank. */
  strength: number;
};

export function buildInsights(posts: ReportPost[], now = Date.now()): Insight[] {
  const total = viewsAt(posts, now);
  if (total <= 0) return [];
  const out: Insight[] = [];

  // 1. One platform carrying the campaign.
  const plats = new Map<string, { views: number; posts: number }>();
  for (const p of posts) {
    const k = platformKey(p.platform);
    const cur = plats.get(k) ?? { views: 0, posts: 0 };
    cur.views += peakViews(p.history, now);
    cur.posts += 1;
    plats.set(k, cur);
  }
  const ranked = [...plats.entries()].sort((a, b) => b[1].views - a[1].views);
  if (ranked.length >= 2) {
    const [[topKey, top], [secondKey, second]] = ranked;
    const share = top.views / total;
    const postShare = top.posts / posts.length;
    if (share >= 0.5) {
      const perPost = top.views / top.posts;
      const secondPerPost = second.views / Math.max(1, second.posts);
      const ratio = secondPerPost > 0 ? perPost / secondPerPost : 0;
      out.push({
        id: "platform",
        kicker: "Platform",
        value: pct(share),
        caption: "of all views",
        headline: `${platformLabel(topKey)} is carrying the campaign`,
        body:
          `${platformLabel(topKey)} delivered ${pct(share)} of views from ${pct(postShare)} of posts` +
          (ratio >= 1.5 ? `, about ${Math.round(ratio)}× more views per post than ${platformLabel(secondKey)}.` : "."),
        strength: share - postShare,
      });
    }
  }

  // 2. A couple of creators holding most of the reach.
  const creators = contributions(posts, now);
  if (creators.length >= 3) {
    const [a, b] = creators;
    const top2 = a.share + b.share;
    if (top2 >= 0.6) {
      out.push({
        id: "creators",
        kicker: "Creators",
        value: pct(top2),
        caption: `of views from 2 of ${creators.length} creators`,
        headline: `${a.label} and ${b.label} carry the reach`,
        body: `${a.label} alone delivered ${pct(a.share)} of views, mostly on ${platformLabel(mainPlatform(a))}.`,
        strength: top2 - 2 / creators.length,
      });
    }
  }

  // 3. A single post doing an outsized share of the work.
  const measured = posts.filter((p) => peakViews(p.history, now) > 0);
  const best = [...measured].sort((x, y) => peakViews(y.history, now) - peakViews(x.history, now))[0];
  if (best && measured.length >= 3) {
    const v = peakViews(best.history, now);
    const share = v / total;
    if (share >= 0.15) {
      const avg = total / measured.length;
      out.push({
        id: "hit-post",
        kicker: "Standout post",
        value: compact(v),
        caption: "views on one post",
        headline: `One post delivered ${pct(share)} of all views`,
        body:
          `${best.creator || "A creator"}'s ${platformLabel(best.platform)} post has ${compact(v)} views, ` +
          (share > 0.5 ? "more than every other post combined." : `${Math.round(v / avg)}× the campaign average.`),
        strength: share - 1 / measured.length,
      });
    }
  }

  // 4. Recent momentum.
  const week = periodDelta(posts, 7, now);
  if (week.delta > 0) {
    const gains = new Map<string, { label: string; gain: number }>();
    for (const p of posts) {
      const key = p.influencer_id || p.creator || "unknown";
      const g = peakViews(p.history, now) - peakViews(p.history, now - 7 * DAY - 1);
      const cur = gains.get(key) ?? { label: p.creator || "A creator", gain: 0 };
      cur.gain += g;
      gains.set(key, cur);
    }
    const leader = [...gains.values()].sort((x, y) => y.gain - x.gain)[0];
    const shareOfTotal = week.delta / week.current;
    out.push({
      id: "momentum",
      kicker: "Last 7 days",
      value: `+${compact(week.delta)}`,
      caption: "views recorded this week",
      headline: `${compact(week.delta)} new views in the last 7 days`,
      body: `That is ${pct(shareOfTotal)} of the campaign total, led by ${leader.label}.`,
      strength: shareOfTotal * 0.8,
    });
  }

  return out.sort((x, y) => y.strength - x.strength).slice(0, 3);
}

// ── Data notes ───────────────────────────────────────────────────────────

export type DataNote = { tone: "ok" | "warn" | "bad" | "info"; title: string; detail: string };

export function buildDataNotes(opts: {
  posts: ReportPost[];
  now?: number;
  view: "client" | "agency";
  audience?: { measured: number; creators: number };
  campaignStatus?: string | null;
}): DataNote[] {
  const now = opts.now ?? Date.now();
  const notes: DataNote[] = [];

  if (opts.view === "agency" && opts.campaignStatus === "draft") {
    notes.push({
      tone: "bad",
      title: "Scheduled refresh is paused",
      detail: "Draft campaigns are skipped by the twice-daily metrics refresh. Set the campaign to Live to resume it.",
    });
  }

  const freshness = platformFreshness(opts.posts, now);
  for (const f of freshness) {
    const measured = `${f.measured} of ${f.posts} post${f.posts === 1 ? "" : "s"} measured`;
    if (f.status === "missing") {
      notes.push({ tone: "bad", title: `No ${f.label} figures yet`, detail: `None of the ${f.posts} ${f.label} posts has a reading yet.` });
    } else if (f.status === "fresh") {
      notes.push({ tone: "ok", title: `${f.label} figures are current`, detail: `Updated ${formatAge(f.ageHours!)}. ${measured}.` });
    } else {
      const when = new Date(f.typicalCapturedAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      notes.push({
        tone: f.status === "aging" ? "warn" : "bad",
        title: `${f.label} figures are ${formatDuration(f.ageHours!)} old`,
        detail: `Last read on ${when}, so newer views are not counted yet. ${measured}.`,
      });
    }
  }

  const unmeasured = freshness.filter((f) => f.posts > f.measured);
  const missingCount = unmeasured.reduce((a, f) => a + (f.posts - f.measured), 0);
  if (missingCount > 0) {
    const parts = unmeasured.map((f) => `${f.posts - f.measured} on ${f.label}`).join(", ");
    notes.push({
      tone: "warn",
      title: `${missingCount} post${missingCount === 1 ? "" : "s"} not measured yet`,
      detail: `${parts}. They count as zero until a reading comes in.`,
    });
  }

  if (opts.audience && opts.audience.creators > 0 && opts.audience.measured < opts.audience.creators) {
    notes.push({
      tone: "info",
      title: "Audience is estimated",
      detail: `${opts.audience.measured} of ${opts.audience.creators} creators have connected their accounts, so age, gender and city splits are modelled.`,
    });
  }

  return notes;
}
