import { describe, expect, it } from "vitest";
import { morningView, type BriefMention, type BriefTopic } from "../../supabase/functions/_shared/listening-brief";
import { nairobiDay, newAlerts, platformName } from "../../supabase/functions/_shared/listening-alerts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-03T07:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

const brand: BriefTopic = { id: "b", kind: "brand", label: "Sample Brand", active: true };

let n = 0;
const post = (extra: Partial<BriefMention> = {}): BriefMention => ({
  id: `m${++n}`, topic_id: "b", source: "tiktok", url: `https://example.test/p/${n}`, title: `Post ${n}`, reach: 100,
  published_at: ago(2), found_at: ago(2), sentiment: "positive", theme: "quality", ...extra,
});
const negative = (extra: Partial<BriefMention> = {}) => post({ sentiment: "negative", ...extra });

const view = (mentions: BriefMention[]) =>
  morningView({ brandName: "Sample Brand", topics: [brand], mentions, now: NOW, loadedFrom: NOW - 30 * DAY });
const alerts = (mentions: BriefMention[], sent: string[] = []) =>
  newAlerts({ view: view(mentions), brandName: "Sample Brand", sent: new Set(sent), now: NOW });

const lastWeek = Array.from({ length: 7 }, (_, i) =>
  negative({ reach: 10, published_at: ago(36 + 2 * i), found_at: ago(36 + 2 * i) }));
const today = Array.from({ length: 6 }, (_, i) =>
  negative({ reach: 10, published_at: ago(1 + i), found_at: ago(1 + i) }));
const A = "https://example.test/a";

describe("newAlerts: posts", () => {
  it("emails a Watch for a negative post at 5,000 views, with the page's own verdict line", () => {
    const mentions = [negative({ reach: 5_000, url: A, title: "Pack complaint" })];
    const a = alerts(mentions)!;
    expect(a.level).toBe("watch");
    expect(a.subject).toBe("Watch: a negative post about Sample Brand has 5k views");
    expect(a.headline).toBe(view(mentions).verdict.headline);
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ key: `watch:${A}`, level: "watch" });
    expect(a.items[0].post).toMatchObject({ title: "Pack complaint", source: "tiktok", views: 5_000, url: A });
  });

  it("emails an Act at 50,000 views", () => {
    const a = alerts([negative({ reach: 50_000, url: A })])!;
    expect(a.level).toBe("act");
    expect(a.subject).toBe("Act: a negative post about Sample Brand has 50k views");
    expect(a.items.map((i) => i.key)).toEqual([`act:${A}`]);
  });

  it("sends nothing below 5,000 views, when all is clear, or when it is not sure", () => {
    expect(alerts([negative({ reach: 4_999 }), post()])).toBeNull();
    expect(alerts([post(), post()])).toBeNull();
    expect(alerts([])).toBeNull();
  });

  it("sends nothing for a post it has already sent", () => {
    expect(alerts([negative({ reach: 9_000, url: A })], [`watch:${A}`])).toBeNull();
  });

  it("sends an Act after a Watch for the same post, and not twice", () => {
    const a = alerts([negative({ reach: 60_000, url: A })], [`watch:${A}`])!;
    expect(a.level).toBe("act");
    expect(a.items.map((i) => i.key)).toEqual([`act:${A}`]);
    expect(alerts([negative({ reach: 60_000, url: A })], [`watch:${A}`, `act:${A}`])).toBeNull();
  });

  it("puts at most 3 posts in one email, most seen first", () => {
    const a = alerts([6_000, 9_000, 7_000, 8_000].map((reach) => negative({ reach })))!;
    expect(a.items.map((i) => i.post!.views)).toEqual([9_000, 8_000, 7_000]);
    expect(a.subject).toBe("Watch: 3 negative posts about Sample Brand are picking up");
  });
});

describe("newAlerts: a spike", () => {
  it("adds one spike item, once per Nairobi day", () => {
    const mentions = [...today, ...lastWeek, post()];
    const a = alerts(mentions)!;
    expect(a.level).toBe("watch");
    expect(a.subject).toBe("Watch: 6 negative posts about Sample Brand in the last day");
    expect(a.items.map((i) => i.key)).toEqual(["spike:2026-11-03"]);
    expect(a.items[0].spike).toEqual({ now: 6, usual: 1 });
    expect(alerts(mentions, ["spike:2026-11-03"])).toBeNull();
  });

  it("lists a post and a spike together in one email", () => {
    const a = alerts([negative({ reach: 8_000, url: A }), ...today, ...lastWeek])!;
    expect(a.items.map((i) => i.key)).toEqual([`watch:${A}`, "spike:2026-11-03"]);
    expect(a.subject).toBe("Watch: a negative post about Sample Brand has 8k views");
  });
});

describe("platformName", () => {
  it("names a platform the way the page does, and passes an unknown one through", () => {
    expect(platformName("tiktok")).toBe("TikTok");
    expect(platformName("instagram")).toBe("Instagram");
    expect(platformName("youtube")).toBe("YouTube");
    expect(platformName("x")).toBe("X");
    expect(platformName("mastodon")).toBe("mastodon");
  });
});

describe("nairobiDay", () => {
  it("turns over to the next day at 21:00 UTC", () => {
    expect(nairobiDay(Date.parse("2026-11-03T20:59:00Z"))).toBe("2026-11-03");
    expect(nairobiDay(Date.parse("2026-11-03T21:00:00Z"))).toBe("2026-11-04");
  });
});
