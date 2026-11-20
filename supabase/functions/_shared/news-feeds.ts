// News and web pages for Listening: the outlets' and blogs' own feeds, Serper's news and web answers, and the strict rule
// a page must pass to count as being about a keyword (every word of the keyword in its headline or text). Pure, so it is
// tested off Deno; news-sources.ts fetches. Brought over from Groundwork's news-feeds.ts and alerts-feed.ts, with text
// cut by clip() so half an emoji can never make the database refuse a store.
import { clip } from "./clip.ts";
import { type CountryCode, type ListeningCountry, LISTENING_COUNTRIES } from "./listening-country.ts";

/**
 * The named outlets, by country: a page on one of their sites is News, any other site is Web. Feeds are read every hour
 * for each country that has brands listening; each listed feed answered with stories when it was added (Kenya 19 Nov,
 * Uganda 20 Nov 2026). An outlet with no feed that answers still counts as named when a search finds its pages.
 */
export const OUTLETS: { name: string; country: CountryCode; domains: string[]; feeds: string[] }[] = [
  { name: "The Standard", country: "KE", domains: ["standardmedia.co.ke"], feeds: ["https://www.standardmedia.co.ke/rss/headlines.php", "https://www.standardmedia.co.ke/rss/kenya.php"] },
  { name: "Nation", country: "KE", domains: ["nation.africa"], feeds: ["https://nation.africa/kenya/rss.xml"] },
  { name: "Business Daily", country: "KE", domains: ["businessdailyafrica.com"], feeds: ["https://www.businessdailyafrica.com/bd/rss.xml"] },
  {
    name: "Capital FM",
    country: "KE",
    // Its lifestyle feed links to capitalfm.africa.
    domains: ["capitalfm.co.ke", "capitalfm.africa"],
    feeds: ["https://www.capitalfm.co.ke/news/feed/", "https://www.capitalfm.co.ke/business/feed/", "https://www.capitalfm.co.ke/lifestyle/feed/"],
  },
  { name: "Kenyans.co.ke", country: "KE", domains: ["kenyans.co.ke"], feeds: ["https://www.kenyans.co.ke/feeds/news"] },
  { name: "Tuko", country: "KE", domains: ["tuko.co.ke"], feeds: ["https://www.tuko.co.ke/rss/all.rss"] },
  { name: "Kenya News Agency", country: "KE", domains: ["kenyanews.go.ke"], feeds: ["https://www.kenyanews.go.ke/feed/"] },
  { name: "The Star", country: "KE", domains: ["the-star.co.ke"], feeds: [] },
  { name: "Citizen Digital", country: "KE", domains: ["citizen.digital"], feeds: [] },
  { name: "People Daily", country: "KE", domains: ["peopledaily.digital"], feeds: [] },
  { name: "KBC", country: "KE", domains: ["kbc.co.ke"], feeds: [] },
  { name: "The EastAfrican", country: "KE", domains: ["theeastafrican.co.ke"], feeds: [] },
  { name: "Daily Monitor", country: "UG", domains: ["monitor.co.ug"], feeds: ["https://www.monitor.co.ug/rss.xml"] },
  { name: "Nile Post", country: "UG", domains: ["nilepost.co.ug"], feeds: ["https://nilepost.co.ug/feed"] },
  { name: "The Observer", country: "UG", domains: ["observer.ug"], feeds: ["https://observer.ug/feed/"] },
  { name: "The Independent", country: "UG", domains: ["independent.co.ug"], feeds: ["https://www.independent.co.ug/feed/"] },
  { name: "NTV Uganda", country: "UG", domains: ["ntv.co.ug"], feeds: ["https://ntv.co.ug/feed"] },
  { name: "SoftPower", country: "UG", domains: ["softpower.ug"], feeds: ["https://softpower.ug/feed/"] },
  { name: "Daily Express", country: "UG", domains: ["dailyexpress.co.ug"], feeds: ["https://dailyexpress.co.ug/feed/"] },
  { name: "Galaxy FM", country: "UG", domains: ["galaxyfm.co.ug"], feeds: ["https://www.galaxyfm.co.ug/feed/"] },
  { name: "Eagle Online", country: "UG", domains: ["eagle.co.ug"], feeds: ["https://eagle.co.ug/feed/"] },
  // No feed of theirs answered on 20 Nov 2026 (NBS's stopped in May 2025).
  { name: "New Vision", country: "UG", domains: ["newvision.co.ug"], feeds: [] },
  { name: "ChimpReports", country: "UG", domains: ["chimpreports.com"], feeds: [] },
  { name: "PML Daily", country: "UG", domains: ["pmldaily.com"], feeds: [] },
  { name: "Uganda Radio Network", country: "UG", domains: ["ugandaradionetwork.net"], feeds: [] },
  { name: "NBS", country: "UG", domains: ["nbs.ug"], feeds: [] },
];

