import { describe, expect, it } from "vitest";
import { buildPeakMetricsByPost, buildWindowMetricsByPost } from "@/lib/metrics";

const day = (n: number) => new Date(2026, 6, n, 12).toISOString();
const reading = (post_id: string, n: number, figures: Record<string, number>) => ({ post_id, captured_at: day(n), ...figures });

describe("which figures were filled in rather than reported", () => {
  it("marks shares, saves and reach when the platform never reported them", () => {
    const peak = buildPeakMetricsByPost([
      reading("p1", 6, { views: 1000, likes: 0, comments: 0 }),
      reading("p1", 9, { views: 4000, likes: 0, comments: 0 }),
    ]).get("p1")!;
    expect(peak.estimated_fields).toMatchObject({ shares: true, saves: true, reach: true });
    // The figures themselves are the same as before: only the label is new.
    expect(peak.shares).toBe(10);
    expect(peak.saves).toBe(14);
    expect(peak.reach).toBe(2720);
  });

  it("leaves figures the platform reported unmarked", () => {
    const peak = buildPeakMetricsByPost([
      reading("p1", 6, { views: 1000, likes: 50, comments: 5, shares: 12, saves: 7, reach: 900 }),
      reading("p1", 9, { views: 4000, likes: 200, comments: 20, shares: 40, saves: 30, reach: 3100 }),
    ]).get("p1")!;
    expect(peak.estimated_fields.shares).toBeFalsy();
    expect(peak.estimated_fields.saves).toBeFalsy();
    expect(peak.estimated_fields.reach).toBeFalsy();
    expect(peak.shares).toBe(40);
  });

  it("marks a figure when the filled-in value is higher than anything reported", () => {
    const peak = buildPeakMetricsByPost([
      reading("p1", 6, { views: 1000, shares: 2 }),
      reading("p1", 9, { views: 4000, shares: 0 }),
    ]).get("p1")!;
    expect(peak.shares).toBe(10);
    expect(peak.estimated_fields.shares).toBe(true);
  });

  it("leaves a reported figure unmarked when it is the highest", () => {
    const peak = buildPeakMetricsByPost([
      reading("p1", 6, { views: 1000, shares: 500 }),
      reading("p1", 9, { views: 4000, shares: 0 }),
    ]).get("p1")!;
    expect(peak.shares).toBe(500);
    expect(peak.estimated_fields.shares).toBeFalsy();
  });

  it("marks what a window added when those figures were filled in", () => {
    const rows = [
      reading("p1", 6, { views: 1000 }),
      reading("p1", 9, { views: 4000 }),
    ];
    const added = buildWindowMetricsByPost(rows, +new Date(2026, 6, 8), +new Date(2026, 6, 10)).get("p1")!;
    expect(added.views).toBe(3000);
    expect(added.shares).toBeGreaterThan(0);
    expect(added.estimated_fields.shares).toBe(true);
    expect(added.estimated_fields.reach).toBe(true);
  });

  it("leaves what a window added unmarked when the platform reported it", () => {
    const rows = [
      reading("p1", 6, { views: 1000, shares: 100, saves: 40, reach: 800 }),
      reading("p1", 9, { views: 4000, shares: 300, saves: 90, reach: 3000 }),
    ];
    const added = buildWindowMetricsByPost(rows, +new Date(2026, 6, 8), +new Date(2026, 6, 10)).get("p1")!;
    expect(added.shares).toBe(200);
    expect(added.estimated_fields.shares).toBeFalsy();
    expect(added.estimated_fields.saves).toBeFalsy();
    expect(added.estimated_fields.reach).toBeFalsy();
  });

  it("does not mark a figure that added nothing in the window", () => {
    const rows = [
      reading("p1", 6, { views: 1000 }),
      reading("p1", 9, { views: 1000 }),
    ];
    const added = buildWindowMetricsByPost(rows, +new Date(2026, 6, 8), +new Date(2026, 6, 10)).get("p1")!;
    expect(added.views).toBe(0);
    expect(added.shares).toBe(0);
    expect(added.estimated_fields.shares).toBeFalsy();
  });
});
