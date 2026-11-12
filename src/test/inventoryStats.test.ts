import { describe, expect, it, vi } from "vitest";
import { inventoryStats, inventoryTarget } from "../../supabase/functions/_shared/inventory-stats";

describe("storefront ScrapeCreators refresh", () => {
  it("reads Facebook through ScrapeCreators and does not invent engagement", async () => {
    const call = vi.fn().mockResolvedValue({ status: 200, json: { followerCount: 42000, credits_charged: 1 } });
    const result = await inventoryStats("facebook", "https://facebook.com/profile.php?id=12345", call);
    expect(call).toHaveBeenCalledWith("/v1/facebook/profile", { url: "https://www.facebook.com/profile.php?id=12345" });
    expect(result).toMatchObject({ outcome: "found", stats: { followers: 42000, engagement_rate: null } });
  });
  it("does not replace existing numbers when the provider fails", async () => {
    const result = await inventoryStats("instagram", "brianamwai", async () => ({ status: 500, json: {} }));
    expect(result.outcome).toBe("failed");
    expect(result).not.toHaveProperty("stats");
  });
  it("does not spend on presenter names or broadcast slots", async () => {
    const call = vi.fn();
    expect((await inventoryStats("facebook", "Brian Amwai", call)).outcome).toBe("invalid_account");
    expect((await inventoryStats("radio", "Milele FM", call)).outcome).toBe("invalid_account");
    expect(call).not.toHaveBeenCalled();
  });
  it("preserves YouTube channel ID casing and rejects video links", () => {
    expect(inventoryTarget("facebook", "/K24TV")).toEqual({ platform: "facebook", handle: "k24tv" });
    expect(inventoryTarget("youtube", "https://youtube.com/channel/UCAbCd123")).toEqual({ platform: "youtube", handle: "UCAbCd123" });
    expect(inventoryTarget("youtube", "https://youtube.com/watch?v=123")).toBeNull();
    expect(inventoryTarget("twitter", "https://x.com/person/status/123")).toBeNull();
  });
});