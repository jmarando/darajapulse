import { describe, expect, it } from "vitest";
import {
  buyerCopy, houseCan, houseCopy, houseScope, lineWhat, materialsReady, nextStep, stateOf, timelineIndex, type BookingState,
} from "@/lib/storefrontBooking";

const base: BookingState = {
  status: "paid", final_state: "none", pay_method: "bank", payment_claimed_ref: null, makes: false, materials_ready: true,
  start_date: "2026-11-24", end_date: "2026-11-30",
};

describe("the next step on a booking", () => {
  it("waits on payment, or asks the house to confirm a transfer", () => {
    expect(nextStep({ ...base, status: "awaiting_payment", payment_claimed_ref: "FT123" }, "2026-11-18")).toEqual({ label: "Confirm payment", who: "house" });
    expect(nextStep({ ...base, status: "awaiting_payment", pay_method: "pesapal" }, "2026-11-18")).toEqual({ label: "Waiting for payment", who: "buyer" });
  });
  it("follows the ad once paid", () => {
    expect(nextStep({ ...base, materials_ready: false }, "2026-11-18")).toEqual({ label: "Waiting for the ad", who: "buyer" });
    expect(nextStep({ ...base, makes: true }, "2026-11-18")).toEqual({ label: "Make the ad", who: "house" });
    expect(nextStep({ ...base, makes: true, final_state: "awaiting_buyer" }, "2026-11-18")).toEqual({ label: "Waiting for approval", who: "buyer" });
    expect(nextStep(base, "2026-11-18")).toEqual({ label: "Check the ad", who: "house" });
    expect(nextStep({ ...base, status: "changes_requested" }, "2026-11-18")).toEqual({ label: "Waiting for changes", who: "buyer" });
  });
  it("follows the run", () => {
    expect(nextStep({ ...base, status: "approved" }, "2026-11-20")).toEqual({ label: "Starts 24 Nov", who: "none" });
    expect(nextStep({ ...base, status: "approved" }, "2026-11-24")).toEqual({ label: "Mark live", who: "house" });
    expect(nextStep({ ...base, status: "live" }, "2026-11-25")).toEqual({ label: "Running until 30 Nov", who: "none" });
    expect(nextStep({ ...base, status: "live" }, "2026-12-01")).toEqual({ label: "Send proof", who: "house" });
    expect(nextStep({ ...base, status: "done" }, "2026-12-01")).toEqual({ label: "Done", who: "none" });
    expect(nextStep({ ...base, status: "cancelled" }, "2026-12-01")).toEqual({ label: "Cancelled", who: "none" });
  });
});

describe("what the house may do", () => {
  it("approves only a ready ad, and the house-made ad once the buyer approved it", () => {
    expect(houseCan({ ...base, makes: true }, "approve")).toBe(false);
    expect(houseCan({ ...base, makes: true, final_state: "approved" }, "approve")).toBe(true);
    expect(houseCan({ ...base, status: "awaiting_payment" }, "mark_paid")).toBe(true);
    expect(houseCan({ ...base, status: "done" }, "cancel")).toBe(false);
  });
});

describe("the timeline and the material", () => {
  it("places the booking on its timeline", () => {
    expect(timelineIndex({ ...base, status: "approved" })).toBe(3);
    expect(timelineIndex({ ...base, status: "cancelled" })).toBe(-1);
  });
  it("knows when everything needed has been given", () => {
    expect(materialsReady({ audio: { mode: "have" } }, [])).toBe(false);
    expect(materialsReady({ audio: { mode: "have" } }, [{ slot: "audio" }])).toBe(true);
    expect(materialsReady({ script: { mode: "have", script: "Read this" } }, [])).toBe(true);
    expect(materialsReady({ audio: { mode: "make" } }, [])).toBe(true);
  });
  it("builds the state from a saved booking", () => {
    expect(stateOf({
      status: "paid", final_state: "none", pay_method: "bank", payment_claimed_ref: null,
      materials: { audio: { mode: "make" } }, files: [], start_date: "2026-11-24", end_date: "2026-11-30",
    })).toEqual({ ...base, makes: true, materials_ready: true });
  });
});

