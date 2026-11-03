// Brand channels: what a handle is, when a channel is read and how far back. Pure, so tests can run it without Deno.

export type ChannelPlatform = "facebook" | "instagram" | "tiktok";
export type PullMode = "first" | "deep" | "nightly";

/** How many days back a pull reads: the first pull goes furthest for history, Sundays re-measure older posts. */
export const WINDOW_DAYS: Record<PullMode, number> = { first: 90, deep: 120, nightly: 45 };

/** The most pages of posts one pull may read. ScrapeCreators returns 3 Facebook posts a page, so those caps are higher. */
export const PUBLIC_PAGE_CAPS: Record<ChannelPlatform, Record<PullMode, number>> = {
  tiktok: { first: 6, deep: 5, nightly: 2 },
  instagram: { first: 8, deep: 6, nightly: 2 },
  facebook: { first: 30, deep: 15, nightly: 5 },
};
export const FACEBOOK_REEL_PAGES: Record<PullMode, number> = { first: 3, deep: 2, nightly: 1 };

/** Calls per agency per Nairobi day. Provisional: reset once the pilot has measured what a handle really costs. */
export const PUBLIC_PULL_DAILY_CAP = 300;
/** Public pulls stop below this balance, because campaign metrics and Listening spend from the same account. */
export const SC_CREDIT_FLOOR = 300;

const HOUR = 3_600_000;
const NAIROBI_OFFSET = 3 * HOUR;
const DUE_AFTER = 20 * HOUR;

const PLATFORM_NAME: Record<ChannelPlatform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const HOSTS: [ChannelPlatform, RegExp][] = [
  ["facebook", /(^|\.)(facebook\.com|fb\.com)$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
];
const LOOKS_LIKE_LINK = /^(https?:\/\/|(www\.|m\.|web\.)?(facebook|fb|instagram|tiktok)\.com(\/|$))/i;
const HANDLE = /^[a-z0-9._-]{1,100}$/;
const POST_LINK = "That's a link to a post. Paste the account's handle or the link to its page.";

const INSTAGRAM_POST_PATHS = new Set(["p", "reel", "reels", "tv", "stories", "explore"]);
const FACEBOOK_POST_PATHS = new Set(["share", "watch", "groups", "reel", "photo", "permalink.php", "story.php", "events"]);
const FACEBOOK_PAGE_POST_TABS = new Set(["videos", "photos", "reels", "reel"]);

/** What a link's path says the handle is, or that it is a link to a post. */
function handleFromPath(platform: ChannelPlatform, url: URL): string | { error: string } {
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  if (platform === "tiktok") {
    if (!first.startsWith("@") || parts.length > 1) return { error: POST_LINK };
    return first.slice(1);
  }
  if (platform === "instagram") {
    if (INSTAGRAM_POST_PATHS.has(first.toLowerCase()) || INSTAGRAM_POST_PATHS.has((parts[1] ?? "").toLowerCase())) return { error: POST_LINK };
    return first;
  }
  if (first === "profile.php") return url.searchParams.get("id") ?? "";
  if (first === "people" || first === "pages") return parts[parts.length - 1] ?? "";
  if (FACEBOOK_POST_PATHS.has(first.toLowerCase())) return { error: POST_LINK };
  if (parts[1] === "posts" || (parts.length >= 3 && FACEBOOK_PAGE_POST_TABS.has(parts[1]))) return { error: POST_LINK };
  return first;
}

/** What a person typed or pasted, as the handle we store: lowercase, no "@". Refuses what can't be an account, in plain words. */
export function normaliseHandle(platform: ChannelPlatform, input: string): { handle: string } | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Type the account's handle or paste the link to its page." };
  let candidate = raw;
  if (LOOKS_LIKE_LINK.test(raw)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { error: "That link doesn't look right. Paste the account's handle instead." };
    }
    const host = url.hostname.toLowerCase();
    const owner = HOSTS.find(([, re]) => re.test(host))?.[0];
    if (!owner) return { error: `That isn't a ${PLATFORM_NAME[platform]} link. Paste the account's handle instead.` };
    if (owner !== platform) return { error: `That looks like a ${PLATFORM_NAME[owner]} link. Choose ${PLATFORM_NAME[owner]}, or paste the ${PLATFORM_NAME[platform]} account.` };
    const found = handleFromPath(platform, url);
    if (typeof found !== "string") return found;
    candidate = found;
  }
  const handle = candidate.replace(/^@+/, "").toLowerCase();
  if (!HANDLE.test(handle)) return { error: "That doesn't look like a handle. Use letters, numbers, dots, dashes and underscores." };
  return { handle };
}

/** The address ScrapeCreators needs for a Facebook page: a page with no username goes by its id. */
export function facebookPageUrl(handle: string): string {
  return /^\d+$/.test(handle) ? `https://www.facebook.com/profile.php?id=${handle}` : `https://www.facebook.com/${handle}`;
}

/** A handle that has never been found stays out of the nightly run until someone fixes it. */
export function channelIsDue(c: { last_pull_at: string | null; last_good_pull_at: string | null; status: string }, now: number): boolean {
  if (c.status === "error" && !c.last_good_pull_at) return false;
  if (!c.last_pull_at) return true;
  return now - Date.parse(c.last_pull_at) >= DUE_AFTER;
}

export function pullMode(c: { last_good_pull_at: string | null }, now: number): PullMode {
  if (!c.last_good_pull_at) return "first";
  return new Date(now + NAIROBI_OFFSET).getUTCDay() === 0 ? "deep" : "nightly";
}

/** The profile, the post pages and, on Facebook, the reel pages. Reserved from the daily allowance before a pull starts. */
export function maxPublicCalls(platform: ChannelPlatform, mode: PullMode): number {
  return 1 + PUBLIC_PAGE_CAPS[platform][mode] + (platform === "facebook" ? FACEBOOK_REEL_PAGES[mode] : 0);
}

/**
 * The first 500 characters of a caption, safe to store: Postgres refuses a NUL and half an emoji in text, and one
 * bad caption must not fail a whole channel's pull.
 */
export function cleanCaption(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const characters = Array.from(raw.split("\u0000").join("")).filter((c) => !(c.length === 1 && c >= "\ud800" && c <= "\udfff"));
  return characters.slice(0, 500).join("").trim() || null;
}
