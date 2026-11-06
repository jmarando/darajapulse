import { describe, expect, it } from "vitest";
import { detailsFromRow, detailsState, isDetailsComplete, type DetailsLike } from "../../supabase/functions/_shared/payout-rules";

const d = (o: Partial<DetailsLike> = {}): DetailsLike => ({
  influencerId: "i1", mpesaNumber: "254712345678", mpesaName: "Jane Kamau", kraPin: "A123456789Z", legalName: "Jane Wanjiku Kamau",
  idNumber: "12345678", vatRegistered: false, biiConsentAt: "2026-10-31T08:00:00Z", confirmedAt: "2026-10-31T08:00:00Z",
  lastChangedByKind: "creator", mpesaChangedAt: null, mpesaChangedByKind: null, updatedAt: "2026-10-31T08:00:00Z", ...o,
});

describe("payout details rules", () => {
  it("calls details complete only when every field is there and consent or VAT covers the invoice", () => {
    expect(isDetailsComplete(d())).toBe(true);
    expect(isDetailsComplete(undefined)).toBe(false);
    expect(isDetailsComplete(d({ biiConsentAt: null }))).toBe(false);
    expect(isDetailsComplete(d({ biiConsentAt: null, vatRegistered: true }))).toBe(true);
    expect(isDetailsComplete(d({ kraPin: "" }))).toBe(false);
    expect(isDetailsComplete(d({ mpesaNumber: "" }))).toBe(false);
  });

  it("names the state of a creator's details", () => {
    expect([detailsState(undefined), detailsState(d()), detailsState(d({ lastChangedByKind: "staff" }))])
      .toEqual(["missing", "creator_confirmed", "staff_entered"]);
  });

  it("reads a database row", () => {
    const row = {
      influencer_id: "i1", mpesa_number: "254712345678", mpesa_name: "Jane Kamau", kra_pin: "A123456789Z", legal_name: "Jane Wanjiku Kamau",
      id_number: "12345678", vat_registered: false, bii_consent_at: "2026-10-31T08:00:00Z", confirmed_at: "2026-10-31T08:00:00Z",
      last_changed_by_kind: "creator", mpesa_changed_at: null, mpesa_changed_by_kind: null, updated_at: "2026-10-31T08:00:00Z",
    };
    expect(detailsFromRow(row)).toEqual(d());
  });
});
