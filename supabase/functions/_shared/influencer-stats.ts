// The creator roster's public follower numbers, from ScrapeCreators' profile endpoints, with what they may spend. Pure,
// with the network passed in, so tests can run it without Deno. The balance is shared with campaign metrics, Listening
// and brand channels, and these numbers change slowest, so this job is the first to give way.
import { routeFor, trouble, type ScCall } from "./brand-pull.ts";
import { count, normaliseHandle, type ChannelPlatform, type Raw } from "./brand-sources.ts";
import { nairobiDay } from "./listening-alerts.ts";

const DAY = 86_400_000;
const PLATFORMS = new Set(["tiktok", "instagram", "facebook"]);
/** Followers move slowly, so a fortnight between lookups is enough. */
const PUBLIC_REFRESH_DAYS = 14;
/** ScrapeCreators answers free when it read the profile within this window, so a repeat costs nothing. */
const CACHE_MAX_AGE = "7d";
/** influencers.engagement_rate is numeric(5,2): anything bigger would fail the row's whole update. */
const MAX_RATE = 999.99;
const DEFAULT_DAILY_CREDITS = 40;

/** Below this the job stops. Brand channels stop at 300; campaign metrics and Listening carry on. */
export const CREDIT_FLOOR = 500;
export const LOG_CONTEXT = "influencer_stats";
export const GONE_LOCK_PREFIX = "influencer-gone:";
export const GONE_WAIT_SECONDS = PUBLIC_REFRESH_DAYS * 86_400;

export type RosterRow = { id: string; handle: string | null; primary_platform: string | null; last_metrics_sync: string | null };
export type Target = { platform: ChannelPlatform; handle: string };
export type PublicStats = {
  platform: string;
  username: string;
  followers: number;
  /** Null when this source can't measure it: the stored rate stays. */
  engagement_rate: number | null;
  posts_sampled: number;
  /** When a free cached copy was read. Null for a live answer. */
  measured_at: string | null;
};
export type Lookup =
  | { outcome: "found"; stats: PublicStats; charged: number; balance: number | null }
  | { outcome: "gone" | "failed" | "out_of_credits"; charged: number; balance: number | null };
/** What a run may spend: `allowance` is what's left of today's credits when it starts. */
export type Spend = { allowance: number; used: number; balance: number | null; outOfCredits: boolean };

/** The account a roster row points at, or null when its handle is a name or a link elsewhere. Those stay as they are. */
export function lookupTarget(row: Pick<RosterRow, "handle" | "primary_platform">): Target | null {
  const platform = (row.primary_platform ?? "").toLowerCase();
  if (!PLATFORMS.has(platform) || !row.handle?.trim()) return null;
  const read = normaliseHandle(platform as ChannelPlatform, row.handle);
  return "handle" in read ? { platform: platform as ChannelPlatform, handle: read.handle } : null;
}

/**
 * A handle the provider says is gone waits a fortnight, or dead handles would hold the front of the queue and could
 * spend the whole allowance every day. The wait lives in job_locks under the handle itself, so correcting a creator's
 * handle makes them due at once.
 */
export const goneLockName = (target: Target) => `${GONE_LOCK_PREFIX}${target.platform}:${target.handle}`;

/** Who to look up, in order: creators on a live campaign, then the never refreshed, then the oldest numbers. */
export function pickPublicLookups<R extends RosterRow>(
  rows: R[],
  i: { now: number; waiting: Set<string>; live: Set<string>; explicit: boolean; limit: number },
): R[] {
  const cutoff = i.now - PUBLIC_REFRESH_DAYS * DAY;
  const due = rows.filter((row) => {
    const target = lookupTarget(row);
    if (!target) return false;
    if (i.explicit) return true;
    if (i.waiting.has(goneLockName(target))) return false;
    return !row.last_metrics_sync || Date.parse(row.last_metrics_sync) < cutoff;
  });
  const age = (row: R) => (row.last_metrics_sync ? Date.parse(row.last_metrics_sync) : 0);
  return due
    .sort((a, b) => Number(i.live.has(b.id)) - Number(i.live.has(a.id)) || age(a) - age(b))
    .slice(0, i.limit);
}

const rate = (perPost: number, followers: number): number | null => {
  const value = Number(((perPost / followers) * 100).toFixed(2));
  return value <= MAX_RATE ? value : null;
};

/** TikTok's profile gives lifetime likes and videos: likes per video against followers, as the connected route has it. */
function tiktokEngagement(json: Raw, followers: number) {
  const videos = count(json?.stats?.videoCount);
  const hearts = count(json?.stats?.heartCount);
  if (!videos || hearts === null) return { engagement_rate: null, posts_sampled: 0 };
  return { engagement_rate: rate(hearts / videos, followers), posts_sampled: videos };
}

