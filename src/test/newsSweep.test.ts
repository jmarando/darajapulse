import { describe, expect, it, vi } from "vitest";
import type { FeedStory, Found } from "../../supabase/functions/_shared/news-feeds";
import type { MentionRow } from "../../supabase/functions/_shared/listening-store";
import { type NewsTopic, SearchRefused, dueForSearch, feedCountries, newsTopic, runNewsSweep, searchQuery } from "../../supabase/functions/_shared/news-sweep";

// What the hourly news run decides: which keywords get a news and web search this run, which pages count for a keyword
// (strict matches, fresh, not a story the keyword already holds), and how they are stored. Invented brands only.

const NOW = Date.parse("2026-11-19T12:00:00Z");
const HOUR = 3_600_000;

const topic = (o: Partial<NewsTopic> = {}): NewsTopic => ({
  id: "t-nuru",
  client_id: "c-nuru",
  query: "Nuru Coffee",
  exclude_terms: [],
  news_searched_at: null,
  country: null,
  ...o,
});
/** A page from a feed (Kenyan unless told) or a search. */
const page = (o: Partial<FeedStory> = {}): FeedStory => ({
  url: "https://www.nation.africa/business/nuru-coffee-plant",
  title: "Nuru Coffee opens a plant in Thika",
  snippet: "The plant employs 200",
  publishedAt: new Date(NOW - 5 * HOUR).toISOString(),
  site: null,
  country: "KE",
  ...o,
});

/** A stand-in for the insert: records the rows and says they were all new, or refuses as told. */
function saver(refuse = false) {
  const rows: MentionRow[] = [];
  const save = vi.fn(async (batch: MentionRow[]) => {
    if (refuse) return { count: 0, error: { message: "the database said no" } };
    rows.push(...batch);
    return { count: batch.length, error: null };
  });
  return { rows, save };
}

describe("dueForSearch", () => {
  it("takes keywords never searched first, then the oldest, at most eight", () => {
    const topics = Array.from({ length: 10 }, (_, i) =>
      topic({ id: `t${i}`, news_searched_at: i < 2 ? null : new Date(NOW - (30 + i) * HOUR).toISOString() }),
    );
    expect(dueForSearch(topics, NOW).map((t) => t.id)).toEqual(["t0", "t1", "t9", "t8", "t7", "t6", "t5", "t4"]);
  });

  it("leaves a keyword searched in the last twenty hours", () => {
    expect(dueForSearch([topic({ news_searched_at: new Date(NOW - 19 * HOUR).toISOString() })], NOW)).toEqual([]);
    expect(dueForSearch([topic({ news_searched_at: new Date(NOW - 21 * HOUR).toISOString() })], NOW)).toHaveLength(1);
  });

  it("asks the search for the keyword without its exclude words", () => {
    expect(searchQuery(topic({ exclude_terms: ["jobs", "tenders"] }))).toBe("Nuru Coffee -jobs -tenders");
  });
});

