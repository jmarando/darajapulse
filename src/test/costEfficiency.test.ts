import { describe, expect, it } from "vitest";
import { buildCostEfficiency, formatKes } from "@/lib/costEfficiency";

const person = (id: string, name: string, handle: string, fee_kes: number | null) => ({ id: `ci-${id}`, influencer_id: id, fee_kes, influencers: { full_name: name, handle } });
const stats = (views: number, extra: Partial<Record<"likes" | "comments" | "shares" | "saves" | "posts", number>> = {}) => ({
  views, likes: 0, comments: 0, shares: 0, saves: 0, posts: 1, ...extra,
});

describe("buildCostEfficiency", () => {
  const roster = [
    person("a", "Amani", "@amani.o", 80_000),
    person("b", "Baraka", "baraka", 120_000),
    person("c", "Chebet", "chebet.k", 50_000),
  ];
  const byInfluencer = new Map([
    ["a", stats(400_000, { likes: 20_000, comments: 2_000, shares: 2_000, saves: 1_000 })], // 25,000 interactions
    ["b", stats(2_400_000, { likes: 100_000 })],
    ["c", stats(0)],
  ]);

  it("puts the cheapest views first and the creators with no views last", () => {
    const rows = buildCostEfficiency(roster, byInfluencer, 500_000);
    expect(rows.map((r) => r.name)).toEqual(["Baraka", "Amani", "Chebet"]);
  });

  it("works out the cost of a view, of a thousand views and of an interaction", () => {
    const amani = buildCostEfficiency(roster, byInfluencer, 500_000).find((r) => r.name === "Amani")!;
    expect(amani).toMatchObject({ fee: 80_000, views: 400_000, interactions: 25_000, handle: "amani.o" });
    expect(amani.cpv).toBeCloseTo(0.2);
    expect(amani.cpm).toBeCloseTo(200);
    expect(amani.cpe).toBeCloseTo(3.2);
  });

  it("shows a zero where there is nothing to divide by", () => {
    const chebet = buildCostEfficiency(roster, byInfluencer, 500_000).find((r) => r.name === "Chebet")!;
    expect(chebet).toMatchObject({ views: 0, cpv: 0, cpm: 0, cpe: 0 });
  });

  it("splits the budget evenly when no fees are recorded, and says the fee was worked out", () => {
    const unpaid = [person("a", "Amani", "a", 0), person("b", "Baraka", "b", null)];
    const rows = buildCostEfficiency(unpaid, new Map([["a", stats(1000)], ["b", stats(1000)]]), 1_000_000);
    expect(rows.map((r) => r.fee)).toEqual([500_000, 500_000]);
    expect(rows.every((r) => r.feeFromBudget)).toBe(true);
  });

  it("gives a creator with no recorded fee an even share of what the others were paid", () => {
    const mixed = [person("a", "Amani", "a", 90_000), person("b", "Baraka", "b", 0)];
    const rows = buildCostEfficiency(mixed, new Map([["a", stats(1000)], ["b", stats(1000)]]), 5_000_000);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Amani).toMatchObject({ fee: 90_000, feeFromBudget: false });
    expect(by.Baraka).toMatchObject({ fee: 45_000, feeFromBudget: true });
  });

  it("leaves out creators with no figures, and keeps the first twelve", () => {
    expect(buildCostEfficiency(roster, new Map([["a", stats(10)]]), 100).map((r) => r.name)).toEqual(["Amani"]);
    const many = Array.from({ length: 15 }, (_, i) => person(`p${i}`, `Creator ${i}`, `c${i}`, 1000));
    const manyStats = new Map(many.map((p, i) => [p.influencer_id, stats(1000 + i)]));
    expect(buildCostEfficiency(many, manyStats, 100_000)).toHaveLength(12);
  });
});

describe("formatKes", () => {
  it("writes shillings as the rest of the page does", () => {
    expect(formatKes(1_250_000)).toBe("KES 1.25M");
    expect(formatKes(80_000)).toBe("KES 80K");
    expect(formatKes(950)).toBe("KES 950");
  });
});
