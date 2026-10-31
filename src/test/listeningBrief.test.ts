import { describe, expect, it } from "vitest";
import {
  ACT_VIEWS, MIN_READ_SHARE, NEEDS_YOU_MAX, NEEDS_YOU_VIEWS, SPIKE_FACTOR, SPIKE_MIN, WATCH_VIEWS,
  morningView, views, type BriefMention, type BriefTopic,
} from "../../supabase/functions/_shared/listening-brief";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-03T07:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

const topic = (id: string, kind: BriefTopic["kind"], label: string): BriefTopic => ({ id, kind, label, active: true });

let n = 0;
const post = (topic_id: string, extra: Partial<BriefMention> = {}): BriefMention => ({
  id: `m${++n}`, topic_id, source: "tiktok", url: `https://example.test/p/${n}`, title: `Post ${n}`, reach: 100,
  published_at: ago(2), found_at: ago(2), sentiment: "positive", theme: "quality", ...extra,
});
const negative = (extra: Partial<BriefMention> = {}, topic_id = "b") => post(topic_id, { sentiment: "negative", ...extra });
const yesterday = { published_at: ago(30), found_at: ago(30) };

const brand = topic("b", "brand", "Sample Brand");
const brandPack = topic("b2", "brand", "Sample Brand Pack");
const rival = topic("r", "competitor", "Rival A");
const category = topic("c", "category", "Cooking oil");
const topics = [brand, brandPack, rival, category];

const view = (mentions: BriefMention[], over: Partial<Parameters<typeof morningView>[0]> = {}) =>
  morningView({ brandName: "Sample Brand", topics, mentions, now: NOW, loadedFrom: NOW - 30 * DAY, ...over });

/** Negative brand posts in the week before the last day, one every two hours from 36 hours back. */
const lastWeek = (count: number) =>
  Array.from({ length: count }, (_, i) => negative({ reach: 10, published_at: ago(36 + 2 * i), found_at: ago(36 + 2 * i) }));
const today = (count: number) =>
  Array.from({ length: count }, (_, i) => negative({ reach: 10, published_at: ago(1 + i), found_at: ago(1 + i) }));

describe("morningView: the verdict", () => {
  it("says Act when a negative brand post has 50,000 views in the last day", () => {
    const v = view([negative({ reach: ACT_VIEWS }), post("b")]);
    expect(v.verdict.level).toBe("act");
    expect(v.verdict.headline).toMatch(/negative post about Sample Brand/);
    expect(v.verdict.headline).toMatch(/50k/);
  });

  it("says Watch at 5,000 views, and clear just below it", () => {
    expect(view([negative({ reach: WATCH_VIEWS })]).verdict.level).toBe("watch");
    const calm = view([negative({ reach: WATCH_VIEWS - 1 }), post("b"), post("b")]);
    expect(calm.verdict.level).toBe("clear");
    expect(calm.verdict.headline).toMatch(/Nothing needs you/);
  });

  it("ignores negative posts that are older than a day, or about a competitor or the category", () => {
    const v = view([
      negative({ reach: 90_000, ...yesterday }),
      negative({ reach: 90_000 }, "r"),
      negative({ reach: 90_000 }, "c"),
      post("b"), post("b"),
    ]);
    expect(v.verdict.level).toBe("clear");
    expect(v.needsYou).toEqual([]);
  });

  it("reads a post's time from published_at, and from found_at when there is none", () => {
    const v = view([negative({ reach: 60_000, published_at: null, found_at: ago(3) })]);
    expect(v.verdict.level).toBe("act");
    const old = view([negative({ reach: 60_000, published_at: null, found_at: ago(40) })]);
    expect(old.verdict.level).not.toBe("act");
  });

  it("says Watch when negative posts spike against the week before", () => {
    expect(SPIKE_MIN).toBe(5);
    expect(SPIKE_FACTOR).toBe(3);
    const v = view([...today(6), ...lastWeek(7), post("b")]);
    expect(v.verdict.level).toBe("watch");
    expect(v.verdict.headline).toMatch(/6 negative posts/);
  });

  it("does not call it a spike under 5 posts, or at less than 3 times the usual", () => {
    expect(view([...today(4), ...lastWeek(7), post("b")]).verdict.level).toBe("clear");
    // a usual 14 a day makes 6 a quiet day, not a spike
    const busyWeek = Array.from({ length: 98 }, (_, i) =>
      negative({ reach: 10, published_at: ago(30 + i), found_at: ago(30 + i) }));
    expect(view([...today(6), ...busyWeek, post("b")]).verdict.level).toBe("clear");
  });

  it("has no spike rule when the week before is not loaded", () => {
    const v = view([...today(6), post("b")], { loadedFrom: NOW - 3 * DAY });
    expect(v.verdict.level).toBe("clear");
  });

  it("reports the spike with the usual day, and null when there is none", () => {
    expect(view([...today(6), ...lastWeek(7), post("b")]).spike).toEqual({ now: 6, usual: 1 });
    expect(view([...today(4), ...lastWeek(7), post("b")]).spike).toBeNull();
    expect(view([...today(6), post("b")], { loadedFrom: NOW - 3 * DAY }).spike).toBeNull();
  });

  it("is not sure when nothing was posted", () => {
    const v = view([]);
    expect(v.verdict.level).toBe("unsure");
    expect(v.verdict.headline).toMatch(/No posts about Sample Brand/);
  });

  it("is not sure when less than half of the day's posts are read", () => {
    expect(MIN_READ_SHARE).toBe(0.5);
    const v = view([post("b"), post("b", { sentiment: null }), post("b", { sentiment: null }), post("b", { sentiment: null })]);
    expect(v.verdict.level).toBe("unsure");
    expect(v.verdict.headline).toMatch(/3 of 4 posts about Sample Brand are still to be read/);
    expect(v.unread).toBe(3);
  });

  it("still says Act when a big negative post is read among unread ones", () => {
    const v = view([negative({ reach: 80_000 }), post("b", { sentiment: null }), post("b", { sentiment: null })]);
    expect(v.verdict.level).toBe("act");
  });

  it("never reads a missing view count as 0", () => {
    const v = view([
      negative({ source: "instagram", reach: null }),
      post("b", { source: "instagram", reach: null }),
      post("b", { source: "tiktok", reach: 200 }),
    ]);
    expect(v.verdict.level).toBe("clear");
    expect(v.needsYou).toEqual([]);
    expect(v.noViews).toEqual(["instagram"]);
  });
});

