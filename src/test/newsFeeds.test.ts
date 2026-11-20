import { describe, expect, it } from "vitest";
import {
  BLOG_FEEDS,
  OUTLETS,
  fold,
  matchesSearch,
  parseFeed,
  searchFor,
  serperResults,
  sourceOf,
  titleKey,
  whenSaid,
} from "../../supabase/functions/_shared/news-feeds";
import { LISTENING_COUNTRIES } from "../../supabase/functions/_shared/listening-country";

// News and web pages for Listening: outlets' and blogs' own feeds, Serper's news and web answers, and the strict rule a
// page must pass before it counts as being about a keyword. Invented brands and pages only.

const NOW = Date.parse("2026-11-19T12:00:00Z");

describe("parseFeed", () => {
  it("reads RSS items with their title, text, link and date", () => {
    const xml = `<rss><channel><title>Feed</title>
      <item><title><![CDATA[Nuru Coffee opens a <b>new</b> plant &amp; hires 200]]></title>
        <link>https://example-news.co.ke/business/nuru-coffee-plant</link>
        <description>&lt;p&gt;The plant in Thika &amp;amp; more.&lt;/p&gt;</description>
        <pubDate>Wed, 18 Nov 2026 07:30:00 +0300</pubDate></item>
      <item><title>No link here</title></item>
    </channel></rss>`;
    expect(parseFeed(xml, "Example News")).toEqual([
      {
        url: "https://example-news.co.ke/business/nuru-coffee-plant",
        title: "Nuru Coffee opens a new plant & hires 200",
        snippet: "The plant in Thika & more.",
        publishedAt: "2026-11-18T04:30:00.000Z",
        site: "Example News",
      },
    ]);
  });

  it("reads Atom entries, whose link is an attribute", () => {
    const xml = `<feed><entry><title>Masala chai week</title>
      <link rel="alternate" href="https://blog.example.com/masala-chai-week"/>
      <summary>Tea for everyone</summary><updated>2026-11-17T09:00:00Z</updated></entry></feed>`;
    expect(parseFeed(xml, null)).toEqual([
      {
        url: "https://blog.example.com/masala-chai-week",
        title: "Masala chai week",
        snippet: "Tea for everyone",
        publishedAt: "2026-11-17T09:00:00.000Z",
        site: null,
      },
    ]);
  });

  it("never splits an emoji when it cuts a long text", () => {
    const xml = `<rss><item><title>${"a".repeat(299)}😀</title><link>https://example.com/x</link></item></rss>`;
    const [story] = parseFeed(xml, null);
    expect(story.title).toBe("a".repeat(299));
  });

  it("follows Google's redirect link to the article", () => {
    const xml = `<feed><entry><title>t</title><link href="https://www.google.com/url?rct=j&amp;url=https://example.com/story&amp;ct=ga"/></entry></feed>`;
    expect(parseFeed(xml, null)[0].url).toBe("https://example.com/story");
  });
});

describe("whenSaid", () => {
  it("reads how a search says when a page was published", () => {
    expect(whenSaid("3 hours ago", NOW)).toBe("2026-11-19T09:00:00.000Z");
    expect(whenSaid("an hour ago", NOW)).toBe("2026-11-19T11:00:00.000Z");
    expect(whenSaid("yesterday", NOW)).toBe("2026-11-18T12:00:00.000Z");
    expect(whenSaid("Oct 28, 2026", NOW)).toBe(new Date("Oct 28, 2026").toISOString());
    expect(whenSaid("", NOW)).toBeNull();
    expect(whenSaid("soon", NOW)).toBeNull();
  });
});

describe("serperResults", () => {
  it("reads a news answer", () => {
    const json = {
      news: [
        { title: "Nuru Coffee prices rise", link: "https://example-news.co.ke/a", snippet: "Up 5%", date: "2 days ago", source: "Example News" },
        { title: "no link" },
      ],
    };
    expect(serperResults(json, "news", NOW)).toEqual([
      { url: "https://example-news.co.ke/a", title: "Nuru Coffee prices rise", snippet: "Up 5%", publishedAt: "2026-11-17T12:00:00.000Z", site: "Example News" },
    ]);
  });

  it("reads a web answer, whose results are organic", () => {
    const json = { organic: [{ title: "Where to buy Nuru Coffee", link: "https://blog.example.com/nuru", snippet: "A guide", date: "Nov 1, 2026" }] };
    const [page] = serperResults(json, "web", NOW);
    expect(page).toMatchObject({ url: "https://blog.example.com/nuru", title: "Where to buy Nuru Coffee", snippet: "A guide", site: null });
    expect(page.publishedAt).toBe(new Date("Nov 1, 2026").toISOString());
  });

  it("gives nothing for an answer it can't read", () => {
    expect(serperResults(null, "news")).toEqual([]);
    expect(serperResults({ news: "x" }, "news")).toEqual([]);
    expect(serperResults({ news: [] }, "web")).toEqual([]);
  });
});

