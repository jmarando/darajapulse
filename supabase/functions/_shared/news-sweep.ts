// What the hourly news run decides: which keywords get a news and a web search this run, which pages count for a
// keyword, and the rows stored for them. Pure, with the searches and the database passed in, so it is tested off Deno;
// listening-news/index.ts wires it up.
//
// A page counts for a keyword when every word of the keyword is in its headline or text (news-feeds.ts), it is no more
// than a week old, and the keyword doesn't already hold a story under the same headline (the same story from two
// outlets counts once). Each keyword is matched on its own, so a competitor keeps a story that names both brands. Each
// keyword sees only its own country's feed stories and is searched in its country (the brand's clients.country;
// _shared/listening-country.ts).
import { type CountryCode, countryOf } from "./listening-country.ts";
import { type MentionRow, type SaveMentions, storeMentions } from "./listening-store.ts";
import { type FeedStory, type Found, answers, haystack, searchFor, sourceOf, titleKey } from "./news-feeds.ts";

export type NewsTopic = {
  id: string;
  client_id: string;
  query: string;
  exclude_terms: string[];
  news_searched_at: string | null;
  /** The brand's country (clients.country): its feeds, its search country and its filler word. */
  country: string | null;
};

/** One search: Serper's news or web results for a query, in a country (Serper's gl). */
export type Search = (kind: "news" | "web", query: string, gl: string) => Promise<Found[]>;

/** A keyword as the database gives it, with its brand's country joined in. */
export type NewsTopicRow = Omit<NewsTopic, "country"> & { clients: { country: string | null } | null };

/** A keyword row with its brand's country read out. */
export const newsTopic = ({ clients, ...t }: NewsTopicRow): NewsTopic => ({ ...t, country: clients?.country ?? null });

/** The countries whose feeds a run reads: those of the brands with active keywords. */
export const feedCountries = (topics: NewsTopic[]): CountryCode[] => [...new Set(topics.map((t) => countryOf(t.country).code))];

/** The search turned the request away (a wrong key, or no credits left): no more searching this run. */
export class SearchRefused extends Error {}

const HOUR = 3_600_000;
/** A keyword is searched about once a day: not again within 20 hours, so an hourly run landing late keeps the rhythm. */
const SEARCH_EVERY = 20 * HOUR;
const WEEK = 7 * 24 * HOUR;

/** The keywords searched this run: those never searched first, then the longest since, none within the day; at most `max`. */
export function dueForSearch(topics: NewsTopic[], now: number, max = 8): NewsTopic[] {
  const last = (t: NewsTopic) => (t.news_searched_at ? Date.parse(t.news_searched_at) : -Infinity);
  return topics
    .filter((t) => now - last(t) >= SEARCH_EVERY)
    .sort((a, b) => last(a) - last(b))
    .slice(0, max);
}

/** The search's words: the keyword, and its exclude words as "-word". */
export const searchQuery = (t: NewsTopic) => [t.query, ...t.exclude_terms.map((w) => `-${w}`)].join(" ").trim();

export type NewsRun = {
  /** The keywords searched without a refusal: their search time is set. */
  searched: string[];
  /** Pages kept for storing (matched, fresh, not a repeat). */
  found: number;
  /** Rows the database took as new. */
  stored: number;
  /** What went wrong, by keyword. */
  notes: Record<string, string>;
  /** Why searching stopped this run, when the search refused. */
  refused: string | null;
};

export async function runNewsSweep(input: {
  /** Active keywords. */
  topics: NewsTopic[];
  /** Every story the outlets' and blogs' feeds gave this run, each with its feed's country. */
  stories: FeedStory[];
  /** Null when no search key is set: the feeds are still read. */
  search: Search | null;
  /** Headlines each keyword already holds from the last week (titleKey), by keyword id. */
  titles: Map<string, Set<string>>;
  save: SaveMentions;
  now: number;
}): Promise<NewsRun> {
  const out: NewsRun = { searched: [], found: 0, stored: 0, notes: {}, refused: null };
  const due = new Set(input.search ? dueForSearch(input.topics, input.now).map((t) => t.id) : []);
  // Every feed story is set against every keyword, so each is folded once (a few hundred stories, dozens of keywords).
  const hayOf = (p: Found) => haystack(`${p.title ?? ""} ${p.snippet ?? ""}`);
  const feed = input.stories.map((p) => ({ p, hay: hayOf(p), country: p.country }));
  const note = (id: string, text: string) => {
    out.notes[id] = out.notes[id] ? `${out.notes[id]} · ${text}` : text;
  };

  for (const topic of input.topics) {
    const country = countryOf(topic.country);
    // A keyword sees only its own country's feeds.
    const pages: { p: Found; hay: string }[] = feed.filter((f) => f.country === country.code);
    if (input.search && due.has(topic.id) && !out.refused) {
      let refused = false;
      for (const kind of ["news", "web"] as const) {
        try {
          pages.push(...(await input.search(kind, searchQuery(topic), country.serperGl)).map((p) => ({ p, hay: hayOf(p) })));
        } catch (err) {
          if (err instanceof SearchRefused) {
            out.refused = err.message;
            refused = true;
            break;
          }
          note(topic.id, `${kind === "news" ? "News" : "Web"} search: ${(err as Error).message}`);
        }
      }
      if (!refused) out.searched.push(topic.id);
    }

    const search = searchFor(topic, country);
    const held = new Set(input.titles.get(topic.id) ?? []);
    const urls = new Set<string>();
    const rows: MentionRow[] = [];
    for (const { p, hay } of pages) {
      const at = p.publishedAt ? Date.parse(p.publishedAt) : NaN;
      if (!Number.isNaN(at) && input.now - at > WEEK) continue;
      if (!answers(hay, search)) continue;
      const key = titleKey(p.title);
      if (urls.has(p.url) || (key && held.has(key))) continue;
      urls.add(p.url);
      if (key) held.add(key);
      const { source, author } = sourceOf(p.url);
      rows.push({
        client_id: topic.client_id,
        topic_id: topic.id,
        source,
        url: p.url,
        title: p.title,
        snippet: p.snippet,
        author: source === "news" ? author : (p.site ?? author),
        reach: null,
        shares: null,
        published_at: p.publishedAt,
      });
    }
    out.found += rows.length;
    const { stored, problem } = await storeMentions(rows, input.save);
    out.stored += stored;
    if (problem) note(topic.id, problem);
  }
  return out;
}
