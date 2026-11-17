import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicStorefront from "@/pages/PublicStorefront";
import type { Listing } from "@/lib/storefront";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/publicClient", () => ({
  publicSupabase: {
    rpc: (name: string, args: unknown) => mocks.rpc(name, args),
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
  },
}));

const KISS = "11111111-1111-4111-8111-111111111111";
const CLASSIC = "22222222-2222-4222-8222-222222222222";
const WEB = "33333333-3333-4333-8333-333333333333";

const spots = (id: string, station: string, prices: number[], reach: number): Listing => ({
  id, kind: "ad_slot", platform: "radio", title: `${station}: Spot adverts`, subtitle: `${station} · radio`,
  description: "A 30-second advert in the time band you choose\nReach is the station's weekly listeners (GeoPoll Kenya radio survey, Q2 2026).",
  follower_count: reach, price_kes: Math.min(...prices), price_unit: "spot",
  options: ["6–9 AM", "Run of station"].map((label, n) => ({ label, price_kes: prices[n] })),
});

const storefront = (showPrices: boolean) => ({
  agency: { id: "a1", name: "Radio Africa Group", slug: "radioafrica", primary_color: "#ED1C24", show_prices: showPrices },
  items: [
    { id: "pack", kind: "bundle", platform: "mixed", title: "Youth culture pack", subtitle: "Kiss 100, Mpasho and Songa Play", description: "20 spots on Kiss 100\nA week of Mpasho banners", price_unit: "package" },
    spots(KISS, "Kiss 100", showPrices ? [35000, 14000] : [0, 0], 4_660_000),
    spots(CLASSIC, "Classic 105", showPrices ? [40000, 16000] : [0, 0], 9_700_000),
    { id: WEB, kind: "ad_slot", platform: "web", title: "The Star online: Leaderboard", subtitle: "The Star online · the-star.co.ke, Kenya's news site", deliverable_type: "Banner, 970 × 90", price_unit: "week" },
    { id: "gidi", kind: "influencer", platform: "radio", title: "Gidi", subtitle: "Radio Jambo · Gidi na Ghost", price_kes: showPrices ? 60000 : null, price_unit: "mention" },
  ].map((i) => (showPrices ? i : { ...i, price_kes: null, options: (i as Listing).options?.map(({ label }) => ({ label })) ?? null })),
});

