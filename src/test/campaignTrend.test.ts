import { describe, expect, it } from "vitest";
import { buildTrend, metricValue } from "@/lib/campaignTrend";

// Local-time dates in July: no daylight-saving change in most zones, so day buckets are exact.
const at = (month: number, day: number, hour = 10) => new Date(2026, month - 1, day, hour).getTime();
const row = (post_id: string, t: number, values: Record<string, number>) => ({ post_id, captured_at: new Date(t).toISOString(), ...values });
const NOW = at(7, 13, 12);

const metrics = [
  row("a", at(7, 6), { views: 100 }),
  row("a", at(7, 9), { views: 150 }),
  row("a", at(7, 13, 9), { views: 200 }),
  row("b", at(7, 7), { views: 50 }),
  row("b", at(7, 13, 9), { views: 80 }),
];
// Both posts were published months before anything was measured.
const postedAt = [at(3, 27), at(6, 1)];

describe("buildTrend", () => {
  it("returns nothing when there are no readings", () => {
    expect(buildTrend({ metrics: [], postedAt, range: undefined, metric: "views", now: NOW })).toEqual({
      points: [],
      firstReadingAt: null,
      postedBeforeReadings: false,
    });
  });

  it("starts at the first reading, not at the first post", () => {
    const { points, firstReadingAt } = buildTrend({ metrics, postedAt, range: undefined, metric: "views", now: NOW });
    expect(firstReadingAt).toBe(at(7, 6));
    // One bucket per day from 6 to 13 July. Before the first reading nothing was measured,
    // so there is no stretch of zeros for the months the posts were already live.
    expect(points.map((p) => p.v)).toEqual([100, 150, 150, 200, 200, 200, 200, 280]);
    expect(points[0].d).toBe("6 Jul");
    expect(points[7].d).toBe("13 Jul");
  });

  it("says when the posts were published well before the first reading", () => {
    expect(buildTrend({ metrics, postedAt, range: undefined, metric: "views", now: NOW }).postedBeforeReadings).toBe(true);
    expect(buildTrend({ metrics, postedAt: [at(7, 6, 8)], range: undefined, metric: "views", now: NOW }).postedBeforeReadings).toBe(false);
    expect(buildTrend({ metrics, postedAt: [], range: undefined, metric: "views", now: NOW }).postedBeforeReadings).toBe(false);
  });

  it("shows growth inside a chosen window, from what each post had when the window began", () => {
    const range = { from: new Date(2026, 6, 9), to: new Date(2026, 6, 13) };
    const { points } = buildTrend({ metrics, postedAt, range, metric: "views", now: NOW });
    // a had 100 before 9 July and b had 50; by 13 July they added 100 and 30.
    expect(points.map((p) => p.v)).toEqual([50, 50, 50, 50, 130]);
  });

  it("adds likes, comments, shares and saves for engagement", () => {
    const one = [row("a", at(7, 13, 9), { views: 1000, likes: 100, comments: 10, shares: 5, saves: 2 })];
    const { points } = buildTrend({ metrics: one, postedAt: [], range: undefined, metric: "engagement", now: NOW });
    expect(points).toHaveLength(8);
    expect(points[7].v).toBe(117);
    expect(points[0].v).toBe(0);
    expect(points[0].d).toMatch(/^\d\d:00$/);
  });

  it("works through the window in hours when it is a single day", () => {
    const range = { from: new Date(2026, 6, 13), to: new Date(2026, 6, 13) };
    const { points } = buildTrend({ metrics, postedAt, range, metric: "views", now: NOW });
    expect(points).toHaveLength(8);
    expect(points.every((p) => /^\d\d:00$/.test(p.d))).toBe(true);
  });
});

describe("metricValue", () => {
  it("reads a single figure or the engagement total", () => {
    const m = { views: 1000, likes: 100, comments: 10, shares: 5, saves: 2 };
    expect(metricValue(m, "views")).toBe(1000);
    expect(metricValue(m, "saves")).toBe(2);
    expect(metricValue(m, "engagement")).toBe(117);
    expect(metricValue({}, "reach")).toBe(0);
  });
});
