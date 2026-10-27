import { describe, expect, it } from "vitest";
import { buildLeaderboard } from "@/lib/creatorLeaderboard";

const person = (id: string, name: string, handle: string, follower_count: number | null) => ({ id: `ci-${id}`, influencer_id: id, influencers: { full_name: name, handle, follower_count } });
const stats = (views: number, extra: Partial<Record<"likes" | "comments" | "shares" | "saves" | "posts", number>> = {}) => ({
  views, likes: 0, comments: 0, shares: 0, saves: 0, posts: 1, ...extra,
});

const roster = [
  person("a", "Amani", "@amani.o", 100_000),
  person("b", "Baraka", "baraka", 2_000_000),
  person("c", "Chebet", "chebet.k", null),
  person("d", "Dalia", "dalia", 50_000),
];
const byInfluencer = new Map([
  ["a", stats(250_000, { likes: 20_000, posts: 2 })],
  ["b", stats(1_000_000, { likes: 60_000, comments: 4_000, shares: 6_000, saves: 10_000, posts: 3 })],
  ["c", stats(40_000, { likes: 1_000 })],
  // "d" has no figures at all
]);

describe("buildLeaderboard", () => {
  it("ranks the creators by views, the way Top performers does, and gives each their share of the total", () => {
    const rows = buildLeaderboard(roster, byInfluencer, 1_290_000);
    expect(rows.map((r) => r.name)).toEqual(["Baraka", "Amani", "Chebet"]);
    expect(rows[0]).toMatchObject({ posts: 3, views: 1_000_000, handle: "baraka" });
    expect(rows[0].share).toBeCloseTo(1_000_000 / 1_290_000);
    expect(rows[0].rate).toBeCloseTo(8);
  });

  it("works out reach efficiency: views divided by the creator's followers", () => {
    const rows = buildLeaderboard(roster, byInfluencer, 1_290_000);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Amani.followers).toBe(100_000);
    expect(by.Amani.reachEfficiency).toBeCloseTo(2.5); // 250% of their own audience
    expect(by.Baraka.reachEfficiency).toBeCloseTo(0.5);
  });

  it("leaves reach efficiency out when the creator has no follower count", () => {
    const chebet = buildLeaderboard(roster, byInfluencer, 1_290_000).find((r) => r.name === "Chebet")!;
    expect(chebet.followers).toBe(0);
    expect(chebet.reachEfficiency).toBeNull();
  });

  it("keeps the top twelve by default and any other number on request", () => {
    const many = Array.from({ length: 15 }, (_, i) => person(`p${i}`, `Creator ${i}`, `c${i}`, 1000));
    const manyStats = new Map(many.map((p, i) => [p.influencer_id, stats(1000 + i)]));
    expect(buildLeaderboard(many, manyStats, 100_000)).toHaveLength(12);
    expect(buildLeaderboard(many, manyStats, 100_000, 5)).toHaveLength(5);
  });

  it("leaves out creators with no views", () => {
    expect(buildLeaderboard(roster, byInfluencer, 1_290_000).some((r) => r.name === "Dalia")).toBe(false);
  });
});
