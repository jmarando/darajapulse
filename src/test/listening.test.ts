import { describe, expect, it } from "vitest";
import {
  OFF_TOPIC, dayKey, moodByDay, moodShare, needsAttention, netMood, parseTerms, platformMix, shareOfVoice, sweepStatus,
  themes, topMentions, totals, weekChange, withinDays,
  type ListeningMention, type ListeningTopic,
} from "@/lib/listening";

const topic = (id: string, kind: ListeningTopic["kind"], label = id): ListeningTopic => ({
  id, client_id: "c1", kind, label, query: label, exclude_terms: [], active: true, last_scanned_at: null, last_note: null, created_at: "2026-10-01T00:00:00Z",
});

let n = 0;
const mention = (topic_id: string, extra: Partial<ListeningMention> = {}): ListeningMention => ({
  id: `m${++n}`, topic_id, source: "tiktok", url: `https://x/${n}`, title: null, snippet: null, author: null,
  reach: null, shares: null, published_at: null, found_at: "2026-10-26T10:00:00Z", sentiment: null, sentiment_score: null, theme: null,
  ...extra,
});

const brand = topic("b", "brand", "Us");
const rival = topic("r", "competitor", "Them");
const cat = topic("c", "category", "Soda");

describe("share of voice", () => {
  const tag = topic("b2", "brand", "#Us");
  const paused = { ...topic("p", "competitor", "Old rival"), active: false };

  it("makes the brand's keywords one voice, counting a post both found once, and leaves categories out", () => {
    const rows = shareOfVoice([brand, tag, rival, cat, paused], [
      mention("b", { url: "same" }), mention("b2", { url: "same" }), mention("b"), mention("b2"),
      mention("r"),
      mention("r", { theme: OFF_TOPIC }),
      mention("c"), mention("c"),
    ], "Nuru");
    expect(rows.map((r) => [r.label, r.kind, r.mentions, r.share])).toEqual([["Nuru", "brand", 3, 75], ["Them", "competitor", 1, 25]]);
  });

  it("shows zero shares rather than dividing by zero when nothing was found", () => {
    expect(shareOfVoice([brand, rival], [], "Nuru").map((r) => r.share)).toEqual([0, 0]);
  });

  it("gives each voice its own net mood", () => {
    const [us] = shareOfVoice([brand], [mention("b", { sentiment: "positive" }), mention("b", { sentiment: "negative" }), mention("b", { sentiment: "positive" }), mention("b")], "Nuru");
    expect(us.net).toBe(33);
  });
});

describe("mood", () => {
  it("counts only rated posts in the shares", () => {
    const t = totals([mention("b", { sentiment: "negative", reach: 100 }), mention("b", { sentiment: "neutral", reach: 50 }), mention("b")]);
    expect(t).toMatchObject({ mentions: 3, rated: 2, negative: 1, reach: 150 });
    expect(moodShare(t, "negative")).toBe(50);
    expect(netMood(t)).toBe(-50);
    expect(netMood(totals([mention("b")]))).toBeNull();
  });

  it("buckets rated posts by the day they were published, keeping empty days", () => {
    const now = new Date(2026, 9, 27, 15);
    const days = moodByDay([
      mention("b", { sentiment: "positive", published_at: new Date(2026, 9, 27, 9).toISOString() }),
      mention("b", { sentiment: "negative", published_at: new Date(2026, 9, 25, 9).toISOString() }),
      mention("b", { sentiment: "negative", published_at: new Date(2026, 8, 1).toISOString() }),
      mention("b", { published_at: new Date(2026, 9, 27, 9).toISOString() }),
    ], 3, now);
    expect(days).toEqual([
      { day: dayKey(new Date(2026, 9, 25)), positive: 0, neutral: 0, negative: 1 },
      { day: dayKey(new Date(2026, 9, 26)), positive: 0, neutral: 0, negative: 0 },
      { day: dayKey(new Date(2026, 9, 27)), positive: 1, neutral: 0, negative: 0 },
    ]);
  });

  it("keeps posts inside the window by publish date, else by when they were found", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    const list = withinDays([
      mention("b", { published_at: "2026-10-01T00:00:00Z", found_at: "2026-10-26T00:00:00Z" }),
      mention("b", { found_at: "2026-10-25T00:00:00Z" }),
    ], 7, now);
    expect(list).toHaveLength(1);
  });
});

