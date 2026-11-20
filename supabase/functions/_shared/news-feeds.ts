// News and web pages for Listening: the outlets' and blogs' own feeds, Serper's news and web answers, and the strict rule
// a page must pass to count as being about a keyword (every word of the keyword in its headline or text). Pure, so it is
// tested off Deno; news-sources.ts fetches. Brought over from Groundwork's news-feeds.ts and alerts-feed.ts, with text
// cut by clip() so half an emoji can never make the database refuse a store.
import { clip } from "./clip.ts";

/**
 * The named Kenyan outlets: a page on one of their sites is News, any other site is Web. Feeds are read every hour;
 * each listed one answered with stories on 19 Nov 2026. An outlet with no feed that answers still counts as named
 * when a search finds its pages.
 */
export const OUTLETS: { name: string; domains: string[]; feeds: string[] }[] = [
  { name: "The Standard", domains: ["standardmedia.co.ke"], feeds: ["https://www.standardmedia.co.ke/rss/headlines.php", "https://www.standardmedia.co.ke/rss/kenya.php"] },
  { name: "Nation", domains: ["nation.africa"], feeds: ["https://nation.africa/kenya/rss.xml"] },
  { name: "Business Daily", domains: ["businessdailyafrica.com"], feeds: ["https://www.businessdailyafrica.com/bd/rss.xml"] },
  {
    name: "Capital FM",
    domains: ["capitalfm.co.ke"],
    feeds: ["https://www.capitalfm.co.ke/news/feed/", "https://www.capitalfm.co.ke/business/feed/", "https://www.capitalfm.co.ke/lifestyle/feed/"],
  },
  { name: "Kenyans.co.ke", domains: ["kenyans.co.ke"], feeds: ["https://www.kenyans.co.ke/feeds/news"] },
  { name: "Tuko", domains: ["tuko.co.ke"], feeds: ["https://www.tuko.co.ke/rss/all.rss"] },
  { name: "Kenya News Agency", domains: ["kenyanews.go.ke"], feeds: ["https://www.kenyanews.go.ke/feed/"] },
  { name: "The Star", domains: ["the-star.co.ke"], feeds: [] },
  { name: "Citizen Digital", domains: ["citizen.digital"], feeds: [] },
  { name: "People Daily", domains: ["peopledaily.digital"], feeds: [] },
  { name: "KBC", domains: ["kbc.co.ke"], feeds: [] },
  { name: "The EastAfrican", domains: ["theeastafrican.co.ke"], feeds: [] },
];

/** Kenyan business, tech, lifestyle and food blogs read every hour; each answered with posts on 19 Nov 2026. */
export const BLOG_FEEDS: { name: string; url: string }[] = [
  { name: "TechCabal", url: "https://techcabal.com/feed/" },
  { name: "Business Today", url: "https://businesstoday.co.ke/feed/" },
  { name: "Ghafla", url: "https://www.ghafla.com/ke/feed/" },
  { name: "HapaKenya", url: "https://www.hapakenya.com/feed/" },
  { name: "Kaluhi's Kitchen", url: "https://www.kaluhiskitchen.com/feed/" },
];

