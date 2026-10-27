import { describe, expect, it } from "vitest";
import { rankPerformers } from "@/lib/topPerformers";

const person = (id: string, name: string, handle: string) => ({ id: `ci-${id}`, influencer_id: id, influencers: { full_name: name, handle } });
const stats = (views: number, extra: Partial<Record<"likes" | "comments" | "shares" | "saves" | "posts", number>> = {}) => ({
  views, likes: 0, comments: 0, shares: 0, saves: 0, posts: 1, ...extra,
});

const roster = [
  person("a", "Amani", "@amani.o"),
  person("b", "Baraka", "baraka"),
  person("c", "Chebet", "chebet.k"),
  person("d", "Dalia", "dalia"),
  person("e", "Esther", "esther"),
];
const byInfluencer = new Map([
  ["a", stats(2_000_000, { likes: 160_000, comments: 8_000, shares: 12_000, saves: 20_000, posts: 3 })],
  ["b", stats(5_000_000, { likes: 400_000, comments: 10_000, shares: 30_000, saves: 60_000, posts: 4 })],
  ["c", stats(1_000_000, { likes: 50_000 })],
  ["d", stats(0)],
  // "e" has no figures at all
]);

describe("rankPerformers", () => {
  it("ranks creators by views and keeps the top three", () => {
    const rows = rankPerformers(roster, byInfluencer, 8_000_000);
    expect(rows.map((r) => r.name)).toEqual(["Baraka", "Amani", "Chebet"]);
  });

  it("leaves out creators with no views or no figures", () => {
    expect(rankPerformers(roster, byInfluencer, 8_000_000, 10).map((r) => r.name)).toEqual(["Baraka", "Amani", "Chebet"]);
  });

  it("works out interactions, engagement rate and share of the campaign's views", () => {
    const [top, second] = rankPerformers(roster, byInfluencer, 8_000_000);
    expect(top).toMatchObject({ id: "ci-b", views: 5_000_000, interactions: 500_000, likes: 400_000, comments: 10_000, sharesSaves: 90_000, posts: 4 });
    expect(top.rate).toBeCloseTo(10, 5);
    expect(top.share).toBeCloseTo(0.625, 5);
    expect(second.rate).toBeCloseTo(10, 5);
    expect(second.share).toBeCloseTo(0.25, 5);
  });

  it("shows the handle without its @ and falls back when the creator is missing", () => {
    const rows = rankPerformers([{ id: "ci-x", influencer_id: "x", influencers: null }, ...roster], new Map([...byInfluencer, ["x", stats(9_000_000)]]), 17_000_000);
    expect(rows[0]).toMatchObject({ name: "—", handle: "" });
    expect(rows[2].handle).toBe("amani.o");
  });

  it("gives a share of zero when the campaign total is not known", () => {
    expect(rankPerformers(roster, byInfluencer, 0)[0].share).toBe(0);
  });
});
