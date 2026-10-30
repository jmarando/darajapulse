import { beforeEach, describe, expect, it, vi } from "vitest";
import { markInvoicesRaised, recordCreatorInvoice, recordInvoiceDecision, setPaymentTerms, setReportApprovedAt } from "@/lib/payouts/staffApi";

// Only the database is stood in for. These calls must produce rows the invoices migration's constraints accept.
const db = vi.hoisted(() => ({
  updates: [] as { table: string; values: Record<string, unknown>; column: string; match: unknown }[],
  uploads: [] as { bucket: string; path: string; type: string }[],
  uploadError: null as { message: string } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (column: string, match: unknown) => { db.updates.push({ table, values, column, match }); return { error: null }; },
        in: async (column: string, match: unknown) => { db.updates.push({ table, values, column, match }); return { error: null }; },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: File) => { db.uploads.push({ bucket, path, type: file.type }); return { error: db.uploadError }; },
      }),
    },
  },
}));

const iso = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

describe("invoice calls for the Payments tab", () => {
  beforeEach(() => { db.updates = []; db.uploads = []; db.uploadError = null; });

  it("marks the chosen payouts as raised through BII, clearing any earlier decision", async () => {
    await markInvoicesRaised(["p1", "p2"]);
    expect(db.updates).toEqual([{
      table: "payouts", column: "id", match: ["p1", "p2"],
      values: { invoice_route: "bii", invoice_status: "raised", invoice_raised_at: iso, invoice_decided_at: null, invoice_number: null, invoice_file_path: null },
    }]);
  });

  it("records an approval with its number and date", async () => {
    await recordInvoiceDecision("p1", { status: "approved", invoiceNumber: "ETIMS-1", decidedAt: "2026-11-05T09:00:00Z" });
    expect(db.updates).toEqual([{
      table: "payouts", column: "id", match: "p1",
      values: { invoice_status: "approved", invoice_number: "ETIMS-1", invoice_decided_at: "2026-11-05T09:00:00Z" },
    }]);
  });

  it("records a decline or an expiry with its date and no number", async () => {
    await recordInvoiceDecision("p1", { status: "declined", decidedAt: "2026-11-05T09:00:00Z" });
    await recordInvoiceDecision("p2", { status: "expired", decidedAt: "2026-12-05T09:00:00Z" });
    expect(db.updates.map((u) => u.values)).toEqual([
      { invoice_status: "declined", invoice_decided_at: "2026-11-05T09:00:00Z" },
      { invoice_status: "expired", invoice_decided_at: "2026-12-05T09:00:00Z" },
    ]);
  });

  it("stores a creator's own invoice, with its file, as raised on the creator route", async () => {
    const file = new File(["%PDF"], "My Invoice.pdf", { type: "application/pdf" });
    await recordCreatorInvoice("p1", "a1", file, "ETIMS-9");
    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0]).toMatchObject({ bucket: "payout-invoices", type: "application/pdf" });
    expect(db.uploads[0].path).toMatch(/^a1\/p1\/\d+-My_Invoice\.pdf$/);
    expect(db.updates).toEqual([{
      table: "payouts", column: "id", match: "p1",
      values: {
        invoice_route: "creator", invoice_status: "raised", invoice_number: "ETIMS-9", invoice_raised_at: iso,
        invoice_decided_at: null, invoice_file_path: db.uploads[0].path,
      },
    }]);
  });

  it("stores a creator's invoice number without a file", async () => {
    await recordCreatorInvoice("p1", "a1", null, "ETIMS-9");
    expect(db.uploads).toEqual([]);
    expect(db.updates[0].values).toMatchObject({ invoice_route: "creator", invoice_status: "raised", invoice_file_path: null });
  });

  it("doesn't mark the invoice raised when the file didn't upload", async () => {
    db.uploadError = { message: "The object exceeded the maximum allowed size" };
    await expect(recordCreatorInvoice("p1", "a1", new File(["x"], "big.pdf", { type: "application/pdf" }), "ETIMS-9")).rejects.toThrow("exceeded the maximum");
    expect(db.updates).toEqual([]);
  });

  it("sets the campaign's payment terms, or clears them", async () => {
    await setPaymentTerms("c1", 45);
    await setPaymentTerms("c1", null);
    expect(db.updates).toEqual([
      { table: "campaigns", column: "id", match: "c1", values: { payment_terms_days: 45 } },
      { table: "campaigns", column: "id", match: "c1", values: { payment_terms_days: null } },
    ]);
  });

  it("moves the report approval date to noon in Nairobi, so the day can't slip", async () => {
    await setReportApprovedAt("p1", "2026-11-10");
    expect(db.updates).toEqual([{ table: "payouts", column: "id", match: "p1", values: { report_approved_at: "2026-11-10T12:00:00+03:00" } }]);
  });
});
