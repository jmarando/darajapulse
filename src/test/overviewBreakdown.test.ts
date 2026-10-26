import { describe, expect, it } from "vitest";
import { campaignBreakdown } from "@/lib/overviewBreakdown";

const rows = (...views: number[]) => views.map((v, i) => ({ id: `c${i}`, name: `Campaign ${i}`, views: v }));

describe("campaignBreakdown", () => {
  it("lists the top five and gathers the rest so the rows add up to the total", () => {
    const b = campaignBreakdown(rows(50, 40, 30, 20, 10, 6, 4), 160, 9)!;
    expect(b.items.map((i) => i.label)).toEqual(["Campaign 0", "Campaign 1", "Campaign 2", "Campaign 3", "Campaign 4", "4 other campaigns"]);
    expect(b.items.at(-1)).toMatchObject({ key: "others", views: 10 });
    expect(b.items.reduce((a, i) => a + i.views, 0)).toBe(160);
    expect(b.items.reduce((a, i) => a + i.share, 0)).toBeCloseTo(1);
  });

  it("shows every campaign, with no 'other' row, when there are five or fewer", () => {
    const b = campaignBreakdown(rows(30, 20), 50, 2)!;
    expect(b.items.map((i) => i.key)).toEqual(["c0", "c1"]);
  });

  it("puts the biggest first however the rows arrive", () => {
    const b = campaignBreakdown(rows(5, 90, 5), 100, 3)!;
    expect(b.items[0]).toMatchObject({ key: "c1", views: 90 });
  });

  it("ignores campaigns without views but still counts them as 'other'", () => {
    const b = campaignBreakdown(rows(60, 0, 0), 60, 8, 1)!;
    expect(b.items.map((i) => i.key)).toEqual(["c0"]);
    expect(b.items[0].share).toBe(1);
  });

  it("returns nothing when no campaign has views", () => {
    expect(campaignBreakdown(rows(0, 0), 0, 2)).toBeNull();
    expect(campaignBreakdown([], 100, 0)).toBeNull();
  });

  it("names the leader, and the top three when there is more beyond them", () => {
    expect(campaignBreakdown(rows(50, 30, 10, 5, 5), 100, 5)!.callout).toBe("Campaign 0 leads with 50% of views. The top three campaigns carry 90%.");
    expect(campaignBreakdown(rows(70, 30), 100, 2)!.callout).toBe("Campaign 0 leads with 70% of views.");
  });
});