describe("themes and attention", () => {
  it("ranks themes and leaves off-topic posts out", () => {
    const rows = themes([
      mention("b", { theme: "price", sentiment: "negative" }),
      mention("b", { theme: "price", sentiment: "negative" }),
      mention("b", { theme: "taste", sentiment: "positive" }),
      mention("b", { theme: OFF_TOPIC }),
    ]);
    expect(rows).toEqual([
      { theme: "price", mentions: 2, negative: 2, positive: 0 },
      { theme: "taste", mentions: 1, negative: 0, positive: 1 },
    ]);
  });

  it("flags the most-seen negative posts about the brand, not competitors", () => {
    const list = needsAttention([brand, rival], [
      mention("b", { sentiment: "negative", reach: 10 }),
      mention("b", { sentiment: "negative", reach: 900, id: "big" }),
      mention("r", { sentiment: "negative", reach: 5000 }),
      mention("b", { sentiment: "negative", reach: 9000, theme: OFF_TOPIC }),
      mention("b", { sentiment: "positive", reach: 9000 }),
    ]);
    expect(list.map((m) => m.id)[0]).toBe("big");
    expect(list).toHaveLength(2);
  });
});

it("parses comma-separated exclude terms", () => {
  expect(parseTerms(" jobs, vacancy ,, jobs ,")).toEqual(["jobs", "vacancy"]);
});

describe("the week so far", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");

  it("compares the last seven days with the seven before", () => {
    const rows = weekChange([
      mention("b", { found_at: "2026-10-26T00:00:00Z" }),
      mention("b", { found_at: "2026-10-24T00:00:00Z" }),
      mention("b", { found_at: "2026-10-20T00:00:00Z" }),
      mention("b", { found_at: "2026-10-19T00:00:00Z" }),
      mention("b", { found_at: "2026-10-01T00:00:00Z" }),
    ], now);
    expect(rows).toEqual({ current: 2, previous: 2, delta: 0 });
  });

  it("uses the publish date when the platform gives one", () => {
    expect(weekChange([mention("b", { published_at: "2026-10-26T00:00:00Z", found_at: "2026-10-27T00:00:00Z" })], now)).toEqual({
      current: 1, previous: 0, delta: 1,
    });
  });
});

describe("platform mix", () => {
  it("counts a post once even when two keywords found it, and shares by post", () => {
    const rows = platformMix([
      mention("b", { source: "tiktok", url: "same", reach: 100 }),
      mention("b2", { source: "tiktok", url: "same", reach: 100 }),
      mention("b", { source: "tiktok", url: "tik", reach: 50 }),
      mention("b", { source: "reddit", url: "red" }),
      mention("b", { source: "youtube", url: "yt", reach: 400 }),
    ]);
    expect(rows.map((r) => [r.key, r.mentions, r.reach, r.share, r.viewsKnown])).toEqual([
      ["tiktok", 2, 150, 50, true],
      ["reddit", 1, 0, 25, false],
      ["youtube", 1, 400, 25, true],
    ]);
  });
});

describe("the most seen posts", () => {
  it("dedupes, leaves off-topic posts out, and sorts by views then date", () => {
    const rows = topMentions([
      mention("b", { url: "same", reach: 900, id: "first" }),
      mention("b", { url: "same", reach: 900 }),
      mention("b", { url: "a", reach: 100, found_at: "2026-10-26T00:00:00Z" }),
      mention("b", { url: "b", reach: 100, found_at: "2026-10-27T00:00:00Z" }),
      mention("b", { url: "off", reach: 9000, theme: OFF_TOPIC }),
      mention("b", { url: "none", reach: null, found_at: "2026-10-20T00:00:00Z" }),
    ]);
    expect(rows.map((m) => m.url)).toEqual(["same", "b", "a", "none"]);
  });
});

describe("sweep status", () => {
  it("counts active, paused, unsearched and failing keywords, and finds the latest scan", () => {
    const rows = sweepStatus([
      { ...topic("a", "brand"), last_scanned_at: "2026-10-27T08:00:00Z" },
      { ...topic("b", "competitor"), last_scanned_at: "2026-10-27T10:00:00Z", last_note: "ScrapeCreators is out of credits." },
      { ...topic("c", "brand"), last_scanned_at: null },
      { ...topic("d", "category"), active: false, last_scanned_at: "2026-10-28T09:00:00Z" },
    ]);
    expect(rows).toEqual({ active: 3, paused: 1, never: 1, failing: 1, lastScan: "2026-10-28T09:00:00Z" });
  });
});