const renderPage = () => render(
  <MemoryRouter initialEntries={["/shop/radioafrica"]}>
    <Routes><Route path="/shop/:agencySlug" element={<PublicStorefront />} /></Routes>
  </MemoryRouter>,
);
const plan = () => within(screen.getByRole("complementary", { name: "Your plan" }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("the storefront, every way to buy", () => {
  it("opens on every way to buy, with where each starts", async () => {
    mocks.rpc.mockResolvedValue({ data: storefront(true), error: null });
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Every way to advertise with Radio Africa Group" })).toBeInTheDocument();
    const ways = within(screen.getByRole("navigation", { name: "Ways to buy" }));
    expect(ways.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Packages1 to choose fromPrice on request",
      "Radio2 to choose fromFrom KES 14,000",
      "Websites1 to choose fromPrice on request",
      "Talent1 to choose fromFrom KES 60,000",
    ]);
  });

  it("adds a station's price from the rate card, counts it up, and totals the plan", async () => {
    mocks.rpc.mockResolvedValue({ data: storefront(true), error: null });
    renderPage();
    const cell = await screen.findByRole("button", { name: "Kiss 100, Spot adverts, 6–9 AM: KES 35,000 a spot" });
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(plan().getByText("Kiss 100: Spot adverts")).toBeInTheDocument();
    expect(plan().getByText("KES 35,000", { selector: "span.text-xl" })).toBeInTheDocument();

    fireEvent.change(plan().getByLabelText("How many: Kiss 100: Spot adverts, 6–9 AM"), { target: { value: "10" } });
    expect(plan().getByText("spots")).toBeInTheDocument();
    expect(plan().getByText("KES 350,000", { selector: "span.text-xl" })).toBeInTheDocument();
    expect(cell).toHaveTextContent("×10");

    // A banner has no published price: it joins the plan as one to quote.
    fireEvent.click(screen.getByRole("button", { name: "Add The Star online: Leaderboard" }));
    expect(plan().getByText("Plus 1 item priced on request.")).toBeInTheDocument();
    const ways = within(screen.getByRole("navigation", { name: "Ways to buy" }));
    expect(ways.getByRole("button", { name: /^Radio/ })).toHaveTextContent("1 picked");
    expect(ways.getByRole("button", { name: /^Websites/ })).toHaveTextContent("1 picked");
    expect(ways.getByRole("button", { name: /^Talent/ })).not.toHaveTextContent("picked");
  });

  it("narrows the rate card to one station", async () => {
    mocks.rpc.mockResolvedValue({ data: storefront(true), error: null });
    renderPage();
    await screen.findByRole("button", { name: "Kiss 100, Spot adverts, 6–9 AM: KES 35,000 a spot" });
    fireEvent.click(within(screen.getByRole("group", { name: "Stations" })).getByRole("button", { name: "Classic 105" }));
    expect(screen.queryByRole("button", { name: "Kiss 100, Spot adverts, 6–9 AM: KES 35,000 a spot" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classic 105, Spot adverts, Run of station: KES 16,000 a spot" })).toBeInTheDocument();
  });

  it("sends each choice with how many, and the listing ids for the older request function", async () => {
    mocks.rpc.mockResolvedValue({ data: storefront(true), error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Kiss 100, Spot adverts, 6–9 AM: KES 35,000 a spot" }));
    fireEvent.click(screen.getByRole("button", { name: "Kiss 100, Spot adverts, Run of station: KES 14,000 a spot" }));
    fireEvent.click(screen.getByRole("button", { name: "Add The Star online: Leaderboard" }));
    fireEvent.click(plan().getByRole("button", { name: "Request a quote" }));

    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Your name *"), { target: { value: "Wanjiru" } });
    fireEvent.change(dialog.getByLabelText("Email *"), { target: { value: "wanjiru@example.com" } });
    fireEvent.click(dialog.getByRole("button", { name: "Send request to Radio Africa Group" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("storefront-request", expect.anything()));
    const body = (mocks.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.lines).toEqual([
      { id: KISS, option: "6–9 AM", qty: 1 },
      { id: KISS, option: "Run of station", qty: 1 },
      { id: WEB, option: null, qty: 1 },
    ]);
    expect(body.item_ids).toEqual([KISS, WEB]);
    expect(await screen.findByText("Request sent")).toBeInTheDocument();
  });

  it("shows no prices or totals for a house that keeps them to itself", async () => {
    mocks.rpc.mockResolvedValue({ data: storefront(false), error: null });
    renderPage();
    const cell = await screen.findByRole("button", { name: "Kiss 100, Spot adverts, 6–9 AM" });
    expect(cell).toHaveTextContent("Add");
    fireEvent.click(cell);
    expect(screen.queryByText(/KES/)).not.toBeInTheDocument();
    expect(plan().queryByText("Rate-card total")).not.toBeInTheDocument();
    expect(plan().getByText("Radio Africa Group replies with prices and dates within a day.")).toBeInTheDocument();
  });
});

describe("booking online", () => {
  const withBooking = (booking: string) => {
    const s = storefront(true);
    return {
      ...s,
      agency: { ...s.agency, booking },
      items: s.items.map((i) => (i.id === KISS || i.id === CLASSIC ? { ...i, bookable: true, ad_format: "radio_spot" } : i)),
    };
  };

  it("offers Book now beside the quote request when the house books online", async () => {
    mocks.rpc.mockResolvedValue({ data: withBooking("on"), error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Kiss 100, Spot adverts, 6–9 AM/ }));
    expect(plan().getByRole("button", { name: "Book now" })).toBeInTheDocument();
    expect(plan().getByRole("button", { name: "Request a quote" })).toBeInTheDocument();
  });

  it("keeps to quote requests when online booking is off", async () => {
    mocks.rpc.mockResolvedValue({ data: withBooking("off"), error: null });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Kiss 100, Spot adverts, 6–9 AM/ }));
    expect(plan().queryByRole("button", { name: "Book now" })).toBeNull();
    expect(plan().getByRole("button", { name: "Request a quote" })).toBeInTheDocument();
  });
});
