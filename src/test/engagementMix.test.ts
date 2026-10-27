import { describe, expect, it } from "vitest";
import { buildEngagementMix } from "@/lib/engagementMix";

const totals = { likes: 483_000, comments: 19_000, shares: 37_000, saves: 33_000 };

describe("buildEngagementMix", () => {
  it("lists likes, comments, shares and saves with their part of all interactions", () => {
    const mix = buildEngagementMix(totals, {})!;
    expect(mix.total).toBe(572_000);
    expect(mix.parts.map((p) => p.label)).toEqual(["Likes", "Comments", "Shares", "Saves"]);
    expect(mix.parts.map((p) => p.value)).toEqual([483_000, 19_000, 37_000, 33_000]);
    expect(mix.parts[0].share).toBeCloseTo(483_000 / 572_000);
    expect(mix.parts.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1);
  });

  it("works out how much of it is saves and shares, the signals of stronger intent", () => {
    const mix = buildEngagementMix(totals, {})!;
    expect(mix.intent).toBe(70_000);
    expect(mix.intentShare).toBeCloseTo(70_000 / 572_000);
  });

  it("marks shares and saves that were filled in, but only where there is a figure", () => {
    const mix = buildEngagementMix({ ...totals, saves: 0 }, { shares: true, saves: true })!;
    expect(Object.fromEntries(mix.parts.map((p) => [p.key, p.estimated]))).toEqual({ likes: false, comments: false, shares: true, saves: false });
  });

  it("leaves reported figures unmarked", () => {
    const mix = buildEngagementMix(totals, { shares: false, saves: false })!;
    expect(mix.parts.every((p) => !p.estimated)).toBe(true);
  });

  it("returns nothing when there are no interactions", () => {
    expect(buildEngagementMix({ likes: 0, comments: 0, shares: 0, saves: 0 }, {})).toBeNull();
  });
});
