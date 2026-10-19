import { expect, it, vi } from "vitest";
import { fetchCampaignPeakMetrics } from "@/lib/metrics";

it("keeps never-synced posts out of collected metrics without inventing freshness", async () => {
  const client = { rpc: vi.fn().mockResolvedValue({ data: [
    { post_id: "missing", captured_at: null, views: 0 },
    { post_id: "collected", captured_at: "2026-10-19T07:00:00Z", views: 638 },
  ], error: null }) };
  expect(await fetchCampaignPeakMetrics(client, "campaign")).toEqual([
    { post_id: "collected", captured_at: "2026-10-19T07:00:00Z", views: 638 },
  ]);
});