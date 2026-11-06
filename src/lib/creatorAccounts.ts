// A creator is one person with any number of platform accounts. They are stored on the influencers row: the main account
// in handle, primary_platform, follower_count and engagement_rate, which reports, briefs and jobs all read, and the rest
// in alt_handles as "platform:handle", with their numbers in account_stats. Everything else goes through this file, so
// nothing else needs to know that format.

export type CreatorAccount = {
  platform: string;
  /** Lowercase with no "@" when readable. Otherwise exactly what was typed, so nothing is lost. */
  handle: string;
  /** False for a name typed in place of a handle: it can't be looked up or matched. */
  readable: boolean;
  followers: number | null;
  engagement: number | null;
};

/** Everything a creator can have an account on. Adding a platform here is all a new one needs. */
export const CREATOR_PLATFORMS: { key: string; label: string }[] = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "twitter", label: "X" },
  { key: "youtube", label: "YouTube" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "threads", label: "Threads" },
  { key: "snapchat", label: "Snapchat" },
];

/** What influencers.primary_platform and posts.platform can hold. The others are kept on the creator's profile only. */
export const TRACKED_PLATFORMS = ["tiktok", "instagram", "facebook", "twitter", "youtube"];

const ORDER = new Map(CREATOR_PLATFORMS.map((p, i) => [p.key, i]));
const KNOWN = new Set(CREATOR_PLATFORMS.map((p) => p.key));

export const platformName = (key: string) => CREATOR_PLATFORMS.find((p) => p.key === key)?.label ?? key;

const HOSTS: [string, RegExp][] = [
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["facebook", /(^|\.)(facebook\.com|fb\.com)$/],
  ["twitter", /(^|\.)(x\.com|twitter\.com)$/],
  ["youtube", /(^|\.)youtube\.com$/],
  ["linkedin", /(^|\.)linkedin\.com$/],
  ["threads", /(^|\.)threads\.(net|com)$/],
  ["snapchat", /(^|\.)snapchat\.com$/],
];
const SHORT_HOSTS: [string, RegExp][] = [
  ["tiktok", /^(vm|vt)\.tiktok\.com$/],
  ["facebook", /^(fb\.watch|fb\.me)$/],
  ["youtube", /^youtu\.be$/],
  ["twitter", /^t\.co$/],
];
const LOOKS_LIKE_LINK = /^(https?:\/\/|www\.)|^([a-z0-9-]+\.)*(tiktok\.com|instagram\.com|facebook\.com|fb\.com|fb\.watch|fb\.me|x\.com|twitter\.com|t\.co|youtube\.com|youtu\.be|linkedin\.com|threads\.net|threads\.com|snapchat\.com)(\/|$)/i;
const HANDLE = /^[a-z0-9._-]{1,100}$/i;
const YOUTUBE_CHANNEL_ID = /^UC[\w-]{20,}$/;

const SHORT_LINK = "That's a short link, which doesn't name the account. Open it and paste the profile's address.";
const POST_LINK = "That's a link to a post, and it doesn't name the account. Paste the link to the profile.";
const NO_ACCOUNT = "That link doesn't name an account. Paste the link to the profile.";

const INSTAGRAM_POST_PATHS = new Set(["p", "reel", "reels", "tv", "explore"]);
const FACEBOOK_POST_PATHS = new Set(["share", "watch", "groups", "reel", "photo", "photo.php", "video.php", "permalink.php", "story.php", "events"]);
const X_NOT_ACCOUNTS = new Set(["i", "home", "search", "hashtag", "intent", "share"]);
const YOUTUBE_NOT_ACCOUNTS = new Set(["watch", "shorts", "playlist", "live", "results", "feed", "embed"]);

/** What a link's path says the account is. Null when it is a link to something else. */
function handleFromPath(platform: string, url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  switch (platform) {
    case "tiktok":
      return first.startsWith("@") ? first : null;
    case "instagram":
      if (first === "stories") return second || null;
      return INSTAGRAM_POST_PATHS.has(first) ? null : first;
    case "facebook":
      if (first === "profile.php") return url.searchParams.get("id");
      if (first === "people" || first === "pages") return parts[parts.length - 1] ?? null;
      return FACEBOOK_POST_PATHS.has(first) ? null : first;
    case "twitter":
      return X_NOT_ACCOUNTS.has(first) ? null : first;
    case "youtube":
      if (first === "channel" || first === "c" || first === "user") return second || null;
      return YOUTUBE_NOT_ACCOUNTS.has(first) ? null : first;
    case "linkedin":
      return first === "in" || first === "company" || first === "school" ? second || null : null;
    case "snapchat":
      return first === "add" ? second || null : first;
    default:
      return first;
  }
}

