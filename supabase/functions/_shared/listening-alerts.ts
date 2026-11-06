// The rules for Listening's alert emails: from the morning view and the keys of what was already sent, at most one
// email per brand per run, listing only what is new. Pure, like listening-brief.ts, so the tests run without Deno and
// an email can never disagree with the page it comes from.
import { ACT_VIEWS, WATCH_VIEWS, views, type MorningView } from "./listening-brief.ts";

export type AlertPost = { title: string | null; source: string; views: number; url: string; at: string };

export type AlertItem = {
  /** What the log keeps so the same thing is never emailed twice: watch:<url>, act:<url> or spike:<date>. */
  key: string;
  level: "watch" | "act" | "spike";
  post?: AlertPost;
  spike?: { now: number; usual: number };
};

export type AlertEmail = { level: "watch" | "act"; subject: string; headline: string; items: AlertItem[] };

const NAIROBI_OFFSET = 3 * 3_600_000;

/** The Nairobi calendar date of a moment, like 2026-11-03. */
export const nairobiDay = (now: number) => new Date(now + NAIROBI_OFFSET).toISOString().slice(0, 10);

const PLATFORMS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
  facebook: "Facebook",
  x: "X",
};

/** A platform's name as the page writes it; one it does not know is passed through. */
export const platformName = (source: string) => PLATFORMS[source] ?? source;

export function newAlerts(input: {
  view: MorningView;
  brandName: string;
  /** Keys of the alerts already emailed for this brand. */
  sent: ReadonlySet<string>;
  now: number;
}): AlertEmail | null {
  const { view, brandName, sent, now } = input;
  const items: AlertItem[] = [];

  for (const { mention, views: seen } of view.needsYou) {
    if (seen < WATCH_VIEWS) continue;
    const level = seen >= ACT_VIEWS ? "act" : "watch";
    const key = `${level}:${mention.url}`;
    // An Act on a post covers the Watch before it, so a post is never sent at a level it has passed.
    if (sent.has(key) || sent.has(`act:${mention.url}`)) continue;
    items.push({
      key,
      level,
      post: { title: mention.title, source: mention.source, views: seen, url: mention.url, at: mention.published_at ?? mention.found_at },
    });
  }

  const day = nairobiDay(now);
  if (view.spike && !sent.has(`spike:${day}`)) items.push({ key: `spike:${day}`, level: "spike", spike: view.spike });
  if (!items.length) return null;

  const level = items.some((i) => i.level === "act") ? "act" : "watch";
  const posts = items.filter((i) => i.post);
  const what = posts.length === 1
    ? `a negative post about ${brandName} has ${views(posts[0].post!.views)} views`
    : posts.length > 1
      ? `${posts.length} negative posts about ${brandName} are picking up`
      : `${items[0].spike!.now} negative posts about ${brandName} in the last day`;
  return { level, subject: `${level === "act" ? "Act" : "Watch"}: ${what}`, headline: view.verdict.headline, items };
}
