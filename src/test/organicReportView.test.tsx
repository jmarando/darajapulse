import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OrganicReportView from "@/components/channels/OrganicReport";
import { buildOrganicReport, type ReportChannel, type ReportDoc } from "../../supabase/functions/_shared/organic-report";

vi.mock("@/components/PostThumb", () => ({ PostThumb: () => null }));

const now = Date.parse("2026-11-04T09:00:00Z");
const channel = (over: Partial<ReportChannel>): ReportChannel => ({
  id: "fb", platform: "facebook", handle: "acme", display_name: "Acme", avatar_url: null, source: "connected", status: "ok",
  last_good_pull_at: "2026-11-03T02:00:00Z", audience: null, ...over,
});
const fb = channel({});
const tt = channel({ id: "tt", platform: "tiktok", handle: "acme.ke", display_name: "Acme KE", source: "public", last_good_pull_at: "2026-11-01T02:00:00Z" });
const snapshot = { views: 1000, likes: 50, comments: 30, shares: 20, saves: null, reach: 800, views_paid: 200, source: "meta", captured_at: "2026-10-31T02:00:00Z", counted_late: false };
const doc = (over: Partial<ReportDoc> = {}): ReportDoc => ({
  client: { name: "Acme", logo_url: null }, from: "2026-10-01", to: "2026-10-31", previous_from: "2026-08-31", previous_to: "2026-09-30",
  channels: [fb, tt],
  days: [
    { channel_id: "fb", day: "2026-09-30", followers: 1000, source: "meta" },
    { channel_id: "fb", day: "2026-10-31", followers: 1100, source: "meta" },
  ],
  posts: [{ id: "p1", channel_id: "fb", period: "current", url: "https://example.test/p1", posted_at: "2026-10-10T08:00:00Z", format: "video", caption: null, thumbnail_url: null, snapshot }],
  ...over,
});
const show = (d: ReportDoc, compare = true) => render(<OrganicReportView report={buildOrganicReport(d, now)} compare={compare} />);
const tile = (label: string) => within(screen.getAllByText(label).map((e) => e.closest("[data-tile]")).find(Boolean) as HTMLElement);
const account = (line: string) => screen.getAllByText(line).map((e) => e.closest("[data-account]")).find(Boolean) as HTMLElement;
const figure = (label: string) => within(screen.getByText(label).parentElement as HTMLElement);

describe("OrganicReport", () => {
  it("shows the tiles' numbers", () => {
    show(doc());
    expect(tile("Followers").getByText("1.1K")).toBeInTheDocument();
    expect(tile("Posts").getByText("1")).toBeInTheDocument();
    expect(tile("Views").getByText("1K")).toBeInTheDocument();
    expect(tile("Interactions").getByText("100")).toBeInTheDocument();
    expect(tile("Engagement rate").getByText("10.0%")).toBeInTheDocument();
  });

  it("shows dashes, never 0, when nothing is known", () => {
    show(doc({ channels: [], days: [], posts: [] }));
    for (const label of ["Followers", "Posts", "Views", "Interactions", "Engagement rate"]) expect(tile(label).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows a change beside a tile when comparing, and none when not", () => {
    show(doc());
    expect(tile("Followers").getByText("+100")).toBeInTheDocument();
  });

  it("hides change chips with compare off", () => {
    show(doc(), false);
    expect(tile("Followers").queryByText("+100")).toBeNull();
  });

  it("says where each account's numbers come from, in a tag and a tooltip", () => {
    show(doc());
    const meta = account("@acme · Facebook");
    expect(meta).toHaveAttribute("title", "From Meta");
    expect(within(meta).getByText("Connected")).toBeInTheDocument();
    const open = account("@acme.ke · TikTok");
    expect(open).toHaveAttribute("title", "Public numbers");
    expect(within(open).getByText("Public")).toBeInTheDocument();
  });

  it("shows an account's unknown numbers as dashes", () => {
    show(doc());
    const open = account("@acme.ke · TikTok");
    expect(within(open).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the Connect prompt only when nothing is connected", () => {
    show(doc());
    expect(screen.queryByText("Connect Facebook and Instagram to see reach, paid vs organic and audience.")).toBeNull();
    expect(screen.getByText("From Meta")).toBeInTheDocument();
    expect(screen.getByText("Average reach per post")).toBeInTheDocument();
  });

  it("prompts to connect when every account is on public numbers", () => {
    show(doc({ channels: [tt], days: [], posts: [] }));
    expect(screen.getByText("Connect Facebook and Instagram to see reach, paid vs organic and audience.")).toBeInTheDocument();
  });

  it("shows organic and paid views, and the audience, from Meta", () => {
    const audience = { country: [{ key: "KE", value: 90 }, { key: "UG", value: 10 }], age: [{ key: "18-24", value: 100 }], gender: [] };
    show(doc({ channels: [{ ...fb, audience }] }));
    expect(figure("Organic views").getByText("800")).toBeInTheDocument();
    expect(figure("Paid views").getByText("200")).toBeInTheDocument();
    expect(figure("Average reach per post").getByText("800")).toBeInTheDocument();
    expect(screen.getByText("KE")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows notes and the sources line", () => {
    show(doc());
    expect(screen.getByText("Facebook from Meta. TikTok from public numbers.")).toBeInTheDocument();
    expect(screen.getByText("TikTok (@acme.ke) was last updated 3 days ago.")).toBeInTheDocument();
  });
});