function asAccount(platform: string, typed: string) {
  const text = typed.trim().replace(/^@+/, "").replace(/\/+$/, "");
  if (YOUTUBE_CHANNEL_ID.test(text)) return { platform, handle: text, readable: true }; // Channel ids are case-sensitive.
  return HANDLE.test(text)
    ? { platform, handle: text.toLowerCase(), readable: true }
    : { platform, handle: text, readable: false };
}

export type ParsedAccount = { platform: string; handle: string; readable: boolean } | { platform?: string; error: string };

/** Reads what someone typed or pasted: a profile or post link, "platform:handle", or a bare handle on `fallback`. */
export function parseAccount(input: string, fallback?: string): ParsedAccount {
  const raw = input.trim();
  if (!raw) return { error: "Type a handle or paste the link to their profile." };

  if (LOOKS_LIKE_LINK.test(raw)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { error: "That link doesn't look right. Paste it again, or type the handle." };
    }
    const host = url.hostname.toLowerCase();
    const short = SHORT_HOSTS.find(([, re]) => re.test(host))?.[0];
    if (short) return { platform: short, error: SHORT_LINK };
    const platform = HOSTS.find(([, re]) => re.test(host))?.[0];
    if (!platform) return { error: "That link isn't from a platform we track. Paste a profile link or type the handle." };
    if (platform === "tiktok" && /^\/t\//.test(url.pathname)) return { platform, error: SHORT_LINK };
    const found = handleFromPath(platform, url);
    if (found === null) return { platform, error: POST_LINK };
    if (!found) return { platform, error: NO_ACCOUNT };
    return asAccount(platform, decodeURIComponent(found));
  }

  const prefixed = raw.match(/^([a-z]+):(.*)$/i);
  if (prefixed && KNOWN.has(prefixed[1].toLowerCase())) return parseAccount(prefixed[2], prefixed[1].toLowerCase());

  if (!fallback) return { error: "Choose a platform for this handle." };
  return asAccount(fallback, raw);
}

export const accountKey = (platform: string, handle: string) => `${platform}:${handle.trim().toLowerCase()}`;

type AccountStats = Record<string, { followers?: number | null; engagement_rate?: number | null }>;
export type AccountColumns = {
  handle: string | null;
  primary_platform: string | null;
  alt_handles: string[];
  follower_count: number;
  engagement_rate: number;
  account_stats: AccountStats;
};
export type RosterRowLike = {
  handle?: string | null;
  primary_platform?: string | null;
  alt_handles?: string[] | null;
  follower_count?: number | null;
  engagement_rate?: number | null;
  account_stats?: AccountStats | null;
};

/** A value already in the database. One that can't be read is kept as it is, so nothing is lost. */
export const storedAccount = (raw: string, fallback: string): CreatorAccount => {
  const parsed = parseAccount(raw, fallback);
  const base = "error" in parsed
    ? { platform: parsed.platform ?? fallback, handle: raw.trim(), readable: false }
    : parsed;
  return { ...base, followers: null, engagement: null };
};

const positive = (n: unknown) => (Number(n) > 0 ? Number(n) : null);