/** Instagram's profile carries recent posts: likes and comments per post against followers, as the connected route has it. */
function instagramEngagement(json: Raw, followers: number) {
  const edges: Raw[] = json?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];
  const posts = edges
    .map((edge) => edge?.node)
    .filter((post) => post && !post.like_and_view_counts_disabled && count(post.edge_liked_by?.count) !== null);
  if (!posts.length) return { engagement_rate: null, posts_sampled: 0 };
  const total = posts.reduce((sum, post) => sum + (count(post.edge_liked_by?.count) ?? 0) + (count(post.edge_media_to_comment?.count) ?? 0), 0);
  return { engagement_rate: rate(total / posts.length, followers), posts_sampled: posts.length };
}

const cachedAt = (json: Raw): string | null => {
  const when = json?.cached === true ? Date.parse(json?.cached_at) : NaN;
  return Number.isFinite(when) ? new Date(when).toISOString() : null;
};

/** One lookup. A good answer with no charge on it counts as one credit, so the cap can't undercount. */
export async function lookupPublicStats(target: Target, call: ScCall): Promise<Lookup> {
  const route = routeFor(target.platform, target.handle);
  let answer: { status: number; json: Raw };
  try {
    answer = await call(route.profile[0], { ...route.profile[1], cache_max_age: CACHE_MAX_AGE });
  } catch {
    return { outcome: "failed", charged: 0, balance: null };
  }
  const { status, json } = answer;
  const good = status >= 200 && status < 300 && json?.success !== false;
  const charged = typeof json?.credits_charged === "number" ? Math.max(0, json.credits_charged) : good ? 1 : 0;
  const balance = count(json?.credits_remaining);

  const problem = trouble(answer);
  if (problem === "out_of_credits") return { outcome: "out_of_credits", charged, balance };
  if (problem === "failed") return { outcome: "failed", charged, balance };
  // Zero is treated as no number: a placeholder's 0 must not overwrite a real count.
  const followers = problem ? null : route.mapProfile(json).followers;
  if (!followers) return { outcome: "gone", charged, balance };

  const engagement = target.platform === "tiktok" ? tiktokEngagement(json, followers)
    : target.platform === "instagram" ? instagramEngagement(json, followers)
    : { engagement_rate: null, posts_sampled: 0 };
  return {
    outcome: "found",
    charged,
    balance,
    stats: { platform: target.platform, username: target.handle, followers, ...engagement, measured_at: cachedAt(json) },
  };
}

const lookupsAllowed = (spend: Spend, atOnce: number) => {
  if (spend.outOfCredits || (spend.balance !== null && spend.balance < CREDIT_FLOOR)) return 0;
  return Math.max(0, Math.min(atOnce, spend.allowance - spend.used));
};

/**
 * Works through the queue a batch at a time, never starting more lookups than credits left, and hands over each batch
 * as it finishes, so a run that's cut off has already saved and logged what it paid for.
 */
export async function runLookups<R extends RosterRow>(i: {
  queue: R[];
  spend: Spend;
  atOnce: number;
  call: ScCall;
  outOfTime: () => boolean;
  onBatch: (done: { row: R; target: Target; lookup: Lookup }[], charged: number) => Promise<void>;
}): Promise<{ tried: number; skippedForTime: number }> {
  let tried = 0;
  while (tried < i.queue.length) {
    if (i.outOfTime()) return { tried, skippedForTime: i.queue.length - tried };
    const room = lookupsAllowed(i.spend, i.atOnce);
    if (room === 0) break;
    const batch = i.queue.slice(tried, tried + room);
    tried += batch.length;
    const done = await Promise.all(batch.map(async (row) => {
      const target = lookupTarget(row) as Target;
      return { row, target, lookup: await lookupPublicStats(target, i.call) };
    }));
    const charged = done.reduce((sum, { lookup }) => sum + lookup.charged, 0);
    const balances = done.flatMap(({ lookup }) => (lookup.balance === null ? [] : [lookup.balance]));
    i.spend.used += charged;
    if (balances.length) i.spend.balance = Math.min(...balances);
    if (done.some(({ lookup }) => lookup.outcome === "out_of_credits")) i.spend.outOfCredits = true;
    await i.onBatch(done, charged);
  }
  return { tried, skippedForTime: 0 };
}

/** Today's credits for this job. The setting is INFLUENCER_STATS_DAILY_CREDITS; 0 turns lookups off. */
export function dailyCredits(setting: string | undefined): number {
  const n = Number(setting);
  return setting && Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CREDITS;
}

/** The moment today began in Nairobi, when the allowance starts again. */
export const nairobiDayStart = (now: number) => new Date(`${nairobiDay(now)}T00:00:00+03:00`).toISOString();

/** Why creators who were due weren't looked up, for the person who pressed the button. */
export function stopNote(spend: Spend, left: number): string | null {
  if (left <= 0) return null;
  if (spend.outOfCredits) return "ScrapeCreators is out of credits, so the rest wait for a top-up.";
  if (spend.balance !== null && spend.balance < CREDIT_FLOOR) return `Lookups are paused while the ScrapeCreators balance is under ${CREDIT_FLOOR} credits.`;
  if (spend.allowance - spend.used <= 0) return "Today's lookups are used. The rest follow tomorrow.";
  return null;
}
