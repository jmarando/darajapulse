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
