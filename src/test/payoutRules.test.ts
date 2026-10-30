import { describe, expect, it } from "vitest";
import {
  INVOICE_APPROVAL_WINDOW_DAYS, canChangeRoute, canRaiseBii, daysLeft, detailsFromRow, detailsState, dueDate, formatNairobiDate,
  invoiceDeadline, isDetailsComplete, type DetailsLike, type InvoiceStatus,
} from "../../supabase/functions/_shared/payout-rules";

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

describe("invoice rules", () => {
  it("works out the due date: the later of invoice and report approval, plus the payment terms", () => {
    expect(dueDate({ invoiceApprovedAt: "2026-11-05T09:00:00Z", reportApprovedAt: "2026-10-28T10:00:00Z", paymentTermsDays: 45 })).toBe("2026-12-20");
    expect(dueDate({ invoiceApprovedAt: "2026-10-30T09:00:00Z", reportApprovedAt: "2026-11-10T10:00:00Z", paymentTermsDays: 45 })).toBe("2026-12-25");
  });

  it("counts the day in Nairobi, not UTC, and treats missing terms as none", () => {
    expect(dueDate({ invoiceApprovedAt: "2026-10-30T22:00:00Z", reportApprovedAt: "2026-10-01T00:00:00Z", paymentTermsDays: null })).toBe("2026-10-31");
  });

  it("has no due date until both approvals are in", () => {
    expect(dueDate({ invoiceApprovedAt: null, reportApprovedAt: "2026-10-01T00:00:00Z", paymentTermsDays: 45 })).toBeNull();
    expect(dueDate({ invoiceApprovedAt: "2026-10-01T00:00:00Z", reportApprovedAt: null, paymentTermsDays: 45 })).toBeNull();
  });

  it("gives the creator 30 days to approve a BII invoice", () => {
    expect(INVOICE_APPROVAL_WINDOW_DAYS).toBe(30);
    expect(invoiceDeadline("2026-11-02T08:00:00Z").toISOString()).toBe("2026-12-02T08:00:00.000Z");
  });

  it("counts days left: never below zero, and never zero while time remains", () => {
    const deadline = new Date("2026-12-02T08:00:00Z");
    expect(daysLeft(deadline, new Date("2026-11-20T08:00:00Z"))).toBe(12);
    expect(daysLeft(deadline, new Date("2026-12-01T20:00:00Z"))).toBe(1);
    expect(daysLeft(deadline, new Date("2026-12-09T08:00:00Z"))).toBe(0);
  });

  it("says when an invoice can be raised through BII, and why not", () => {
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "not_raised", details: d() })).toEqual({ ok: true });
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "not_raised", details: undefined })).toEqual({ ok: false, reason: "Details missing" });
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "not_raised", details: d({ vatRegistered: true }) })).toEqual({ ok: false, reason: "VAT-registered: needs their own invoice" });
    expect(canRaiseBii({ grossKes: 0, invoiceStatus: "not_raised", details: d() })).toEqual({ ok: false, reason: "Nothing to invoice (KES 0)" });
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "raised", details: d() })).toEqual({ ok: false, reason: "Invoice already raised" });
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "approved", details: d() })).toEqual({ ok: false, reason: "Invoice already approved" });
  });

  it("lets a declined or expired invoice be raised again", () => {
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "declined", details: d() })).toEqual({ ok: true });
    expect(canRaiseBii({ grossKes: 5000, invoiceStatus: "expired", details: d() })).toEqual({ ok: true });
  });

  it("keeps one invoice route once an invoice is out", () => {
    const statuses: InvoiceStatus[] = ["not_raised", "raised", "approved", "declined", "expired"];
    expect(statuses.map((invoiceStatus) => canChangeRoute({ invoiceStatus }))).toEqual([true, false, false, true, true]);
  });

  it("writes dates the way Nairobi reads them", () => {
    expect(formatNairobiDate("2026-10-30T22:30:00Z")).toBe("31 Oct 2026");
  });
});
