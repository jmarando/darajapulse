import { describe, expect, it } from "vitest";
import { buildMetricTiles, estimatedMetrics } from "@/lib/metricTiles";

const totals = { views: 27_700_000, likes: 2_000_000, comments: 35_000, shares: 74_000, saves: 120_000, reach: 18_800_000, er: 8.1 };
const none = { shares: false, saves: false, reach: false };

describe("buildMetricTiles", () => {
  it("lists the figures in order and formats them the way the overview does", () => {
    const tiles = buildMetricTiles(totals, true, none);
    expect(tiles.map((t) => t.label)).toEqual(["Views", "Likes", "Comments", "Engagement", "Shares", "Saves", "Reach"]);
    expect(tiles.map((t) => t.value)).toEqual(["27.7M", "2M", "35K", "8.1%", "74K", "120K", "18.8M"]);
    expect(tiles.every((t) => t.available && !t.estimated)).toBe(true);
  });

  it("shows dashes until the numbers have loaded", () => {
    const tiles = buildMetricTiles(totals, false, none);
    expect(tiles.every((t) => t.value === "—" && !t.available)).toBe(true);
  });

  it("treats shares, saves and reach of zero as not reported", () => {
    const tiles = buildMetricTiles({ ...totals, shares: 0, saves: 0, reach: 0 }, true, none);
    const by = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(by.shares.available).toBe(false);
    expect(by.saves.available).toBe(false);
    expect(by.reach.available).toBe(false);
    expect(by.views.available).toBe(true);
    expect(by.likes.available).toBe(true);
  });

  it("marks what is estimated, and engagement when it includes estimated shares or saves", () => {
    const by = (e: typeof none) => Object.fromEntries(buildMetricTiles(totals, true, e).map((t) => [t.key, t.estimated]));
    expect(by({ shares: false, saves: false, reach: true })).toMatchObject({ reach: true, shares: false, saves: false, engagement: false, views: false });
    expect(by({ shares: true, saves: false, reach: false })).toMatchObject({ shares: true, engagement: true, reach: false });
    expect(by({ shares: false, saves: true, reach: false })).toMatchObject({ saves: true, engagement: true });
  });
});

describe("buildMetricTiles with nothing to show", () => {
  it("does not tag a dash as estimated", () => {
    const tiles = buildMetricTiles({ ...totals, reach: 0 }, true, { shares: false, saves: false, reach: true });
    const reach = tiles.find((t) => t.key === "reach")!;
    expect(reach.available).toBe(false);
    expect(reach.estimated).toBe(false);
  });
});

describe("estimatedMetrics", () => {
  it("reports which figures were filled in for any post", () => {
    expect(estimatedMetrics([{ estimated_fields: { shares: true } }, {}, { estimated_fields: { reach: true } }])).toEqual({ shares: true, saves: false, reach: true });
  });

  it("reports nothing when every figure was reported", () => {
    expect(estimatedMetrics([{}, { estimated_fields: {} }])).toEqual(none);
    expect(estimatedMetrics([])).toEqual(none);
  });
});
