import { describe, expect, it } from "vitest";
import { listRows, tiles } from "@/lib/storefrontBookings";
import { booking } from "./fixtures/bookingRows";
import type { StorefrontRequest } from "@/lib/storefrontRequests";

const request = (over: Partial<StorefrontRequest> = {}): StorefrontRequest => ({
  id: "r1", agency_id: "a1", items: [{ title: "Station bar event, Nairobi" }], contact_name: "Otieno", contact_email: "o@example.com",
  contact_phone: null, company: "Otieno Events", budget_kes: 200000, target_start: null, target_end: null, message: null,
  status: "quoted", internal_notes: null, created_at: "2026-11-17T08:00:00Z", ...over,
});

const today = "2026-11-17";
const now = Date.parse("2026-11-17T12:00:00Z");

describe("the house's list", () => {
  it("puts what the house must do first, newest after", () => {
    const rows = listRows([booking({ payment_claimed_ref: "FT123" })], [request()], today, now);
    expect(rows.map((r) => r.next.label)).toEqual(["Confirm payment", "Waiting on the client"]);
    expect(rows[0]).toMatchObject({ type: "booking", who: "Wanjiku Foods", sub: "Wanjiku Kamau", amount: 406000 });
  });
  it("tucks away online payments never finished after a day", () => {
    const [row] = listRows([booking({ pay_method: "pesapal", created_at: "2026-11-15T08:00:00Z" })], [], today, now);
    expect(row.abandoned).toBe(true);
  });
  it("counts this month's paid bookings", () => {
    const bookings = [
      booking({ id: "b1", status: "paid", paid_at: "2026-11-03T10:00:00Z", total_kes: 406000 }),
      booking({ id: "b2", status: "done", paid_at: "2026-10-31T10:00:00Z", total_kes: 100000 }),
      booking({ id: "b3", status: "live", paid_at: "2026-11-10T10:00:00Z", total_kes: 50000 }),
    ];
    expect(tiles(listRows(bookings, [], today, now), bookings, today)).toMatchObject({ paidThisMonth: 456000, live: 1 });
  });
});