/** A roster row's accounts, main first and then in the usual platform order. */
export function accountsOf(row: RosterRowLike): CreatorAccount[] {
  const fallback = (row.primary_platform ?? "").toLowerCase() || "tiktok";
  const main = row.handle?.trim() ? storedAccount(row.handle, fallback) : null;
  const mainPlatform = main?.platform ?? fallback;
  const stored = [...(main ? [main] : []), ...(row.alt_handles ?? []).filter((a) => a?.trim()).map((a) => storedAccount(a, mainPlatform))];

  // A name in a handle box gives way to a real handle on the same platform.
  const hasRealHandle = new Set(stored.filter((a) => a.readable).map((a) => a.platform));
  const seen = new Set<string>();
  const accounts = stored.filter((a) => {
    if (!a.readable && hasRealHandle.has(a.platform)) return false;
    const key = accountKey(a.platform, a.handle);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rank = (a: CreatorAccount) => ORDER.get(a.platform) ?? ORDER.size;
  const mainIndex = accounts.findIndex((a) => a.platform === mainPlatform);
  const first = accounts.splice(mainIndex > 0 ? mainIndex : 0, 1);
  const ordered = [...first, ...accounts.sort((a, b) => rank(a) - rank(b))];

  return ordered.map((a, i) => {
    if (i === 0) return { ...a, followers: positive(row.follower_count), engagement: positive(row.engagement_rate) };
    const numbers = row.account_stats?.[accountKey(a.platform, a.handle)];
    return { ...a, followers: positive(numbers?.followers), engagement: positive(numbers?.engagement_rate) };
  });
}

/** The columns to write for these accounts. The first one primary_platform can hold becomes the main account. */
export function accountsToColumns(accounts: CreatorAccount[]): AccountColumns {
  const main = accounts.find((a) => TRACKED_PLATFORMS.includes(a.platform)) ?? null;
  const others = accounts.filter((a) => a !== main);
  const account_stats: AccountStats = {};
  for (const a of others) {
    if (a.followers != null || a.engagement != null) {
      account_stats[accountKey(a.platform, a.handle)] = { followers: a.followers, engagement_rate: a.engagement };
    }
  }
  return {
    handle: main?.handle ?? null,
    primary_platform: main?.platform ?? null,
    alt_handles: others.map((a) => `${a.platform}:${a.handle}`),
    follower_count: main?.followers ?? 0,
    engagement_rate: main?.engagement ?? 0,
    account_stats,
  };
}

/** `existing` plus what `incoming` adds. What's already there stays, apart from filling a number it didn't have. */
export function mergeAccounts(existing: CreatorAccount[], incoming: CreatorAccount[]): { accounts: CreatorAccount[]; added: number } {
  const merged = existing.map((a) => ({ ...a }));
  let added = 0;
  for (const next of incoming) {
    const same = merged.find((a) => accountKey(a.platform, a.handle) === accountKey(next.platform, next.handle));
    if (same) {
      same.followers ??= next.followers;
      same.engagement ??= next.engagement;
    } else {
      merged.push({ ...next });
      added++;
    }
  }
  return { accounts: merged, added };
}

/** A name reduced to what two spellings of it share. Empty when it holds no letters we can compare. */
export const personNameKey = (name?: string | null) =>
  (name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 3).join(" ");

/** Who on the roster this already is: the same account for certain, or the same name for a person to judge. */
export function matchRoster<R extends RosterRowLike & { id: string; full_name?: string | null; agency_id?: string | null }>(
  accounts: CreatorAccount[],
  name: string | null | undefined,
  rows: R[],
  agencyId?: string | null,
): { exact: R | null; sameName: R[] } {
  const scoped = agencyId ? rows.filter((r) => r.agency_id === agencyId) : rows;
  const wanted = new Set(accounts.filter((a) => a.readable).map((a) => accountKey(a.platform, a.handle)));
  const exact = wanted.size
    ? scoped.find((r) => accountsOf(r).some((a) => a.readable && wanted.has(accountKey(a.platform, a.handle)))) ?? null
    : null;
  if (exact) return { exact, sameName: [] };
  const key = personNameKey(name);
  return { exact: null, sameName: key ? scoped.filter((r) => personNameKey(r.full_name) === key) : [] };
}

/** The address of an account's profile, or null for a name, which has none. */
export function profileUrl(platform: string, handle: string): string | null {
  const h = handle.trim();
  if (!HANDLE.test(h)) return null;
  switch (platform) {
    case "tiktok": return `https://www.tiktok.com/@${h}`;
    case "instagram": return `https://www.instagram.com/${h}`;
    case "facebook": return `https://www.facebook.com/${h}`;
    case "twitter": return `https://x.com/${h}`;
    case "youtube": return YOUTUBE_CHANNEL_ID.test(h) ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`;
    case "linkedin": return `https://www.linkedin.com/in/${h}`;
    case "threads": return `https://www.threads.net/@${h}`;
    case "snapchat": return `https://www.snapchat.com/add/${h}`;
    default: return null;
  }
}