describe("runNewsSweep", () => {
  it("stores feed stories that match a keyword strictly, as news from a named outlet or web from any other site", async () => {
    const { rows, save } = saver();
    const out = await runNewsSweep({
      topics: [topic()],
      stories: [
        page(),
        page({ url: "https://blog.example.com/nuru", title: "My morning with Nuru Coffee", site: "Example Blog" }),
        page({ url: "https://www.nation.africa/x", title: "Nuru tea is back" }),
      ],
      search: null,
      titles: new Map(),
      save,
      now: NOW,
    });
    expect(rows.map((r) => [r.source, r.author, r.url])).toEqual([
      ["news", "Nation", "https://www.nation.africa/business/nuru-coffee-plant"],
      ["web", "Example Blog", "https://blog.example.com/nuru"],
    ]);
    expect(rows[0]).toMatchObject({ client_id: "c-nuru", topic_id: "t-nuru", reach: null, shares: null });
    expect(out).toMatchObject({ searched: [], found: 2, stored: 2, refused: null });
  });

  it("drops a story the keyword already holds, and the same story from a second outlet", async () => {
    const { rows, save } = saver();
    await runNewsSweep({
      topics: [topic()],
      stories: [
        page(),
        page({ url: "https://www.the-star.co.ke/nuru", title: "NURU COFFEE opens a plant in Thika!" }),
        page({ url: "https://www.tuko.co.ke/nuru", title: "Nuru Coffee posts record sales" }),
      ],
      search: null,
      titles: new Map([["t-nuru", new Set(["nuru coffee posts record sales"])]]),
      save,
      now: NOW,
    });
    expect(rows.map((r) => r.url)).toEqual(["https://www.nation.africa/business/nuru-coffee-plant"]);
  });

  it("leaves out pages older than a week", async () => {
    const { rows, save } = saver();
    await runNewsSweep({
      topics: [topic()],
      stories: [page({ publishedAt: new Date(NOW - 8 * 24 * HOUR).toISOString() }), page({ url: "https://example.com/n", publishedAt: null, title: "Nuru Coffee at the fair" })],
      search: null,
      titles: new Map(),
      save,
      now: NOW,
    });
    expect(rows.map((r) => r.url)).toEqual(["https://example.com/n"]);
  });

  it("searches news and the web for a due keyword, and marks it searched", async () => {
    const { rows, save } = saver();
    const search = vi.fn(async (kind: "news" | "web") =>
      kind === "news"
        ? [page({ url: "https://www.businessdailyafrica.com/nuru", title: "Nuru Coffee raises prices" })]
        : [page({ url: "https://www.foodblog.example.com/nuru", title: "Nuru Coffee taste test" })],
    );
    const out = await runNewsSweep({ topics: [topic()], stories: [], search, titles: new Map(), save, now: NOW });
    expect(search.mock.calls).toEqual([["news", "Nuru Coffee", "ke"], ["web", "Nuru Coffee", "ke"]]);
    expect(rows.map((r) => [r.source, r.author])).toEqual([
      ["news", "Business Daily"],
      ["web", "foodblog.example.com"],
    ]);
    expect(out.searched).toEqual(["t-nuru"]);
  });

  it("does not search a keyword searched within the day", async () => {
    const search = vi.fn(async () => [] as Found[]);
    const out = await runNewsSweep({
      topics: [topic({ news_searched_at: new Date(NOW - 2 * HOUR).toISOString() })],
      stories: [],
      search,
      titles: new Map(),
      save: saver().save,
      now: NOW,
    });
    expect(search).not.toHaveBeenCalled();
    expect(out.searched).toEqual([]);
  });

  it("stops searching for the run when the search is refused, and says why", async () => {
    const search = vi.fn(async () => {
      throw new SearchRefused("the search was refused (400): Not enough credits");
    });
    const out = await runNewsSweep({
      topics: [topic(), topic({ id: "t-2", query: "Nuru Tea" })],
      stories: [],
      search,
      titles: new Map(),
      save: saver().save,
      now: NOW,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(out.refused).toBe("the search was refused (400): Not enough credits");
    expect(out.searched).toEqual([]);
  });

  it("notes a search that failed for another reason and carries on", async () => {
    const search = vi.fn(async (kind: "news" | "web") => {
      if (kind === "news") throw new Error("the search answered 500");
      return [page({ url: "https://example.com/web", title: "Nuru Coffee review" })];
    });
    const { rows, save } = saver();
    const out = await runNewsSweep({ topics: [topic()], stories: [], search, titles: new Map(), save, now: NOW });
    expect(rows.map((r) => r.url)).toEqual(["https://example.com/web"]);
    expect(out.notes["t-nuru"]).toBe("News search: the search answered 500");
    expect(out.searched).toEqual(["t-nuru"]);
  });

  it("notes a store the database refused", async () => {
    const out = await runNewsSweep({ topics: [topic()], stories: [page()], search: null, titles: new Map(), save: saver(true).save, now: NOW });
    expect(out.stored).toBe(0);
    expect(out.notes["t-nuru"]).toMatch(/^Could not store 1 of 1 posts found/);
  });

  it("matches each keyword on its own, so a competitor keeps the story too", async () => {
    const { rows, save } = saver();
    await runNewsSweep({
      topics: [topic(), topic({ id: "t-rival", query: "Baridi Tea" })],
      stories: [page({ title: "Nuru Coffee and Baridi Tea both raise prices" })],
      search: null,
      titles: new Map(),
      save,
      now: NOW,
    });
    expect(rows.map((r) => r.topic_id)).toEqual(["t-nuru", "t-rival"]);
  });
});

describe("by the brand's country", () => {
  it("gives each keyword only its own country's feed stories", async () => {
    const { rows, save } = saver();
    await runNewsSweep({
      topics: [topic(), topic({ id: "t-ug", client_id: "c-ug", query: "Nile Crisps", country: "Uganda" })],
      stories: [
        page({ title: "Nuru Coffee and Nile Crisps sign a deal" }),
        page({ url: "https://www.monitor.co.ug/uganda/business/nile-crisps-deal", title: "Nile Crisps and Nuru Coffee sign a deal", country: "UG" }),
      ],
      search: null,
      titles: new Map(),
      save,
      now: NOW,
    });
    expect(rows.map((r) => [r.topic_id, r.author])).toEqual([["t-nuru", "Nation"], ["t-ug", "Daily Monitor"]]);
  });

  it("searches a Ugandan brand's keyword in Uganda, and a Kenyan brand's in Kenya", async () => {
    const search = vi.fn(async () => [] as Found[]);
    await runNewsSweep({
      topics: [topic(), topic({ id: "t-ug", query: "Nile Crisps", country: "Uganda" })],
      stories: [],
      search,
      titles: new Map(),
      save: saver().save,
      now: NOW,
    });
    expect(search.mock.calls).toEqual([
      ["news", "Nuru Coffee", "ke"], ["web", "Nuru Coffee", "ke"],
      ["news", "Nile Crisps", "ug"], ["web", "Nile Crisps", "ug"],
    ]);
  });

  it("leaves Uganda out of a Ugandan brand's keyword, as Kenya is for a Kenyan one", async () => {
    const { rows, save } = saver();
    await runNewsSweep({
      topics: [topic({ id: "t-ug", query: "Nile Crisps Uganda", country: "Uganda" })],
      stories: [page({ url: "https://nilepost.co.ug/business/1/nile-crisps", title: "Nile Crisps opens a plant in Jinja", country: "UG" })],
      search: null,
      titles: new Map(),
      save,
      now: NOW,
    });
    expect(rows.map((r) => r.url)).toEqual(["https://nilepost.co.ug/business/1/nile-crisps"]);
  });

  it("takes the brand's country from the keyword's joined client row", () => {
    expect(newsTopic({ id: "t", client_id: "c", query: "Nile Crisps", exclude_terms: [], news_searched_at: null, clients: { country: "Uganda" } }))
      .toEqual({ id: "t", client_id: "c", query: "Nile Crisps", exclude_terms: [], news_searched_at: null, country: "Uganda" });
    expect(newsTopic({ id: "t", client_id: "c", query: "Nuru", exclude_terms: [], news_searched_at: null, clients: null }).country).toBeNull();
  });

  it("reads the feeds of the countries with keywords, Kenya alone while every brand is Kenyan", () => {
    expect(feedCountries([topic(), topic({ country: "Kenya" })])).toEqual(["KE"]);
    expect(feedCountries([topic(), topic({ country: "Uganda" })])).toEqual(["KE", "UG"]);
    expect(feedCountries([])).toEqual([]);
  });
});
