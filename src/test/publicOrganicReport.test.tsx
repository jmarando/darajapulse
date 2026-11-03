import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicOrganicReport from "@/pages/PublicOrganicReport";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc: (name: string, args: unknown) => mocks.rpc(name, args) } }));
vi.mock("@/components/PostThumb", () => ({ PostThumb: () => null }));
vi.mock("@/components/PublicFooter", () => ({ default: () => null }));

const doc = {
  client: { name: "Acme", logo_url: null }, from: "2026-10-01", to: "2026-10-31", previous_from: "2026-08-31", previous_to: "2026-09-30",
  channels: [{ id: "fb", platform: "facebook", handle: "acme", display_name: "Acme", avatar_url: null, source: "public", status: "ok", last_good_pull_at: new Date().toISOString(), audience: null }],
  days: [{ channel_id: "fb", day: "2026-10-31", followers: 1100, source: "scrapecreators" }],
  posts: [],
};
const open = (route = "/o/tok") => render(<MemoryRouter initialEntries={[route]}><Routes><Route path="/o/:token" element={<PublicOrganicReport />} /></Routes></MemoryRouter>);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe("the share page", () => {
  it("shows the brand and its report without a login", async () => {
    mocks.rpc.mockResolvedValue({ data: doc, error: null });
    open();
    expect(await screen.findByRole("heading", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getAllByText("1.1K").length).toBeGreaterThan(0);
    expect(mocks.rpc).toHaveBeenCalledWith("get_brand_report_rows_by_token", expect.objectContaining({ _token: "tok" }));
  });

  it("asks for the period in the address", async () => {
    mocks.rpc.mockResolvedValue({ data: doc, error: null });
    open("/o/tok?from=2026-10-01&to=2026-10-31");
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("get_brand_report_rows_by_token", { _token: "tok", _from: "2026-10-01", _to: "2026-10-31" }));
  });

  it("falls back to the last 30 days on a period that makes no sense", async () => {
    mocks.rpc.mockResolvedValue({ data: doc, error: null });
    open("/o/tok?from=nonsense&to=2026-10-31");
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(mocks.rpc.mock.calls[0][1]._from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mocks.rpc.mock.calls[0][1]._from).not.toBe("nonsense");
  });

  it("says a link that's off or unknown isn't active", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    open();
    expect(await screen.findByText("This report link isn't active.")).toBeInTheDocument();
  });

  it("offers nothing that changes anything", async () => {
    mocks.rpc.mockResolvedValue({ data: doc, error: null });
    open();
    await screen.findByRole("heading", { name: "Acme" });
    for (const name of [/Add handle/, /Connect/, /Disconnect/, /Share/, /Remove/]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("doesn't call a failed first load not found, shows no zeros, and tries again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "statement timeout" } }).mockResolvedValue({ data: doc, error: null });
    open();
    await flush();
    expect(screen.getByText("Couldn't load this report. Trying again.")).toBeInTheDocument();
    expect(screen.queryByText("This report link isn't active.")).toBeNull();
    expect(screen.queryByText("Followers")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByRole("heading", { name: "Acme" })).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps the last numbers when a later call fails, and says it couldn't refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mocks.rpc.mockResolvedValueOnce({ data: doc, error: null }).mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { rerender } = open();
    await flush();
    expect(screen.getAllByText("1.1K").length).toBeGreaterThan(0);
    // Moving to another period fails: the last numbers stay.
    await act(async () => { screen.getByRole("button", { name: "Earlier period" }).click(); });
    await flush();
    expect(screen.getAllByText("1.1K").length).toBeGreaterThan(0);
    expect(screen.getByText("Couldn't refresh. Trying again.")).toBeInTheDocument();
    expect(screen.queryByText("This report link isn't active.")).toBeNull();
    rerender(<div />);
  });

  it("backs off: 10 s, 20 s, 40 s, then every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    open();
    await flush();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    for (const [wait, calls] of [[10_000, 2], [20_000, 3], [40_000, 4], [60_000, 5], [60_000, 6]] as const) {
      await act(async () => { await vi.advanceTimersByTimeAsync(wait - 1); });
      expect(mocks.rpc).toHaveBeenCalledTimes(calls - 1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(mocks.rpc).toHaveBeenCalledTimes(calls);
    }
  });
});