/** A page found by a feed or a search. `site` is the outlet's or blog's name when the finder gave one. */
export type Found = { url: string; title: string | null; snippet: string | null; publishedAt: string | null; site: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text from a feed's HTML: entities decoded (twice, as feeds nest them) and tags dropped. */
const plain = (html: string) =>
  decode(decode(html).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/** The article behind Google's redirect link; null when it is not a web link. */
function realLink(href: string): string | null {
  try {
    const u = new URL(href);
    const target = u.hostname === "www.google.com" && u.pathname === "/url" ? u.searchParams.get("url") : href;
    if (!target) return null;
    const t = new URL(target);
    return t.protocol === "https:" || t.protocol === "http:" ? t.toString() : null;
  } catch {
    return null;
  }
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What one element holds, CDATA unwrapped; null when the item has no such element. */
function element(body: string, name: string): string | null {
  const m = new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`).exec(body);
  if (!m) return null;
  return (m[1] ?? "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
}

const when = (raw: string | null) => {
  const t = raw ? Date.parse(raw.trim()) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** The stories of an RSS or Atom feed, each at the article's own address. */
export function parseFeed(xml: string, site: string | null): Found[] {
  const out: Found[] = [];
  for (const [body = ""] of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)) {
    const href = element(body, "link")?.trim() || /<link[^>]*href="([^"]+)"/.exec(body)?.[1] || element(body, "guid")?.trim() || "";
    const url = href ? realLink(plain(href)) : null;
    if (!url) continue;
    const title = element(body, "title");
    const summary = element(body, "description") ?? element(body, "summary") ?? element(body, "content:encoded");
    out.push({
      url,
      title: title ? clip(plain(title), 300) : null,
      snippet: summary ? clip(plain(summary), 1200) : null,
      publishedAt: when(element(body, "pubDate") ?? element(body, "dc:date") ?? element(body, "published") ?? element(body, "updated")),
      site,
    });
  }
  return out;
}

const UNIT_MS: Record<string, number> = {
  second: 1_000,
  minute: 60_000,
  min: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

/** When a search result says it was published: "3 hours ago", "an hour ago", "yesterday", or a date. Null otherwise. */
export function whenSaid(raw: unknown, now = Date.now()): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const ago = /^(\d+|an?)\s+(second|minute|min|hour|day|week|month|year)s?\s+ago$/i.exec(s);
  if (ago) {
    const n = /^an?$/i.test(ago[1]) ? 1 : Number(ago[1]);
    return new Date(now - n * UNIT_MS[ago[2].toLowerCase()]).toISOString();
  }
  if (/^yesterday$/i.test(s)) return new Date(now - UNIT_MS.day).toISOString();
  return when(s);
}

/** The pages of a Serper answer: `news[]` for a news search (with the outlet's name), `organic[]` for a web search. */
export function serperResults(json: unknown, kind: "news" | "web", now = Date.now()): Found[] {
  const list = json && typeof json === "object" ? (json as Record<string, unknown>)[kind === "news" ? "news" : "organic"] : null;
  if (!Array.isArray(list)) return [];
  const out: Found[] = [];
  for (const item of list) {
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const url = typeof r.link === "string" ? realLink(r.link) : null;
    if (!url) continue;
    const text = (v: unknown, n: number) => (typeof v === "string" ? clip(plain(v), n) : null);
    out.push({
      url,
      title: text(r.title, 300),
      snippet: text(r.snippet, 1200),
      publishedAt: whenSaid(r.date, now),
      site: kind === "news" ? text(r.source, 120) : null,
    });
  }
  return out;
}

/** News when the page is on a named outlet's site (the outlet is its voice); Web for any other site (the site is). */
export function sourceOf(url: string): { source: "news" | "web"; author: string | null } {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { source: "web", author: null };
  }
  const outlet = OUTLETS.find((o) => o.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  return outlet ? { source: "news", author: outlet.name } : { source: "web", author: host || null };
}

/* ------------------------------------------------------------------ the strict rule */

/** A keyword's search, read once: word groups that must all be in the page (any word of a group will do), and words that rule it out. */
export type Search = { all: string[][]; none: string[] };

/** Words that say little about what a page is about, and the country every brand here sells in. */
const FILLER = new Set([
  "a", "an", "and", "at", "by", "constituency", "county", "for", "from", "government", "in", "kenya", "latest", "new", "news",
  "of", "on", "the", "to", "today", "update", "updates", "ward", "with",
]);

/**
 * Lower case, accents and apostrophes gone, anything else that isn't a letter or digit a space. A possessive reads as
 * the name itself ("Nuru's" as "nuru"), so a headline about someone's plans still finds them.
 */
export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘`´]s(?![\p{L}\p{N}])/gu, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** How a keyword reads: its search as written ("quoted phrases", OR, -left out) and its exclude words. */
export function searchFor(topic: { query: string; exclude_terms?: string[] | null }): Search {
  const all: string[][] = [];
  const none: string[] = [];
  let or = false;
  let kept = false;
  for (const m of String(topic.query || "").matchAll(/(-?)"([^"]*)"|(\S+)/g)) {
    const quoted = m[2] !== undefined;
    const word = m[3] ?? "";
    if (!quoted && word === "OR") {
      or = kept;
      continue;
    }
    const negative = m[1] === "-" || (!quoted && word.length > 1 && word.startsWith("-"));
    const term = fold(quoted ? (m[2] ?? "") : word.replace(/^-/, ""));
    if (!term || negative) {
      if (term) none.push(term);
      or = kept = false;
      continue;
    }
    if (!quoted && !or && FILLER.has(term)) {
      kept = false;
      continue;
    }
    if (or) all[all.length - 1].push(term);
    else all.push([term]);
    or = false;
    kept = true;
  }
  return { all, none: [...none, ...(topic.exclude_terms ?? []).map(fold).filter(Boolean)] };
}

/** A page's text folded once, a space at each end, so it can be set against many searches cheaply. */
export const haystack = (text: string) => ` ${fold(text)} `;

/** Whether folded text (haystack) answers the search. A search with no words matches nothing. */
export function answers(hay: string, s: Search): boolean {
  if (!s.all.length) return false;
  const has = (w: string) => hay.includes(` ${w} `);
  return !s.none.some(has) && s.all.every((g) => g.some(has));
}

/** Whether a page's headline and text answer the search. */
export const matchesSearch = (text: string, s: Search): boolean => answers(haystack(text), s);

/** The same story under two addresses reads the same here: its headline, folded and cut short. */
export const titleKey = (title: string | null): string => (title ? fold(title).slice(0, 120) : "");
