import { afterAll, describe, expect, it, vi } from "vitest";

vi.stubGlobal("Deno", { env: { get: () => undefined } });
const { mapFacebookPost } = await import("../../supabase/functions/_shared/scrapecreators");
afterAll(() => vi.unstubAllGlobals());

describe("Facebook provider statistics", () => {
  it("reads the documented snake-case post counts instead of dropping them", () => {
    const result = mapFacebookPost({ view_count: 133000, like_count: 2095, comment_count: 48, share_count: 133 });
    expect(result.stats).toEqual({ views: 133000, likes: 2095, comments: 48, shares: 133 });
  });
  it("keeps legacy nested responses working", () => {
    expect(mapFacebookPost({ post: { viewCount: 1200, reactionCount: 30, commentCount: 4, shareCount: 2 } }).stats)
      .toEqual({ views: 1200, likes: 30, comments: 4, shares: 2 });
  });
  it("does not invent views when only engagement is available", () => {
    expect(mapFacebookPost({ view_count: null, like_count: 12, comment_count: 3, share_count: 1 }).stats)
      .toEqual({ views: 0, likes: 12, comments: 3, shares: 1 });
  });
});