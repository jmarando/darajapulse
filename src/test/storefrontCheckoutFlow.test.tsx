import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Checkout from "@/components/storefront/booking/Checkout";
import type { Listing } from "@/lib/storefront";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn() }));
vi.mock("@/integrations/supabase/publicClient", () => ({
  publicSupabase: {
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
    storage: { from: () => ({ uploadToSignedUrl: (...args: unknown[]) => mocks.upload(...args) }) },
  },
}));

const kiss: Listing = {
  id: "00000000-0000-4000-8000-000000000011", kind: "ad_slot", platform: "radio", title: "Kiss 100: Spot adverts", price_kes: 14000,
  price_unit: "spot", options: [{ label: "6–9 AM", price_kes: 35000 }], bookable: true, ad_format: "radio_spot",
};
const leaderboard: Listing = {
  id: "00000000-0000-4000-8000-000000000012", kind: "ad_slot", platform: "web", title: "The Star online: Leaderboard", price_kes: 300,
  price_unit: "1,000 views", price_model: "cpm", min_spend_kes: 15000, bookable: true, ad_format: "web_leaderboard",
};
const byId = new Map([kiss, leaderboard].map((i) => [i.id, i]));
const lines = [{ id: kiss.id, option: "6–9 AM", qty: 10 }, { id: leaderboard.id, option: null, qty: 1, budget: 15000 }];

const renderCheckout = () => render(
  <MemoryRouter initialEntries={["/shop/radioafrica"]}>
    <Routes>
      <Route path="/shop/:slug" element={
        <Checkout open onClose={() => {}} agencySlug="radioafrica" houseName="Radio Africa Group" accent="#e11d48"
          lines={lines} byId={byId} production={{ audio: 50000, banner: 15000, print: 12000 }} today="2026-11-17" />
      } />
      <Route path="/booking/:token" element={<p>Booking page</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.invoke.mockImplementation(async (_name: string, options: { body: { action: string } }) => {
    if (options.body.action === "options") return { data: { booking: "on", pesapal: false, bank: true, production: { audio: 50000, banner: 15000, print: 12000 }, earliest: "2026-11-20" }, error: null };
    if (options.body.action === "create") {
      await new Promise((r) => setTimeout(r, 20));
      return { data: { token: "tok123", ref: "BK-7F3K2Q", total: 481400, uploads: [] }, error: null };
    }
    return { data: {}, error: null };
  });
});

describe("booking online", () => {
  it("walks through when, the ad, the buyer and paying, then opens the booking", async () => {
    renderCheckout();
    expect(await screen.findByRole("heading", { name: "When should it run?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Your ad" })).toBeInTheDocument();
    const audio = within(screen.getByRole("group", { name: "Audio advert" }));
    fireEvent.click(audio.getByRole("radio", { name: /Make it for me/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Wanjiku Kamau" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wanjiku@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Pay" })).toBeInTheDocument();
    expect(screen.getByText("VAT (16%)")).toBeInTheDocument();
    expect(screen.getAllByText("KES 481,400").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /If they can't run your booking/ }));
    const pay = screen.getByRole("button", { name: "Book and get bank details" });
    fireEvent.click(pay);
    fireEvent.click(pay);

    expect(await screen.findByText("Booking page")).toBeInTheDocument();
    const creates = mocks.invoke.mock.calls.filter(([, o]) => (o as { body: { action: string } }).body.action === "create");
    expect(creates).toHaveLength(1);
    expect((creates[0][1] as { body: Record<string, unknown> }).body).toMatchObject({ method: "bank", agency_slug: "radioafrica", materials: { audio: { mode: "make" } } });
  });

  it("won't move on while a line is under its minimum", async () => {
    renderCheckout();
    await screen.findByRole("heading", { name: "When should it run?" });
    fireEvent.change(screen.getByLabelText("Budget: The Star online: Leaderboard"), { target: { value: "10000" } });
    expect(await screen.findByText("The minimum for The Star online: Leaderboard is KES 15,000.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("heading", { name: "When should it run?" })).toBeInTheDocument());
  });
});

describe("changing how many spots", () => {
  it("lets the buyer change the spots in the first step, and the total follows", async () => {
    renderCheckout();
    await screen.findByRole("heading", { name: "When should it run?" });
    fireEvent.change(screen.getByLabelText("How many: Kiss 100: Spot adverts"), { target: { value: "5" } });
    expect(await screen.findByText("KES 220,400")).toBeInTheDocument();
  });
});

describe("booking before the house has added its bank details", () => {
  it("books it and says an invoice with how to pay follows", async () => {
    mocks.invoke.mockImplementation(async (_name: string, options: { body: { action: string } }) => {
      if (options.body.action === "options") return { data: { booking: "on", pesapal: false, bank: true, bank_details: false, production: { audio: 50000 }, earliest: "2026-11-20" }, error: null };
      if (options.body.action === "create") return { data: { token: "tok999", ref: "BK-AAAAAA", total: 1, uploads: [] }, error: null };
      return { data: {}, error: null };
    });
    renderCheckout();
    await screen.findByRole("heading", { name: "When should it run?" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Your ad" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Your details" });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Wanjiku Kamau" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wanjiku@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByRole("heading", { name: "Pay" });
    expect(screen.queryByText(/can't be paid online/)).not.toBeInTheDocument();
    expect(screen.getByText(/emails you an invoice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /If they can't run your booking/ }));
    fireEvent.click(screen.getByRole("button", { name: "Book now" }));

    expect(await screen.findByText("Booking page")).toBeInTheDocument();
    const creates = mocks.invoke.mock.calls.filter(([, o]) => (o as { body: { action: string } }).body.action === "create");
    expect((creates[0][1] as { body: Record<string, unknown> }).body).toMatchObject({ method: "bank" });
  });
});
