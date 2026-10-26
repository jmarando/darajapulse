import { describe, expect, it } from "vitest";
import { buildChannelMix } from "@/lib/channelMix";

const post = (id: string, platform: string | null, influencer_id: string | null) => ({ id, platform, influencer_id });
const reading = (views: number, extra: Record<string, unknown> = {}) => ({ views, reach: 0, ...extra });

const posts = [
  post("p1", "tiktok", "i1"),
  post("p2", "tiktok", "i1"),
  post("p3", "tiktok", "i2"),
  post("p4", "instagram", "i3"),
];
const metrics = new Map([
  ["p1", reading(1000, { reach: 600 })],
  ["p2", reading(500, { reach: 300 })],
  ["p3", reading(300, { reach: 100 })],
  ["p4", reading(4000, { reach: 2720 })],
]);

describe("buildChannelMix", () => {
  it("groups the posts by platform, counts each creator once and puts the most views first", () => {
    const rows = buildChannelMix(posts, metrics, []);
    expect(rows.map((r) => r.key)).toEqual(["instagram", "tiktok"]);
    expect(rows.map((r) => r.label)).toEqual(["Instagram", "TikTok"]);
    const tiktok = rows[1];
    expect(tiktok).toMatchObject({ posts: 3, creators: 2, views: 1800, reach: 1000 });
  });

  it("gives each platform its part of all the views", () => {
    const rows = buildChannelMix(posts, metrics, []);
    expect(rows[0].share).toBeCloseTo(4000 / 5800);
    expect(rows[1].share).toBeCloseTo(1800 / 5800);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1);
  });

  it("files a post with no platform under Other", () => {
    const rows = buildChannelMix([post("p1", null, "i1")], new Map([["p1", reading(10)]]), []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "other", label: "Other", posts: 1 });
  });

  it("counts a creator's followers under their main platform, for platforms that have posts", () => {
    const roster = [
      { influencers: { primary_platform: "tiktok", follower_count: 1000 } },
      { influencers: { primary_platform: "tiktok", follower_count: 500 } },
      { influencers: { primary_platform: "instagram", follower_count: 8000 } },
      { influencers: { primary_platform: "youtube", follower_count: 9999 } }, // nothing posted there
      { influencers: null },
    ];
    const rows = buildChannelMix(posts, metrics, roster);
    expect(rows.find((r) => r.key === "tiktok")!.followers).toBe(1500);
    expect(rows.find((r) => r.key === "instagram")!.followers).toBe(8000);
    expect(rows.some((r) => r.key === "youtube")).toBe(false);
  });

  it("says when reach was filled in for any post on the platform", () => {
    const withEstimate = new Map(metrics);
    withEstimate.set("p2", reading(500, { reach: 340, estimated_fields: { reach: true } }));
    const rows = buildChannelMix(posts, withEstimate, []);
    expect(rows.find((r) => r.key === "tiktok")!.reachEstimated).toBe(true);
    expect(rows.find((r) => r.key === "instagram")!.reachEstimated).toBe(false);
  });

  it("counts a post nobody has read yet as zero, and has no shares while there are no views", () => {
    const rows = buildChannelMix(posts, new Map(), []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.views === 0 && r.reach === 0 && r.share === 0)).toBe(true);
    expect(rows.find((r) => r.key === "tiktok")!.posts).toBe(3);
  });

  it("returns nothing for a campaign with no posts", () => {
    expect(buildChannelMix([], new Map(), [])).toEqual([]);
  });
});
