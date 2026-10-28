import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicPayments from "@/pages/PublicPayments";

// The database is the only thing stood in for: the page, its timers and its states are the real ones.
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc } }));

// What the anonymous role gets when the data call runs past its 3 second limit.
const timeout = { code: "57014", message: "canceling statement due to statement timeout" };

const payload = {
  campaign: { id: "c1", name: "Royco KE Q3 Nano Influencer Campaign", client_name: "Royco", status: "live", wht_percent: 5, hashtag: "#RoycoKitchenTales", client_logo_url: null },
  creators: [{ campaign_influencer_id: "ci1", influencer_id: "i1", full_name: "Evans Njue Githinji", handle: "evans", fee_kes: 75000, deliverables_count: 1 }],
  posts: [{ id: "p1", influencer_id: "i1", platform: "tiktok", post_url: "https://www.tiktok.com/@evans/video/1", posted_at: "2026-10-01T08:00:00Z" }],
  metrics: [{ post_id: "p1", views: 1733074, reach: 0, captured_at: new Date().toISOString() }],
  drafts: [],
  payouts: [],
};

type Reply = { data: unknown; error: unknown };
const answer = (next: () => Reply) =>
  rpc.mockImplementation(async (name: string) => (name === "get_payments_public_data" ? next() : { data: null, error: null }));

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const open = async () => {
  render(
    <MemoryRouter initialEntries={["/payments/abc123"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/payments/:token" element={<PublicPayments />} /></Routes>
    </MemoryRouter>,
  );
  await settle();
};

describe("PublicPayments", () => {
  beforeEach(() => { vi.useFakeTimers(); rpc.mockReset(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("says the link was not found only when the link really is not there", async () => {
    answer(() => ({ data: null, error: null }));
    await open();
    expect(screen.getByRole("heading", { name: "Payments summary not found" })).toBeInTheDocument();
  });

  it("does not call a failed load an expired link", async () => {
    answer(() => ({ data: null, error: timeout }));
    await open();
    expect(screen.queryByText("Payments summary not found")).toBeNull();
    expect(screen.getByText(/couldn't load just now/i)).toBeInTheDocument();
  });

  it("treats a dropped connection the same way", async () => {
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    await open();
    expect(screen.queryByText("Payments summary not found")).toBeNull();
    expect(screen.getByText(/couldn't load just now/i)).toBeInTheDocument();
  });

  it("recovers by itself once the data call works again", async () => {
    let n = 0;
    answer(() => (++n === 1 ? { data: null, error: timeout } : { data: payload, error: null }));
    await open();
    expect(screen.queryByText("Evans Njue Githinji")).toBeNull();
    await advance(15_000);
    expect(screen.getByText("Evans Njue Githinji")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
    expect(screen.queryByText("Payments summary not found")).toBeNull();
  });

  it("keeps the last figures on screen, and says so, when a refresh fails, then clears the notice", async () => {
    let n = 0;
    answer(() => (++n === 2 ? { data: null, error: timeout } : { data: payload, error: null }));
    await open();
    expect(screen.getByText("Evans Njue Githinji")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();

    await advance(60_000); // the minute refresh fails
    expect(screen.getByText("Evans Njue Githinji")).toBeInTheDocument();
    expect(screen.queryByText("Payments summary not found")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/couldn't refresh/i);

    await advance(15_000); // the quick retry works
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Evans Njue Githinji")).toBeInTheDocument();
  });

  it("backs off while the data call keeps failing instead of asking every few seconds", async () => {
    answer(() => ({ data: null, error: timeout }));
    await open();
    const asked = () => rpc.mock.calls.filter(([name]) => name === "get_payments_public_data").length;
    expect(asked()).toBe(1);
    await advance(10_000);
    expect(asked()).toBe(2);
    await advance(20_000);
    expect(asked()).toBe(3);
    await advance(60_000 * 5);
    expect(asked()).toBeLessThanOrEqual(9); // capped at about a minute between tries
  });
});