/** Business, tech, lifestyle and food blogs read every hour, by country; each answered with posts when it was added. */
export const BLOG_FEEDS: { name: string; country: CountryCode; url: string }[] = [
  { name: "TechCabal", country: "KE", url: "https://techcabal.com/feed/" },
  { name: "Business Today", country: "KE", url: "https://businesstoday.co.ke/feed/" },
  { name: "Ghafla", country: "KE", url: "https://www.ghafla.com/ke/feed/" },
  { name: "HapaKenya", country: "KE", url: "https://www.hapakenya.com/feed/" },
  { name: "Kaluhi's Kitchen", country: "KE", url: "https://www.kaluhiskitchen.com/feed/" },
  { name: "Business Focus", country: "UG", url: "https://businessfocus.co.ug/feed/" },
  { name: "CEO East Africa", country: "UG", url: "https://www.ceo.co.ug/feed/" },
  { name: "Techjaja", country: "UG", url: "https://techjaja.com/feed/" },
  { name: "Bigeye", country: "UG", url: "https://bigeye.ug/feed/" },
  { name: "MBU", country: "UG", url: "https://mbu.ug/feed/" },
  { name: "Sqoop", country: "UG", url: "https://www.sqoop.co.ug/feed" },
  { name: "Matooke Republic", country: "UG", url: "https://www.matookerepublic.com/feed/" },
];

/** A page found by a feed or a search. `site` is the outlet's or blog's name when the finder gave one. */
export type Found = { url: string; title: string | null; snippet: string | null; publishedAt: string | null; site: string | null };

/** A story from an outlet's or blog's feed, with the feed's country: a keyword is matched only against its own country's. */
export type FeedStory = Found & { country: CountryCode };

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

/** Words that say little about what a page is about. The brand's own country's name is left out too (searchFor). */
const FILLER = new Set([
  "a", "an", "and", "at", "by", "constituency", "county", "for", "from", "government", "in", "latest", "new", "news",
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

/**
 * How a keyword reads: its search as written ("quoted phrases", OR, -left out) and its exclude words. A leading "The"
 * stays with the word after it ("The Star" reads as the phrase "the star"), because dropping it as filler can leave
 * one common word that matches anything ("The Star Kenya" once read as just "star"). The brand's own country is filler
 * too, so a Ugandan brand's "MTN Uganda" reads as "mtn" while its "Kenya Airways" keeps both words.
 */
export function searchFor(topic: { query: string; exclude_terms?: string[] | null }, country: ListeningCountry = LISTENING_COUNTRIES.KE): Search {
  const all: string[][] = [];
  const none: string[] = [];
  let or = false;
  let kept = false;
  const query = String(topic.query || "").replace(/^\s*the\s+([^\s"-][^\s"]*)/i, '"the $1"');
  for (const m of query.matchAll(/(-?)"([^"]*)"|(\S+)/g)) {
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
    if (!quoted && !or && (FILLER.has(term) || term === country.countryWord)) {
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
