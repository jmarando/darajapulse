import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicBooking from "@/pages/PublicBooking";
import type { PublicBookingView } from "@/lib/storefrontBooking";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/publicClient", () => ({
  publicSupabase: {
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
    storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) },
  },
}));

const view = (over: Partial<PublicBookingView> = {}): PublicBookingView => ({
  ref: "BK-7F3K2Q", status: "awaiting_payment", final_state: "none", timeline: 0,
  next: { label: "Waiting for payment", who: "buyer" },
  house: { name: "Radio Africa Group", logo_url: null, primary_color: "#e11d48", support_email: "ads@example.com" },
  buyer: { name: "Wanjiku Kamau", company: "Wanjiku Foods", email: "wanjiku@example.com", phone: null, client: null },
  lines: [{ id: "i1", title: "Kiss 100: Spot adverts", option: "6–9 AM", qty: 10, unit: "spot", total: 350000, start: "2026-11-24", end: "2026-11-28", kind: "spread", adFormat: "radio_spot", model: "unit" }],
  totals: { media: 350000, production: 0, vat: 56000, total: 406000 },
  pay_method: "bank", paid_at: null, payment_ref: null, payment_claimed_ref: null, pesapal_status: null, refunded: false,
  ready: { pesapal: false, bank: true },
  bank: { account_name: "Example Account Ltd", bank_name: "Example Bank", bank_branch: "Westlands", account_number: "0011223344", paybill: null, paybill_account: null, reference: "BK-7F3K2Q" },
  paid_to: "Example Account Ltd", invoice_pending: false, materials: { audio: { mode: "have" } }, kit: {}, files: [], final_files: [], proof: null,
  schedule_note: null, created_at: "2026-11-18T08:00:00Z", start_date: "2026-11-24", end_date: "2026-11-28", ad_due: "2026-11-20",
  ...over,
});

const renderPage = () => render(
  <MemoryRouter initialEntries={["/booking/tok123abcdefghijklmnopqrs"]}>
    <Routes><Route path="/booking/:token" element={<PublicBooking />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => vi.resetAllMocks());

describe("the booking page", () => {
  it("shows where to send a transfer and passes on the transaction code", async () => {
    mocks.invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) =>
      ({ data: o.body.action === "claim" ? view({ payment_claimed_ref: "FT12345" }) : view(), error: null }));
    renderPage();
    expect(await screen.findByText("0011223344")).toBeInTheDocument();
    expect(screen.getAllByText("BK-7F3K2Q").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Transaction code"), { target: { value: "FT12345" } });
    fireEvent.click(screen.getByRole("button", { name: /I've paid/ }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("storefront-booking", { body: { action: "claim", token: "tok123abcdefghijklmnopqrs", reference: "FT12345" } }));
  });

  it("says an invoice is coming when the house hasn't added its bank details", async () => {
    mocks.invoke.mockResolvedValue({ data: view({ bank: null, invoice_pending: true, ready: { pesapal: false, bank: true, bank_details: false } }), error: null });
    renderPage();
    expect(await screen.findByText(/Radio Africa Group will email you an invoice with how to pay/)).toBeInTheDocument();
    expect(screen.getByLabelText("Transaction code")).toBeInTheDocument();
  });

  it("marks a paid booking on its timeline and gives a receipt", async () => {
    mocks.invoke.mockResolvedValue({ data: view({ status: "paid", timeline: 1, bank: null, paid_at: "2026-11-18T09:00:00Z", payment_ref: "FT12345", next: { label: "Check the ad", who: "house" } }), error: null });
    renderPage();
    const paid = await screen.findByText("Paid", { selector: "li *" });
    expect(paid.closest("li")).toHaveAttribute("data-reached", "true");
    expect(screen.getByRole("heading", { name: "Receipt" })).toBeInTheDocument();
    expect(screen.getByText(/Paid to Example Account Ltd/)).toBeInTheDocument();
  });

  it("asks the buyer to approve the ad the house made", async () => {
    mocks.invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) =>
      ({ data: view({ status: "paid", timeline: 1, bank: null, final_state: o.body.action === "final_decision" ? "approved" : "awaiting_buyer", final_files: [{ name: "spot-final.mp3", url: "https://files.example/final" }] }), error: null }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Looks good" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("storefront-booking", { body: { action: "final_decision", token: "tok123abcdefghijklmnopqrs", decision: "approve" } }));
  });

  it("says so when the link is wrong", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: "This booking link isn't valid." }) } } });
    renderPage();
    expect(await screen.findByText("This booking link isn't valid.")).toBeInTheDocument();
  });
});
