// What a buyer's private booking link shows: the booking as the buyer may see it, never the house's notes, the token,
// the KRA PIN or Pesapal's tracking id. Pure, shared by the booking function and the tests.
import { adDue, type PayMethod, type Totals } from "./storefront-booking.ts";
import {
  nextStep, stateOf, timelineIndex, type BookingStatus, type FinalState, type NextStep,
} from "./storefront-booking-status.ts";

export type SavedFile = { slot?: string | null; path: string; name: string; type?: string | null; size?: number | null };

/** A storefront_bookings row as the functions read it. */
export type BookingRow = {
  id: string; agency_id: string; ref: string; token: string; status: BookingStatus; final_state: FinalState; pay_method: PayMethod;
  contact_name: string; contact_email: string; contact_phone: string | null; company: string | null; kra_pin: string | null;
  client_name: string | null;
  lines: Record<string, unknown>[]; materials: Record<string, { mode?: string | null; script?: string | null; topic?: string | null; notes?: string | null; guest?: string | null; guest_phone?: string | null }>;
  kit: Record<string, unknown>; files: SavedFile[]; final_files: SavedFile[];
  media_kes: number; production_kes: number; vat_kes: number; total_kes: number; start_date: string; end_date: string | null;
  paid_at: string | null; payment_ref: string | null; payment_claimed_at: string | null; payment_claimed_ref: string | null;
  pesapal_tracking_id: string | null; pesapal_status: string | null; pesapal_attempt?: number | null;
  refunded: boolean; refund_ref: string | null; request_id?: string | null;
  schedule_note: string | null; proof: { note?: string | null; views?: number | null; spots?: number | null; files?: SavedFile[] } | null;
  internal_notes: string | null; created_at: string;
};

export type PaymentDetails = {
  account_name: string | null; bank_name: string | null; bank_branch: string | null; account_number: string | null;
  paybill: string | null; paybill_account: string | null;
};

export type ViewHouse = { name: string; logo_url: string | null; primary_color: string | null; support_email: string | null };

export type PublicBookingView = {
  ref: string; status: BookingStatus; final_state: FinalState; timeline: number; next: NextStep;
  house: ViewHouse;
  buyer: { name: string; company: string | null; email: string; phone: string | null; client: string | null };
  lines: Record<string, unknown>[]; totals: Totals;
  pay_method: PayMethod; paid_at: string | null; payment_ref: string | null; payment_claimed_ref: string | null;
  pesapal_status: string | null; refunded: boolean; ready: { pesapal: boolean; bank: boolean };
  bank: (PaymentDetails & { reference: string }) | null; paid_to: string | null;
  materials: BookingRow["materials"]; kit: Record<string, unknown>;
  files: { slot: string | null; name: string; url: string }[];
  final_files: { name: string; url: string }[];
  proof: { note: string | null; views: number | null; spots: number | null; files: { name: string; url: string }[] } | null;
  schedule_note: string | null; created_at: string; start_date: string; end_date: string | null; ad_due: string;
};

/** Whether buyers can be told where to send a bank transfer: an account with its bank, or a paybill. */
export const bankReady = (p: PaymentDetails | null): boolean =>
  Boolean(p && ((p.account_number && p.bank_name) || (p.paybill && p.paybill_account)));

export function publicView(
  row: BookingRow,
  ctx: { house: ViewHouse; payment: PaymentDetails | null; urls: Record<string, string>; ready: { pesapal: boolean; bank: boolean }; today: string },
): PublicBookingView {
  const state = stateOf(row);
  const linked = (files: SavedFile[] | null | undefined) =>
    (files ?? []).filter((f) => ctx.urls[f.path]).map((f) => ({ slot: f.slot ?? null, name: f.name, url: ctx.urls[f.path] }));
  const awaitingTransfer = row.status === "awaiting_payment" && row.pay_method === "bank" && bankReady(ctx.payment);
  const proof = row.proof && (row.proof.note || row.proof.views || row.proof.spots || row.proof.files?.length)
    ? {
        note: row.proof.note ?? null, views: row.proof.views ?? null, spots: row.proof.spots ?? null,
        files: linked(row.proof.files).map(({ name, url }) => ({ name, url })),
      }
    : null;
  return {
    ref: row.ref,
    status: row.status,
    final_state: row.final_state,
    timeline: timelineIndex(state),
    next: nextStep(state, ctx.today),
    house: ctx.house,
    buyer: { name: row.contact_name, company: row.company, email: row.contact_email, phone: row.contact_phone, client: row.client_name },
    lines: row.lines ?? [],
    totals: { media: row.media_kes, production: row.production_kes, vat: row.vat_kes, total: row.total_kes },
    pay_method: row.pay_method,
    paid_at: row.paid_at,
    payment_ref: row.payment_ref,
    payment_claimed_ref: row.payment_claimed_ref,
    pesapal_status: row.pesapal_status,
    refunded: row.refunded,
    ready: ctx.ready,
    bank: awaitingTransfer && ctx.payment ? { ...ctx.payment, reference: row.ref } : null,
    paid_to: ctx.payment?.account_name ?? null,
    materials: row.materials ?? {},
    kit: row.kit ?? {},
    files: linked(row.files),
    final_files: linked(row.final_files).map(({ name, url }) => ({ name, url })),
    proof,
    schedule_note: row.schedule_note,
    created_at: row.created_at,
    start_date: row.start_date,
    end_date: row.end_date,
    ad_due: adDue(row.start_date),
  };
}
