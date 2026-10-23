import { describe, expect, it } from "vitest";
import {
  buildDataNotes,
  buildInsights,
  contributions,
  formatAge,
  periodDelta,
  platformFreshness,
  readingSummary,
  viewsAt,
  weeklyCumulative,
  type ReportPost,
} from "@/lib/reportInsights";

const NOW = Date.parse("2026-10-23T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

const post = (id: string, platform: string, creator: string, history: [string, number][]): ReportPost => ({
  id,
  platform,
  influencer_id: creator.toLowerCase(),
  creator,
  posted_at: daysAgo(30),
  history: history.map(([captured_at, views]) => ({ captured_at, views, likes: Math.round(views / 10) })),
});

// A typical shape: TikTok refreshed today, Instagram a week old,
// Facebook six weeks old with one post never measured.
const posts: ReportPost[] = [
  post("t1", "tiktok", "Amani", [[daysAgo(14), 600_000], [daysAgo(6), 800_000], [hoursAgo(2), 1_000_000]]),
  post("t2", "tiktok", "Baraka", [[daysAgo(14), 300_000], [hoursAgo(3), 400_000]]),
  post("i1", "instagram", "Amani", [[daysAgo(7), 100_000]]),
  post("f1", "facebook", "Chebet", [[daysAgo(45), 50_000]]),
  post("f2", "facebook", "Chebet", []),
];

describe("platformFreshness", () => {
  it("rates each platform by its typical latest reading, and counts unmeasured posts", () => {
    const byPlatform = Object.fromEntries(platformFreshness(posts, NOW).map((p) => [p.platform, p]));
    expect(byPlatform.tiktok).toMatchObject({ posts: 2, measured: 2, status: "fresh" });
    expect(byPlatform.instagram).toMatchObject({ posts: 1, measured: 1, status: "stale" });
    expect(byPlatform.facebook).toMatchObject({ posts: 2, measured: 1, status: "stale" });
    expect(Math.round(byPlatform.instagram.ageHours!)).toBe(7 * 24);
  });

  it("marks a platform with no readings at all as missing", () => {
    const [yt] = platformFreshness([post("y1", "youtube", "Dalia", [])], NOW);
    expect(yt).toMatchObject({ platform: "youtube", measured: 0, status: "missing", ageHours: null });
  });
});

describe("viewsAt and periodDelta", () => {
  it("uses the highest reading each post had by the cut-off time", () => {
    expect(viewsAt(posts, NOW)).toBe(1_000_000 + 400_000 + 100_000 + 50_000);
    expect(viewsAt(posts, Date.parse(daysAgo(10)))).toBe(600_000 + 300_000 + 50_000);
  });

  it("reports views recorded in the last N days", () => {
    const d = periodDelta(posts, 7, NOW);
    expect(d.current).toBe(1_550_000);
    expect(d.previous).toBe(600_000 + 300_000 + 50_000);
    expect(d.delta).toBe(600_000);
    expect(d.pct).toBeCloseTo(600_000 / 950_000, 5);
  });
});

describe("weeklyCumulative", () => {
  it("returns running totals ending now, dropping weeks before the first reading", () => {
    const weeks = weeklyCumulative(posts, 12, NOW);
    expect(weeks[weeks.length - 1]).toMatchObject({ value: 1_550_000, current: true });
    expect(weeks.every((w, i) => i === 0 || w.value >= weeks[i - 1].value)).toBe(true);
    expect(weeks[0].value).toBeGreaterThan(0);
    expect(weeks.length).toBe(7);
  });
});

describe("contributions", () => {
  it("ranks creators by views with a platform split, shares adding up to one", () => {
    const rows = contributions(posts, NOW);
    expect(rows.map((r) => r.label)).toEqual(["Amani", "Baraka", "Chebet"]);
    expect(rows[0]).toMatchObject({ views: 1_100_000, posts: 2, platforms: { tiktok: 1_000_000, instagram: 100_000 } });
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 6);
  });
});

describe("buildInsights", () => {
  it("leads with the strongest pattern and never returns more than three", () => {
    const insights = buildInsights(posts, NOW);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(3);
    expect(insights[0].id).toBe("platform");
    expect(insights[0].headline).toMatch(/TikTok/);
    for (const i of insights) expect(`${i.headline} ${i.body}`).not.toMatch(/—/);
  });

  it("returns nothing for a campaign without readings", () => {
    expect(buildInsights([post("x", "tiktok", "A", [])], NOW)).toEqual([]);
  });
});

describe("buildDataNotes", () => {
  it("tells the client which platforms are current and which are not", () => {
    const notes = buildDataNotes({ posts, now: NOW, view: "client", audience: { measured: 0, creators: 3 } });
    const titles = notes.map((n) => n.title);
    expect(titles).toContain("TikTok figures are current");
    expect(titles).toContain("Instagram figures are 7 days old");
    expect(titles).toContain("Facebook figures are 45 days old");
    expect(titles).toContain("1 post not measured yet");
    expect(titles).toContain("Audience is estimated");
    expect(notes.find((n) => n.title.startsWith("Instagram"))?.tone).toBe("bad");
    expect(titles.some((t) => /refresh is paused/i.test(t))).toBe(false);
  });

  it("warns the agency when a draft campaign is skipped by the scheduled refresh", () => {
    const notes = buildDataNotes({ posts, now: NOW, view: "agency", campaignStatus: "draft" });
    expect(notes[0]).toMatchObject({ tone: "bad", title: "Scheduled refresh is paused" });
  });
});

describe("readingSummary", () => {
  it("counts posts read recently instead of quoting the single newest reading", () => {
    expect(readingSummary(posts, NOW)).toMatchObject({ total: 5, measured: 4, recent: 2, label: "2 of 5 posts read in the last 36 hours" });
  });

  it("says so plainly when everything is current or nothing has been read", () => {
    const fresh = [post("a", "tiktok", "A", [[hoursAgo(1), 10]])];
    expect(readingSummary(fresh, NOW).label).toBe("All posts read in the last 36 hours");
    expect(readingSummary([post("b", "tiktok", "B", [])], NOW).label).toBe("No readings yet");
  });
});

describe("formatAge", () => {
  it("reads naturally at each scale", () => {
    expect(formatAge(0.2)).toBe("just now");
    expect(formatAge(5)).toBe("5 hours ago");
    expect(formatAge(30)).toBe("yesterday");
    expect(formatAge(24 * 7)).toBe("7 days ago");
  });
});