describe("email wording", () => {
  const d = { house: "Radio Africa Group", ref: "BK-7F3K2Q", total: "KES 481,400", buyer: "Wanjiku Foods" };
  it("gives the buyer a clear subject at each step", () => {
    expect(buyerCopy("created_bank", d).subject).toBe("Booking BK-7F3K2Q: how to pay KES 481,400");
    expect(buyerCopy("paid", d).subject).toBe("Payment received for booking BK-7F3K2Q");
    expect(buyerCopy("changes_requested", d).subject).toBe("Radio Africa Group asks for a change to your ad (BK-7F3K2Q)");
    expect(buyerCopy("final_ready", d).subject).toBe("Your ad is ready to check (BK-7F3K2Q)");
    expect(buyerCopy("approved", d).subject).toBe("Booking BK-7F3K2Q is approved and scheduled");
    expect(buyerCopy("live", d).subject).toBe("Booking BK-7F3K2Q is live");
    expect(buyerCopy("done", d).subject).toBe("Booking BK-7F3K2Q is done: here's the proof");
    expect(buyerCopy("cancelled", d).subject).toBe("Booking BK-7F3K2Q is cancelled");
    expect(buyerCopy("paid", d).button).toBe("Open your booking");
  });
  it("gives the house a clear subject at each step", () => {
    expect(houseCopy("new_booking", d).subject).toBe("New booking BK-7F3K2Q from Wanjiku Foods: KES 481,400");
    expect(houseCopy("payment_claimed", d).subject).toBe("Wanjiku Foods says they've paid booking BK-7F3K2Q");
    expect(houseCopy("paid", d).subject).toBe("Booking BK-7F3K2Q is paid: check the ad");
    expect(houseCopy("files_added", d).subject).toBe("New ad files for booking BK-7F3K2Q");
    expect(houseCopy("final_approved", d).subject).toBe("Wanjiku Foods approved the ad for BK-7F3K2Q");
    expect(houseCopy("final_changes", d).subject).toBe("Wanjiku Foods asked for a change to the ad for BK-7F3K2Q");
    expect(houseCopy("paid", d).button).toBe("Open the booking");
  });
});

describe("a booked line in a few words", () => {
  it("says the choice, how many and when", () => {
    expect(lineWhat({ option: "6–9 AM", qty: 10, unit: "spot", model: "unit", kind: "spread", start: "2026-11-24", end: "2026-11-28" }))
      .toBe("6–9 AM · 10 spots · 24 to 28 Nov");
    expect(lineWhat({ option: null, qty: 1, unit: "1,000 views", model: "cpm", views: 66666, kind: "flight", start: "2026-11-24", end: "2026-12-07" }))
      .toBe("About 66,666 views · 24 Nov to 7 Dec");
    expect(lineWhat({ option: "30-second pre-roll", qty: 1, unit: "1,000 listens", model: "cpm", views: 20000, kind: "flight", start: "2026-11-24", end: "2026-11-30" }))
      .toBe("30-second pre-roll · About 20,000 listens · 24 to 30 Nov");
    expect(lineWhat({ option: null, qty: 2, unit: "day", model: "unit", kind: "dates", start: "2026-11-24", end: "2026-11-25", dates: ["2026-11-24", "2026-11-25"] }))
      .toBe("2 days · 24 Nov, 25 Nov");
    expect(lineWhat({ option: "Kiss 100", qty: 1, unit: "package", model: "unit", kind: "start", start: "2026-11-24" }))
      .toBe("Kiss 100 · 1 package · from 24 Nov");
  });
});

describe("who may work a house's booking", () => {
  it("lets super admins and the house's own staff in, and nobody else", () => {
    expect(houseScope({ isSuperAdmin: false }, false)).toBe(false);
    expect(houseScope({ isSuperAdmin: true }, false)).toBe(true);
    expect(houseScope({ isSuperAdmin: false }, true)).toBe(true);
  });
});

describe("booking before the house adds its bank details", () => {
  const d = { house: "Radio Africa Group", ref: "BK-7F3K2Q", total: "KES 98,600", buyer: "Wanjiku Foods" };

  it("tells the buyer an invoice is coming, and the house to send it", () => {
    const buyer = buyerCopy("created_bank", { ...d, details: false });
    expect(buyer.subject).toBe("Booking BK-7F3K2Q: Radio Africa Group will send how to pay");
    expect(buyer.body).toContain("invoice");
    expect(buyer.body).not.toContain("account below");
    expect(buyerCopy("created_bank", d).body).toContain("to the account below");
    const house = houseCopy("new_booking", { ...d, details: false });
    expect(house.body).toContain("Send Wanjiku Foods an invoice");
    expect(houseCopy("new_booking", d).body).not.toContain("invoice");
  });
});
