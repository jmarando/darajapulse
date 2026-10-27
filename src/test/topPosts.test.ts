import { describe, expect, it } from "vitest";
import { pickTopPosts } from "@/lib/topPosts";

const post = (id: string) => ({ id, post_url: `https://example.com/${id}`, platform: "tiktok" });
const reading = (views: number, extra: Partial<Record<"likes" | "comments" | "shares" | "saves", number>> = {}) => ({ views, likes: 0, comments: 0, shares: 0, saves: 0, ...extra });

// A has the most views; B turns the most of its views into likes; C has the most saves and shares.
const posts = [post("a"), post("b"), post("c")];
const metrics = new Map([
  ["a", reading(1000, { likes: 10 })],
  ["b", reading(500, { likes: 100 })],
  ["c", reading(300, { shares: 20, saves: 20 })],
]);

describe("pickTopPosts", () => {
  it("picks the most viewed, the highest engagement and the strongest intent, in that order", () => {
    const picks = pickTopPosts(posts, metrics);
    expect(picks.map((p) => [p.kind, p.post.id])).toEqual([["views", "a"], ["engagement", "b"], ["intent", "c"]]);
  });

  it("carries the figures the page shows for each pick", () => {
    const [, engagement, intent] = pickTopPosts(posts, metrics);
    expect(engagement.interactions).toBe(100);
    expect(engagement.rate).toBeCloseTo(20);
    expect(intent.intent).toBe(40);
    expect(intent.metrics.views).toBe(300);
  });

  it("leaves out posts with no views", () => {
    const picks = pickTopPosts([...posts, post("d")], new Map([...metrics, ["d", reading(0, { likes: 50 })]]));
    expect(picks.every((p) => p.post.id !== "d")).toBe(true);
  });

  it("needs 200 views before a post can win on engagement rate", () => {
    const tiny = post("t");
    const withTiny = new Map([...metrics, ["t", reading(50, { likes: 45 })]]); // 90% of 50 views
    const picks = pickTopPosts([...posts, tiny], withTiny);
    expect(picks.find((p) => p.kind === "engagement")!.post.id).toBe("b");
  });

  it("falls back to every post when none has 200 views", () => {
    const small = new Map([
      ["a", reading(100, { likes: 5 })],
      ["b", reading(80, { likes: 40 })],
    ]);
    const picks = pickTopPosts([post("a"), post("b")], small);
    expect(picks.find((p) => p.kind === "engagement")!.post.id).toBe("b");
  });

  it("shows the same post under each heading it wins", () => {
    const picks = pickTopPosts([post("a")], new Map([["a", reading(1000, { likes: 100, shares: 10, saves: 10 })]]));
    expect(picks.map((p) => p.post.id)).toEqual(["a", "a", "a"]);
  });

  it("returns nothing when no post has views", () => {
    expect(pickTopPosts(posts, new Map())).toEqual([]);
    expect(pickTopPosts([], metrics)).toEqual([]);
  });
});
