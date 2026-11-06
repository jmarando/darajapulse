import { describe, expect, it } from "vitest";
import {
  brandMentions, changeBetween, dayPeriod, lastDays, moodByPeriod, periodDays, periodLabel, previousPeriod,
  shiftPeriod, withinPeriod, type ListeningMention, type ListeningTopic,
} from "@/lib/listening";
import { buildListeningDeck } from "@/lib/listeningDeck";

const topic = (id: string, kind: ListeningTopic["kind"], label = id): ListeningTopic => ({
  id, client_id: "c1", kind, label, query: label, exclude_terms: [], active: true, last_scanned_at: null, last_note: null,
  created_at: "2026-10-01T00:00:00Z",
});

let n = 0;
const mention = (topic_id: string, extra: Partial<ListeningMention> = {}): ListeningMention => ({
  id: `m${++n}`, topic_id, source: "tiktok", url: `https://x/${n}`, title: null, snippet: null, author: null,
  reach: null, shares: null, published_at: null, found_at: "2026-10-26T10:00:00Z", sentiment: null, sentiment_score: null, theme: null,
  ...extra,
});

const brand = topic("b", "brand", "Nuru Coffee");
const rival = topic("r", "competitor", "Java House");

describe("periods", () => {
  it("covers whole days, today included, and compares with the window just before", () => {
    const p = lastDays(30, new Date(2026, 9, 30, 14).getTime());
    expect(periodDays(p)).toBe(30);
    expect(new Date(p.start).getHours()).toBe(0);
    const before = previousPeriod(p);
    expect(before.end).toBe(p.start - 1);
    expect(periodDays(before)).toBe(30);
    expect(shiftPeriod(p, -1)).toEqual(before);
    expect(shiftPeriod(before, 1)).toEqual(p);
  });

  it("labels the days it covers, whichever months they fall in", () => {
    expect(periodLabel(dayPeriod(new Date(2026, 8, 1), new Date(2026, 8, 30)))).toBe("1–30 Sep 2026");
    expect(periodLabel(dayPeriod(new Date(2026, 8, 28), new Date(2026, 9, 3)))).toBe("28 Sep – 3 Oct 2026");
    expect(periodLabel(dayPeriod(new Date(2025, 11, 28), new Date(2026, 0, 3)))).toBe("28 Dec 2025 – 3 Jan 2026");
  });

  it("puts a mention in the period it happened in, using when it was published", () => {
    const p = dayPeriod(new Date(2026, 8, 1), new Date(2026, 8, 30));
    const inside = mention("b", {
      published_at: new Date(2026, 8, 1).toISOString(),
      found_at: new Date(2026, 9, 5).toISOString(),
    });
    const outside = mention("b", { published_at: new Date(2026, 9, 1).toISOString() });
    // Found on the last day, with no publish date: it still belongs to the period.
    const foundOnly = mention("b", { published_at: null, found_at: new Date(2026, 8, 30, 23, 59).toISOString() });
    expect(withinPeriod([inside, outside, foundOnly], p).map((m) => m.id)).toEqual([inside.id, foundOnly.id]);
  });

  it("buckets mood by local day across the period, keeping empty days", () => {
    const p = dayPeriod(new Date(2026, 8, 1), new Date(2026, 8, 4));
    const days = moodByPeriod([mention("b", { sentiment: "positive", published_at: new Date(2026, 8, 2, 9).toISOString() })], p);
    expect(days.map((d) => d.day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(days[1].positive).toBe(1);
    expect(days[3]).toEqual({ day: "2026-09-04", positive: 0, neutral: 0, negative: 0 });
  });
});

describe("the brand's own posts", () => {
  it("counts a post once across the brand's keywords and leaves rivals and off-topic posts out", () => {
    const tag = topic("b2", "brand", "#Nuru");
    const same = mention("b", { url: "same" });
    const sameAgain = mention("b2", { url: "same" });
    const once = mention("b");
    const rivals = mention("r");
    const offTopic = mention("b", { theme: "off-topic" });
    const kept = brandMentions([brand, tag, rival], [same, sameAgain, once, rivals, offTopic]);
    expect(kept.map((m) => m.id)).toEqual([same.id, once.id]);
  });

  it("changes against the period before", () => {
    expect(changeBetween([mention("b"), mention("b"), mention("b")], [mention("b")])).toEqual({ current: 3, previous: 1, delta: 2 });
  });
});

describe("listening deck", () => {
  const period = dayPeriod(new Date(2026, 8, 1), new Date(2026, 8, 30));
  const previous = previousPeriod(period);
  const posted = (day: number, extra: Partial<ListeningMention> = {}) =>
    mention("b", { published_at: new Date(2026, 8, day, 10).toISOString(), ...extra });

  const deck = buildListeningDeck({
    brandName: "Nuru Coffee",
    topics: [brand, rival],
    mentions: [
      posted(2, { reach: 1_000, sentiment: "positive", theme: "quality", author: "@one" }),
      posted(3, { url: "https://x/neg", reach: 4_000, sentiment: "negative", theme: "service", author: "@two" }),
      mention("r", { published_at: new Date(2026, 8, 4).toISOString() }),
    ],
    previousMentions: [mention("b", { published_at: new Date(2026, 7, 10).toISOString(), reach: 500 })],
    period,
    previous,
    compare: true,
  });

  it("reports the period's own posts and the period before", () => {
    expect(deck.posts).toBe(2);
    expect(deck.views).toBe(5_000);
    expect(deck.creators).toBe(2);
    expect(deck.previousPosts).toBe(1);
    expect(deck.previousViews).toBe(500);
    expect(deck.change).toEqual({ current: 2, previous: 1, delta: 1 });
    expect(deck.rangeLabel).toBe("1–30 Sep 2026");
    expect(deck.positive).toBe(50);
    expect(deck.negative).toBe(50);
  });

  it("includes the rivals in share of voice but not in the brand's posts", () => {
    expect(deck.voices.map((v) => v.label)).toEqual(["Nuru Coffee", "Java House"]);
    expect(deck.lead?.key).toBe("tiktok");
    expect(deck.themes.map((t) => t.theme)).toEqual(["quality", "service"]);
  });

  it("puts the negative posts that are spreading under attention, and the most seen on top", () => {
    expect(deck.attention.map((m) => m.url)).toEqual(["https://x/neg"]);
    expect(deck.top[0].reach).toBe(4_000);
  });

  it("keeps a day per day of the period", () => {
    expect(deck.days).toHaveLength(30);
    expect(deck.days[1].positive).toBe(1);
    expect(deck.days[2].negative).toBe(1);
  });
});
