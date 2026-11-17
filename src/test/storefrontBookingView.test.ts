import { describe, expect, it } from "vitest";
import { nextStep, publicView, stateOf, type BookingRow } from "@/lib/storefrontBooking";

const row: BookingRow = {
  id: "b1", agency_id: "a1", ref: "BK-7F3K2Q", token: "tok-secret-abcdefghijklmnopqrstuv",
  status: "awaiting_payment", final_state: "none", pay_method: "bank",
  contact_name: "Wanjiku Kamau", contact_email: "wanjiku@example.com", contact_phone: "0712345678", company: "Wanjiku Foods",
  kra_pin: "P051234567X", client_name: null,
  lines: [{ id: "i1", title: "Kiss 100: Spot adverts", option: "6–9 AM", qty: 10, unit: "spot", total: 350000, start: "2026-11-24", end: "2026-11-28", kind: "spread" }],
  materials: { audio: { mode: "have" } }, kit: { headline: "Fresh bread daily" },
  files: [
    { slot: "audio", path: "a1/BK-7F3K2Q/1-spot.mp3", name: "spot.mp3", type: "audio/mpeg", size: 1000 },
    { slot: "kit_logo", path: "a1/BK-7F3K2Q/2-logo.png", name: "logo.png", type: "image/png", size: 1000 },
  ],
  final_files: [], media_kes: 350000, production_kes: 0, vat_kes: 56000, total_kes: 406000,
  start_date: "2026-11-24", end_date: "2026-11-28", paid_at: null, payment_ref: null,
  payment_claimed_at: null, payment_claimed_ref: null, pesapal_tracking_id: "trk-secret-1", pesapal_status: null,
  refunded: false, refund_ref: null, schedule_note: null, proof: {}, internal_notes: "secret house note",
  created_at: "2026-11-18T08:00:00Z",
};
const house = { name: "Radio Africa Group", logo_url: null, primary_color: "#e11d48", support_email: "ads@example.com" };
const payment = {
  account_name: "Lana Bespoke Limited", bank_name: "NCBA", bank_branch: "Westlands", account_number: "1234567890",
  paybill: "880100", paybill_account: "1234567890",
};
const ctx = (over: Partial<Parameters<typeof publicView>[1]> = {}) => ({
  house, payment, urls: { "a1/BK-7F3K2Q/1-spot.mp3": "https://files.example/spot" }, ready: { pesapal: true, bank: true }, today: "2026-11-20", ...over,
});

describe("what a buyer's booking link shows", () => {
  it("never gives away the house's notes, the token, the KRA PIN or Pesapal's tracking id", () => {
    const text = JSON.stringify(publicView(row, ctx()));
    for (const secret of ["secret house note", "tok-secret-abcdefghijklmnopqrstuv", "P051234567X", "trk-secret-1"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("shows the bank details, with the booking number as the reason, only while a transfer is awaited", () => {
    expect(publicView(row, ctx()).bank).toMatchObject({ account_number: "1234567890", reference: "BK-7F3K2Q" });
    expect(publicView({ ...row, status: "paid" }, ctx()).bank).toBeNull();
    expect(publicView({ ...row, pay_method: "pesapal" }, ctx()).bank).toBeNull();
    expect(publicView(row, ctx({ payment: null })).bank).toBeNull();
  });

  it("links the files it has a signed address for, and drops the rest", () => {
    expect(publicView(row, ctx()).files).toEqual([{ slot: "audio", name: "spot.mp3", url: "https://files.example/spot" }]);
  });

  it("says what happens next, as the house's list does", () => {
    const view = publicView({ ...row, payment_claimed_ref: "FT123" }, ctx());
    expect(view.next).toEqual(nextStep(stateOf({ ...row, payment_claimed_ref: "FT123" }), "2026-11-20"));
    expect(view.next.label).toBe("Confirm payment");
    expect(view.ad_due).toBe("2026-11-20");
    expect(view.paid_to).toBe("Lana Bespoke Limited");
  });
});
