// Rules about paying creators, shared by the dashboard, the edge functions and the tests.
// No imports: the dashboard and Vitest pull this file straight from supabase/functions/_shared.

/** A creator's payout details (one row of creator_payout_details), in the shape the rules work with. */
export interface DetailsLike {
  influencerId: string;
  mpesaNumber: string;
  mpesaName: string;
  kraPin: string;
  legalName: string;
  idNumber: string;
  vatRegistered: boolean;
  biiConsentAt: string | null;
  confirmedAt: string | null;
  lastChangedByKind: "creator" | "staff";
  mpesaChangedAt: string | null;
  mpesaChangedByKind: "creator" | "staff" | null;
  updatedAt: string;
}

/** A creator_payout_details row as the database returns it (snake_case) as DetailsLike. */
export function detailsFromRow(row: Record<string, unknown>): DetailsLike {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const orNull = (v: unknown) => (typeof v === "string" ? v : null);
  const kind = (v: unknown): "creator" | "staff" | null => (v === "creator" || v === "staff" ? v : null);
  return {
    influencerId: text(row.influencer_id),
    mpesaNumber: text(row.mpesa_number),
    mpesaName: text(row.mpesa_name),
    kraPin: text(row.kra_pin),
    legalName: text(row.legal_name),
    idNumber: text(row.id_number),
    vatRegistered: row.vat_registered === true,
    biiConsentAt: orNull(row.bii_consent_at),
    confirmedAt: orNull(row.confirmed_at),
    lastChangedByKind: kind(row.last_changed_by_kind) ?? "creator",
    mpesaChangedAt: orNull(row.mpesa_changed_at),
    mpesaChangedByKind: kind(row.mpesa_changed_by_kind),
    updatedAt: text(row.updated_at),
  };
}

/** Every field is filled in and the invoice route is covered: BII consent, or VAT-registered (they send their own invoice). */
export function isDetailsComplete(d: DetailsLike | undefined): boolean {
  if (!d) return false;
  const filled = [d.mpesaNumber, d.mpesaName, d.kraPin, d.legalName, d.idNumber].every((v) => v.trim() !== "");
  return filled && (d.vatRegistered || d.biiConsentAt !== null);
}

export type DetailsState = "missing" | "creator_confirmed" | "staff_entered";

/** Whose details these are: none yet, the creator's own, or entered or changed last by staff. */
export function detailsState(d: DetailsLike | undefined): DetailsState {
  if (!d) return "missing";
  return d.lastChangedByKind === "staff" ? "staff_entered" : "creator_confirmed";
}

export type InvoiceStatus = "not_raised" | "raised" | "approved" | "declined" | "expired";
export type InvoiceRoute = "bii" | "creator";

/** KRA gives the creator 30 days to approve a Buyer Initiated invoice on *222#; with no answer it is rejected. */
export const INVOICE_APPROVAL_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** The calendar day in Nairobi (UTC+3) as YYYY-MM-DD. */
const nairobiDay = (when: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(when));

/** The last moment the creator can approve an invoice raised at `raisedAt`. */
export function invoiceDeadline(raisedAt: string | Date): Date {
  return new Date(new Date(raisedAt).getTime() + INVOICE_APPROVAL_WINDOW_DAYS * DAY_MS);
}

/** Whole days until the deadline, rounded up: 0 only once it has passed. */
export function daysLeft(deadline: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS));
}

/**
 * When a creator becomes payable (YYYY-MM-DD, Nairobi): the later of the invoice approval and the report approval,
 * plus the campaign's payment terms. Nothing until both approvals are in.
 */
export function dueDate(i: { invoiceApprovedAt: string | null; reportApprovedAt: string | null; paymentTermsDays: number | null }): string | null {
  if (!i.invoiceApprovedAt || !i.reportApprovedAt) return null;
  const later = [nairobiDay(i.invoiceApprovedAt), nairobiDay(i.reportApprovedAt)].sort()[1]; // ISO dates sort as text
  const due = new Date(`${later}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (i.paymentTermsDays ?? 0));
  return due.toISOString().slice(0, 10);
}

/** Whether staff can put this payout in a KRA batch file, and if not, why in a few words. */
export function canRaiseBii(i: { grossKes: number; invoiceStatus: InvoiceStatus; details: DetailsLike | undefined }):
  { ok: true } | { ok: false; reason: string } {
  if (i.invoiceStatus === "approved") return { ok: false, reason: "Invoice already approved" };
  if (i.invoiceStatus === "raised") return { ok: false, reason: "Invoice already raised" };
  if (!isDetailsComplete(i.details)) return { ok: false, reason: "Details missing" };
  if (i.details?.vatRegistered) return { ok: false, reason: "VAT-registered: needs their own invoice" };
  if (!(i.grossKes > 0)) return { ok: false, reason: "Nothing to invoice (KES 0)" };
  return { ok: true };
}

/** A payout never has both a BII invoice and a creator-issued one: the route is fixed while an invoice is out. */
export function canChangeRoute(i: { invoiceStatus: InvoiceStatus }): boolean {
  return i.invoiceStatus !== "raised" && i.invoiceStatus !== "approved";
}

/** A date as Nairobi reads it, like "31 Oct 2026". */
export function formatNairobiDate(when: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }).format(new Date(when));
}
