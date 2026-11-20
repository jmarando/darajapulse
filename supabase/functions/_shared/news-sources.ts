// Fetching the news sources for Listening: every outlet's and blog's own feed (free), and Serper's news and web search
// (SERPER_API_KEY: Google's results through a licensed API, one prepaid credit a search). Reading the answers is
// news-feeds.ts. Every request is bounded and best effort: a feed that doesn't answer is counted, never fatal. The key
// is read when a run asks for it, so a changed secret needs no redeploy and tests can stand Deno in.
import { clip } from "./clip.ts";
import type { CountryCode } from "./listening-country.ts";
import { BLOG_FEEDS, type FeedStory, type Found, OUTLETS, parseFeed, serperResults } from "./news-feeds.ts";
import { SearchRefused } from "./news-sweep.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

const AGENT = "Mozilla/5.0 (compatible; DarajaPulseListening/1.0; +https://darajapulse.com)";
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*";

/**
 * The feeds of the countries asked for, read side by side: their stories, each tagged with its feed's country (a story
 * in two feeds once), and the sites with no feed that answered.
 */
export async function readFeeds(countries: readonly CountryCode[], ms = 15_000): Promise<{ stories: FeedStory[]; failed: string[] }> {
  const wanted = new Set(countries);
  const list = [...OUTLETS.flatMap((o) => o.feeds.map((url) => ({ name: o.name, country: o.country, url }))), ...BLOG_FEEDS]
    .filter((f) => wanted.has(f.country));
  const answers = await Promise.allSettled(
    list.map(async (f) => {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": AGENT, Accept: ACCEPT } });
      if (!res.ok) throw new Error(`the feed answered ${res.status}`);
      return parseFeed(await res.text(), f.name);
    }),
  );
  const byUrl = new Map<string, FeedStory>();
  const answered = new Set<string>();
  answers.forEach((a, i) => {
    if (a.status !== "fulfilled" || !a.value.length) return;
    answered.add(list[i].name);
    for (const s of a.value) if (!byUrl.has(s.url)) byUrl.set(s.url, { ...s, country: list[i].country });
  });
  return { stories: [...byUrl.values()], failed: [...new Set(list.map((f) => f.name))].filter((n) => !answered.has(n)) };
}

/** The Serper key, cleaned of a pasted "SERPER_API_KEY=", quotes and spaces; null when none is set. */
export function serperKey(): string | null {
  const raw = Deno.env.get("SERPER_API_KEY") ?? "";
  const key = raw.trim().replace(/^SERPER_API_KEY\s*=\s*/i, "").replace(/^["']|["']$/g, "").trim();
  return key || null;
}

/** One search: Google's news (`news`) or web (`web`) results for a country (Kenya unless told), in English, from the past week. */
export async function serperSearch(kind: "news" | "web", query: string, key: string, gl = "ke"): Promise<Found[]> {
  const res = await fetch(`https://google.serper.dev/${kind === "news" ? "news" : "search"}`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: clip(query, 300) ?? "", gl, hl: "en", tbs: "qdr:w", num: 10 }),
  });
  const body = await res.text();
  if (res.status === 401 || res.status === 403 || (!res.ok && /credit|unauthori[sz]ed|api key/i.test(body))) {
    throw new SearchRefused(`the search was refused (${res.status}): ${clip(body, 120) ?? ""}`);
  }
  if (!res.ok) throw new Error(`the search answered ${res.status}`);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("the search's answer could not be read");
  }
  return serperResults(json, kind);
}
