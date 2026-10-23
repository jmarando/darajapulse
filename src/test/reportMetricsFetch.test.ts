import { expect, it, vi } from "vitest";
import { fetchReportPostMetrics } from "@/lib/metrics";

it("pages through the report metrics call until a short page comes back", async () => {
  const page = (n: number, start: number) =>
    Array.from({ length: n }, (_, i) => ({ post_id: `p${start + i}`, captured_at: "2026-10-23T03:00:00Z", views: 1 }));
  const range = vi.fn()
    .mockResolvedValueOnce({ data: page(1000, 0), error: null })
    .mockResolvedValueOnce({ data: page(487, 1000), error: null });
  const client = { rpc: vi.fn(() => ({ range })) };

  const rows = await fetchReportPostMetrics(client, "token");

  expect(rows).toHaveLength(1487);
  expect(client.rpc).toHaveBeenCalledWith("get_report_post_metrics", { _token: "token" });
  expect(range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
});

it("surfaces errors so the caller can fall back or show a load failure", async () => {
  const client = { rpc: vi.fn(() => ({ range: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } }) })) };
  await expect(fetchReportPostMetrics(client, "token")).rejects.toMatchObject({ code: "PGRST202" });
});
