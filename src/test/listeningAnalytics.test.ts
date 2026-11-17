import { describe, expect, it } from "vitest";
import {
  keyMetrics, moodPeaks, moodVerdict, percentChange, phraseTable, popularPhrases, topVoices,
} from "@/lib/listeningAnalytics";
import { totals, type ListeningMention, type MoodDay } from "@/lib/listening";

let n = 0;
const post = (extra: Partial<ListeningMention> = {}): ListeningMention => ({
  id: `m${++n}`, topic_id: "b", source: "tiktok", url: `https://x/${n}`, title: null, snippet: null, author: null,
  reach: null, shares: null, published_at: null, found_at: "2026-11-10T10:00:00Z", sentiment: null, sentiment_score: null, theme: null,
  ...extra,
});

const said = (text: string, extra: Partial<ListeningMention> = {}) => post({ snippet: text, ...extra });

describe("percentChange", () => {
  it("rounds the change from the period before to a whole percent", () => {
    expect(percentChange(85, 272)).toBe(-69);
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(0, 10)).toBe(-100);
  });

  it("has nothing to compare with when the period before was empty", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe("keyMetrics", () => {
  it("adds up posts, views, shares and creators for both periods", () => {
    const now = [
      post({ reach: 1000, shares: 10, author: "@ama" }),
      post({ reach: null, shares: null, author: " @Ama " }),
      post({ reach: 500, shares: 5, author: "@baraka" }),
      post({ author: null }),
    ];
    const before = [post({ reach: 1000, shares: 0, author: "@ama" })];
    expect(keyMetrics(now, before)).toEqual({
      mentions: { value: 4, previous: 1, change: 300 },
      views: { value: 1500, previous: 1000, change: 50 },
      shares: { value: 15, previous: 0, change: null },
      creators: { value: 2, previous: 1, change: 100 },
    });
  });
});

describe("moodPeaks", () => {
  const day = (d: string, positive: number, neutral: number, negative: number): MoodDay => ({ day: d, positive, neutral, negative });

  it("finds the most positive and most negative day, the later one on a tie", () => {
    const peaks = moodPeaks([day("2026-11-01", 2, 1, 0), day("2026-11-02", 5, 0, 1), day("2026-11-03", 5, 2, 3), day("2026-11-04", 0, 0, 0)]);
    expect(peaks.positive?.day).toBe("2026-11-03");
    expect(peaks.negative?.day).toBe("2026-11-03");
  });

  it("marks no day when no post had that mood", () => {
    const peaks = moodPeaks([day("2026-11-01", 2, 1, 0), day("2026-11-02", 1, 0, 0)]);
    expect(peaks.positive?.day).toBe("2026-11-01");
    expect(peaks.negative).toBeNull();
  });
});

describe("moodVerdict", () => {
  const rated = (positive: number, neutral: number, negative: number) =>
    totals([
      ...Array.from({ length: positive }, () => post({ sentiment: "positive" })),
      ...Array.from({ length: neutral }, () => post({ sentiment: "neutral" })),
      ...Array.from({ length: negative }, () => post({ sentiment: "negative" })),
    ]);

  it("names the mood that holds at least half of the posts read", () => {
    expect(moodVerdict(rated(6, 3, 1))).toBe("Mostly positive");
    expect(moodVerdict(rated(2, 5, 3))).toBe("Mostly neutral");
    expect(moodVerdict(rated(1, 1, 2))).toBe("Mostly negative");
  });

  it("calls it mixed when no mood holds half, or two moods hold half each", () => {
    expect(moodVerdict(rated(4, 4, 2))).toBe("Mixed");
    expect(moodVerdict(rated(2, 0, 2))).toBe("Mixed");
  });

  it("says nothing before any post is read", () => {
    expect(moodVerdict(totals([post()]))).toBeNull();
  });
});

describe("popularPhrases", () => {
  it("counts a two-word phrase once per post and keeps phrases seen in two posts or more", () => {
    const phrases = popularPhrases([
      said("Masala chai for chapati night. Masala chai forever!"),
      said("Best masala chai ever"),
      said("Chapati night again"),
    ]);
    expect(phrases).toEqual([
      { phrase: "chapati night", posts: 2 },
      { phrase: "masala chai", posts: 2 },
    ]);
  });

  it("keeps phrases from a single post when asked, for comparing with the period before", () => {
    expect(popularPhrases([said("masala chai")], 1)).toEqual([{ phrase: "masala chai", posts: 1 }]);
    expect(popularPhrases([said("masala chai")])).toEqual([]);
  });

  it("puts the phrases in more posts first", () => {
    const phrases = popularPhrases([said("masala chai"), said("masala chai"), said("masala chai"), said("chapati night"), said("chapati night")]);
    expect(phrases.map((p) => p.phrase)).toEqual(["masala chai", "chapati night"]);
  });

  it("lets a number break a phrase", () => {
    const phrases = popularPhrases([said("Masala chai 2026 deal"), said("masala chai 2026 deal")]);
    expect(phrases.map((p) => p.phrase)).toEqual(["masala chai"]);
  });

  it("does not join words across a full stop, a comma or a line break", () => {
    const phrases = popularPhrases([
      said("Market day. Street food"),
      said("market day, street food\nnew"),
    ]);
    expect(phrases.map((p) => p.phrase)).toEqual(["market day", "street food"]);
  });

  it("lets an English or Kiswahili filler word break a phrase rather than join one", () => {
    const phrases = popularPhrases([
      said("chapati na masala chai"),
      said("the chapati and the masala chai"),
    ]);
    expect(phrases.map((p) => p.phrase)).toEqual(["masala chai"]);
  });

  it("counts hashtags on their own and leaves out the ones every video carries", () => {
    const noise = "#fyp #FYPシ #foryoupage #viral #goviral #KenyanTikTok #CreatorSearchInsights #capcut";
    const phrases = popularPhrases([
      said(`#NuruMornings with friends ${noise}`),
      said(`#nurumornings with friends ${noise}`),
    ]);
    expect(phrases).toEqual([{ phrase: "#nurumornings", posts: 2 }]);
  });

  it("ignores links and @handles", () => {
    const phrases = popularPhrases([
      said("recipe https://example.com/abc @chef_ken masala chai"),
      said("@chef_ken recipe masala chai"),
    ]);
    expect(phrases.map((p) => p.phrase)).toEqual(["masala chai"]);
  });

  it("reads both the title and the description, counting a phrase in both once", () => {
    const phrases = popularPhrases([
      post({ source: "youtube", title: "Sunday lunch", snippet: "Masala chai magic" }),
      post({ source: "reddit", title: "Masala chai price", snippet: "Is it fair?" }),
      post({ source: "youtube", title: "Masala chai magic", snippet: "Masala chai magic and more" }),
    ]);
    expect(phrases).toEqual([
      { phrase: "masala chai", posts: 3 },
      { phrase: "chai magic", posts: 2 },
    ]);
  });
});

describe("phraseTable", () => {
  it("scores the top phrases against the first and compares each with the period before", () => {
    const rows = phraseTable(
      [{ phrase: "masala chai", posts: 8 }, { phrase: "#nurucoffee", posts: 4 }, { phrase: "street food", posts: 2 }],
      [{ phrase: "masala chai", posts: 10 }, { phrase: "#nurucoffee", posts: 4 }],
    );
    expect(rows).toEqual([
      { phrase: "masala chai", posts: 8, previous: 10, change: -20, score: 100 },
      { phrase: "#nurucoffee", posts: 4, previous: 4, change: 0, score: 50 },
      { phrase: "street food", posts: 2, previous: 0, change: null, score: 25 },
    ]);
  });

  it("keeps only as many rows as asked for", () => {
    const rows = phraseTable([{ phrase: "a b", posts: 3 }, { phrase: "c d", posts: 2 }], [], 1);
    expect(rows.map((r) => r.phrase)).toEqual(["a b"]);
  });
});

describe("topVoices", () => {
  it("groups each author's posts, ranks by views and points at their most-seen post", () => {
    const voices = topVoices([
      post({ author: "@chef", reach: 1000, url: "https://t/1" }),
      post({ author: "@Chef", reach: 5000, url: "https://t/2", sentiment: "negative" }),
      post({ author: "Food Channel", source: "youtube", reach: 3000, url: "https://y/1" }),
      post({ author: "u/foodie", source: "reddit", url: "https://r/1" }),
      post({ author: "u/foodie", source: "reddit", url: "https://r/2" }),
      post({ author: null, reach: 90_000 }),
    ]);
    expect(voices.map((v) => [v.author, v.source, v.posts, v.views, v.viewsKnown, v.topUrl, v.negative])).toEqual([
      ["@chef", "tiktok", 2, 6000, true, "https://t/2", 1],
      ["Food Channel", "youtube", 1, 3000, true, "https://y/1", 0],
      ["u/foodie", "reddit", 2, 0, false, "https://r/1", 0],
    ]);
  });

  it("keeps only as many voices as asked for", () => {
    const voices = topVoices([post({ author: "@a", reach: 1 }), post({ author: "@b", reach: 2 })], 1);
    expect(voices.map((v) => v.author)).toEqual(["@b"]);
  });
});
