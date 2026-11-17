// A saved storefront booking as the house reads it, for the house-side tests.
import type { BookingRow } from "@/lib/storefrontBooking";

export const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: "b1", agency_id: "a1", ref: "BK-7F3K2Q", token: "tok", status: "awaiting_payment", final_state: "none", pay_method: "bank",
  contact_name: "Wanjiku Kamau", contact_email: "wanjiku@example.com", contact_phone: "0712345678", company: "Wanjiku Foods",
  kra_pin: null, client_name: null, lines: [{ title: "Kiss 100: Spot adverts" }], materials: {}, kit: {}, files: [], final_files: [],
  media_kes: 350000, production_kes: 0, vat_kes: 56000, total_kes: 406000, start_date: "2026-11-24", end_date: "2026-11-28",
  paid_at: null, payment_ref: null, payment_claimed_at: null, payment_claimed_ref: null, pesapal_tracking_id: null, pesapal_status: null,
  refunded: false, refund_ref: null, schedule_note: null, proof: {}, internal_notes: null, created_at: "2026-11-16T08:00:00Z", ...over,
});