describe("sourceOf", () => {
  it("calls a named outlet's page news, with the outlet as the voice", () => {
    const outlet = OUTLETS[0];
    expect(sourceOf(`https://www.${outlet.domains[0]}/business/story`)).toEqual({ source: "news", author: outlet.name });
    expect(sourceOf(`https://edition.${outlet.domains[0]}/x`)).toEqual({ source: "news", author: outlet.name });
  });

  it("knows an outlet by every domain its feeds link to", () => {
    // Capital FM's lifestyle feed links to capitalfm.africa, not capitalfm.co.ke (seen on the first live run).
    expect(sourceOf("https://capitalfm.africa/some-story/?utm_source=rss")).toEqual({ source: "news", author: "Capital FM" });
  });

  it("calls any other site web, with the site as the voice", () => {
    expect(sourceOf("https://www.blog.example.com/post")).toEqual({ source: "web", author: "blog.example.com" });
    expect(sourceOf("not a link")).toEqual({ source: "web", author: null });
  });

  it("has outlets and blogs to read, each feed a web address", () => {
    expect(OUTLETS.length).toBeGreaterThan(5);
    expect(BLOG_FEEDS.length).toBeGreaterThan(2);
    for (const f of [...OUTLETS.flatMap((o) => o.feeds), ...BLOG_FEEDS.map((b) => b.url)]) expect(f).toMatch(/^https:\/\//);
  });
});

describe("Ugandan outlets and blogs", () => {
  it("names Uganda's outlets, so their pages are news under the outlet's name", () => {
    expect(sourceOf("https://www.monitor.co.ug/uganda/news/national/a-story-5678084")).toEqual({ source: "news", author: "Daily Monitor" });
    expect(sourceOf("https://nilepost.co.ug/news/389138/a-story")).toEqual({ source: "news", author: "Nile Post" });
    expect(sourceOf("https://www.newvision.co.ug/category/news/a-story")).toEqual({ source: "news", author: "New Vision" });
  });

  it("tags every outlet and blog with its country, Kenya's list as before", () => {
    expect(OUTLETS.filter((o) => o.country === "KE").map((o) => o.name)).toEqual([
      "The Standard", "Nation", "Business Daily", "Capital FM", "Kenyans.co.ke", "Tuko", "Kenya News Agency", "The Star",
      "Citizen Digital", "People Daily", "KBC", "The EastAfrican",
    ]);
    expect(BLOG_FEEDS.filter((b) => b.country === "KE").map((b) => b.name)).toEqual(["TechCabal", "Business Today", "Ghafla", "HapaKenya", "Kaluhi's Kitchen"]);
    expect(OUTLETS.filter((o) => o.country === "UG" && o.feeds.length)).toHaveLength(9);
    expect(OUTLETS.filter((o) => o.country === "UG" && !o.feeds.length)).toHaveLength(5);
    expect(BLOG_FEEDS.filter((b) => b.country === "UG")).toHaveLength(7);
    expect([...OUTLETS, ...BLOG_FEEDS].every((s) => s.country === "KE" || s.country === "UG")).toBe(true);
  });
});

describe("the strict rule a page must pass", () => {
  const ok = (query: string, text: string, exclude: string[] = []) => matchesSearch(text, searchFor({ query, exclude_terms: exclude }));

  it("leaves out the brand's own country: Kenya for a Kenyan brand, Uganda for a Ugandan one", () => {
    const ug = (query: string, text: string) => matchesSearch(text, searchFor({ query, exclude_terms: [] }, LISTENING_COUNTRIES.UG));
    expect(ug("Nile Crisps Uganda", "Nile Crisps opens a plant in Jinja")).toBe(true);
    expect(ug("Kenya Airways", "Airways news from Entebbe")).toBe(false);
    expect(ug("Kenya Airways", "Kenya Airways adds a Kampala flight")).toBe(true);
    expect(ok("Nuru Uganda", "Nuru opens a plant in Thika")).toBe(false);
  });

  it("needs every word of the keyword, as whole words", () => {
    expect(ok("Nuru Coffee", "Nuru Coffee opens a plant")).toBe(true);
    expect(ok("Nuru Coffee", "Nuru tea opens a plant")).toBe(false);
    expect(ok("Nuru", "Nurudeen opens a plant")).toBe(false);
  });

  it("reads a possessive as the name, and ignores case and accents", () => {
    expect(ok("Nuru", "Nuru's new plant")).toBe(true);
    expect(ok("cafe nuru", "CAFÉ NURU opens")).toBe(true);
  });

  it("leaves out the country and filler words", () => {
    expect(ok("Nuru Kenya", "Nuru opens a plant in Thika")).toBe(true);
    expect(ok("Nuru news", "Nuru opens a plant")).toBe(true);
  });

  it("keeps a leading The with the name it starts, so the name doesn't shrink to one common word", () => {
    // "The Star Kenya" once folded to just "star" and matched a story about a "Nigerian star".
    expect(ok("The Star Kenya", "Nigerian star Joeboy brings the festive party to Nairobi")).toBe(false);
    expect(ok("The Star Kenya", "The Star reported on Monday that prices rose")).toBe(true);
    expect(ok("the Daily Brew", "The Daily Brew opens in Thika")).toBe(true);
    expect(ok("the Daily Brew", "A daily brew of news")).toBe(false);
  });

  it("takes quoted phrases and OR as written", () => {
    expect(ok('"masala chai" OR "spiced tea"', "Spiced tea is back")).toBe(true);
    expect(ok('"masala chai" OR "spiced tea"', "Masala is back")).toBe(false);
  });

  it("rules a page out on an exclude word", () => {
    expect(ok("Nuru", "Nuru Coffee jobs", ["jobs"])).toBe(false);
    expect(ok("Nuru -jobs", "Nuru Coffee jobs")).toBe(false);
  });

  it("needs a hashtag keyword's hashtag", () => {
    expect(ok("#NuruMornings", "Join #NuruMornings this week")).toBe(true);
    expect(ok("#NuruMornings", "Nuru mornings are here")).toBe(false);
  });

  it("matches nothing with a keyword of only filler", () => {
    expect(ok("Kenya news", "Kenya news today")).toBe(false);
  });

  it("folds text the same way everywhere", () => {
    expect(fold("  Nuru's CAFÉ — #1! ")).toBe("nuru cafe 1");
    expect(titleKey(`  ${"Nuru ".repeat(40)}`)).toHaveLength(120);
    expect(titleKey(null)).toBe("");
  });
});