describe("morningView: what needs you", () => {
  it("lists at most 3 posts, most seen first, from 1,000 views", () => {
    expect(NEEDS_YOU_MAX).toBe(3);
    expect(NEEDS_YOU_VIEWS).toBe(1_000);
    const v = view([
      negative({ reach: 2_000, title: "B" }),
      negative({ reach: 9_000, title: "A" }),
      negative({ reach: 999, title: "tiny" }),
      negative({ reach: 1_500, title: "C" }),
      negative({ reach: 1_200, title: "D" }),
    ]);
    expect(v.needsYou.map((x) => x.mention.title)).toEqual(["A", "B", "C"]);
    expect(v.needsYou.map((x) => x.views)).toEqual([9_000, 2_000, 1_500]);
    expect(v.needsYou.every((x) => x.move === "Respond")).toBe(true);
  });
});

describe("morningView: the tiles", () => {
  it("counts a post two brand keywords found once, and ignores off-topic ones", () => {
    const shared = "https://example.test/shared";
    const v = view([post("b", { url: shared }), post("b2", { url: shared }), post("b", { theme: "off-topic" }), post("b")]);
    expect(v.posts.now).toBe(2);
  });

  it("works out posts, mood and share against rivals, now and the day before", () => {
    const v = view([
      post("b"), post("b"), post("b"), negative({ reach: 10 }),
      post("r"), post("r"), post("r"), post("r"),
      post("b", yesterday), post("b", { sentiment: "neutral", ...yesterday }),
      ...Array.from({ length: 6 }, () => post("r", yesterday)),
    ]);
    expect(v.posts).toEqual({ now: 4, before: 2 });
    expect(v.mood).toEqual({ now: 75, before: 50 });
    expect(v.share).toEqual({ now: 50, before: 25 });
  });

  it("gives null, not 0, when there is nothing to work a figure out from", () => {
    const v = view([post("b", { sentiment: null })]);
    expect(v.mood).toEqual({ now: null, before: null });
    expect(v.share).toEqual({ now: 100, before: null });
  });
});

describe("morningView: around the category", () => {
  it("lists category keywords by posts in the last day with their net mood", () => {
    const oil = topic("c", "category", "Cooking oil");
    const flour = topic("c2", "category", "Flour");
    const idle = topic("c3", "category", "Sugar");
    const v = morningView({
      brandName: "Sample Brand", topics: [brand, oil, flour, idle], now: NOW, loadedFrom: NOW - 30 * DAY,
      mentions: [
        post("c", { sentiment: "negative" }), post("c", { sentiment: "negative" }), post("c", { sentiment: "positive" }),
        post("c2", { sentiment: "positive" }),
        post("c", yesterday),
        post("c", { theme: "off-topic" }),
      ],
    });
    expect(v.category).toEqual([
      { label: "Cooking oil", posts: 3, before: 1, net: -33 },
      { label: "Flour", posts: 1, before: 0, net: 100 },
    ]);
  });
});

describe("views", () => {
  it("writes view counts the short way", () => {
    expect(views(950)).toBe("950");
    expect(views(5_000)).toBe("5k");
    expect(views(12_345)).toBe("12.3k");
    expect(views(50_000)).toBe("50k");
    expect(views(1_200_000)).toBe("1.2M");
  });
});
