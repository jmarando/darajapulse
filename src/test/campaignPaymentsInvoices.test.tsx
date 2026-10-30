import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CampaignPayments from "@/components/CampaignPayments";
import * as staffApi from "@/lib/payouts/staffApi";
import { detailsRow, props } from "./helpers/paymentsFixtures";

// Only the database is stood in for. The data calls are spies here: their payloads have their own tests.
const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit"]) chain[method] = () => chain;
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.then = (resolve: (reply: unknown) => unknown) => resolve({ data: db.tables[table] ?? [], error: null });
      return chain;
    },
  },
}));
vi.mock("@/lib/payouts/staffApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payouts/staffApi")>()),
  markInvoicesRaised: vi.fn(async () => {}),
  recordInvoiceDecision: vi.fn(async () => {}),
  recordCreatorInvoice: vi.fn(async () => {}),
  setPaymentTerms: vi.fn(async () => {}),
  setReportApprovedAt: vi.fn(async () => {}),
}));

// Radix's select and dialog lean on a few browser APIs that jsdom leaves out.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

const blobs: Blob[] = [];
const readBlob = (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});

const payoutRow = (id: string, influencerId: string, over: Record<string, unknown> = {}) => ({
  id, campaign_id: "c1", influencer_id: influencerId, gross_kes: 5000, wht_kes: 250, net_kes: 4750, status: "pending", mpesa_ref: null,
  created_at: "2026-10-28T09:00:00Z", report_approved_at: "2026-10-28T09:00:00Z",
  invoice_route: null, invoice_status: "not_raised", invoice_number: null, invoice_raised_at: null, invoice_decided_at: null, invoice_file_path: null,
  ...over,
});
const raisedBii = { invoice_route: "bii", invoice_status: "raised", invoice_raised_at: "2026-11-02T08:00:00Z" };
const approvedBii = { invoice_route: "bii", invoice_status: "approved", invoice_raised_at: "2026-11-02T08:00:00Z", invoice_number: "ETIMS-001", invoice_decided_at: "2026-11-05T09:00:00Z" };

const open = async (over: Parameters<typeof props>[0] = {}) => {
  render(<CampaignPayments {...props(over)} />);
  await screen.findByText("Jane Wanjiku");
};
const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
const download = (n: number) => screen.getByRole("button", { name: `Download KRA invoice file (${n})` });
const chooseFilter = (label: string) => {
  fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: label }));
};

describe("eTIMS invoices in the Payments tab", () => {
  beforeEach(() => {
    db.tables = {};
    blobs.length = 0;
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return "blob:kra"; });
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("only offers creators who can be invoiced for the KRA file, and says why for the rest", async () => {
    db.tables.payouts = [payoutRow("p1", "i1"), payoutRow("p2", "i2")];
    db.tables.creator_payout_details = [detailsRow("i1")];
    await open();
    await within(rowOf("Jane Wanjiku")).findByText("Creator confirmed");
    expect(download(0)).toBeDisabled();
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("checkbox"));
    expect(download(1)).toBeEnabled();
    expect(screen.getByTitle("Details missing")).toBeDisabled();
  });

  it("ticks every creator who can be invoiced at once", async () => {
    db.tables.payouts = [payoutRow("p1", "i1"), payoutRow("p2", "i2"), payoutRow("p3", "i3")];
    db.tables.creator_payout_details = [detailsRow("i1"), detailsRow("i3")];
    await open();
    await within(rowOf("Jane Wanjiku")).findByText("Creator confirmed");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all eligible creators" }));
    expect(download(2)).toBeEnabled();
  });

  it("downloads the file and marks exactly those creators raised", async () => {
    db.tables.payouts = [payoutRow("p1", "i1"), payoutRow("p2", "i2")];
    db.tables.creator_payout_details = [detailsRow("i1")];
    await open();
    await within(rowOf("Jane Wanjiku")).findByText("Creator confirmed");
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("checkbox"));
    fireEvent.click(download(1));
    await waitFor(() => expect(staffApi.markInvoicesRaised).toHaveBeenCalledWith(["p1"]));
    expect(await readBlob(blobs[0])).toContain('"Jane Wanjiku Kamau","12345678","0712345678"');
  });

  it("won't record an approval without an invoice number", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", raisedBii)];
    db.tables.creator_payout_details = [detailsRow("i1")];
    await open();
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("button", { name: "Mark approved" }));
    fireEvent.click(screen.getByRole("button", { name: "Save approval" }));
    expect(await screen.findByText("Enter the eTIMS invoice number")).toBeInTheDocument();
    expect(staffApi.recordInvoiceDecision).not.toHaveBeenCalled();
  });

  it("records an approval with its number", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", raisedBii)];
    db.tables.creator_payout_details = [detailsRow("i1")];
    await open();
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("button", { name: "Mark approved" }));
    fireEvent.change(screen.getByLabelText("eTIMS invoice number"), { target: { value: "ETIMS-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save approval" }));
    await waitFor(() => expect(staffApi.recordInvoiceDecision).toHaveBeenCalledWith("p1", { status: "approved", invoiceNumber: "ETIMS-001", decidedAt: expect.any(String) }));
  });

  it("records a decline or an expiry in one click", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", raisedBii), payoutRow("p2", "i2", raisedBii)];
    await open();
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("button", { name: "Declined" }));
    fireEvent.click(within(rowOf("Peter Otieno")).getByRole("button", { name: "Expired" }));
    await waitFor(() => expect(staffApi.recordInvoiceDecision).toHaveBeenCalledTimes(2));
    expect(staffApi.recordInvoiceDecision).toHaveBeenCalledWith("p1", { status: "declined", decidedAt: expect.any(String) });
    expect(staffApi.recordInvoiceDecision).toHaveBeenCalledWith("p2", { status: "expired", decidedAt: expect.any(String) });
  });

  it("lists raised invoices with the days the creator has left", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T08:00:00Z"));
    db.tables.payouts = [payoutRow("p1", "i1", raisedBii)];
    await open();
    expect(within(rowOf("Jane Wanjiku")).getByText("12 days left")).toBeInTheDocument();
  });

  it("shows the due date once the invoice is approved", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", approvedBii)];
    await open({ paymentTermsDays: 45 });
    expect(within(rowOf("Jane Wanjiku")).getByText("Due 20 Dec 2026")).toBeInTheDocument();
  });

  it("lets staff move the report approval date", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", approvedBii)];
    await open();
    fireEvent.change(within(rowOf("Jane Wanjiku")).getByLabelText("Report approved"), { target: { value: "2026-11-10" } });
    await waitFor(() => expect(staffApi.setReportApprovedAt).toHaveBeenCalledWith("p1", "2026-11-10"));
  });

  it("sends VAT-registered creators to their own invoice instead", async () => {
    db.tables.payouts = [payoutRow("p1", "i1")];
    db.tables.creator_payout_details = [detailsRow("i1", { vat_registered: true, bii_consent_at: null })];
    await open();
    await within(rowOf("Jane Wanjiku")).findByText("Creator confirmed");
    expect(screen.getByTitle("VAT-registered: needs their own invoice")).toBeDisabled();
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("button", { name: "Upload their invoice" }));
    fireEvent.change(await screen.findByLabelText("eTIMS invoice number"), { target: { value: "ETIMS-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save invoice" }));
    await waitFor(() => expect(staffApi.recordCreatorInvoice).toHaveBeenCalledWith("p1", "a1", null, "ETIMS-9"));
  });

  it("asks for the invoice number before saving a creator's own invoice", async () => {
    db.tables.payouts = [payoutRow("p1", "i1")];
    await open();
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("button", { name: "Upload their invoice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save invoice" }));
    expect(await screen.findByText("Enter the eTIMS invoice number")).toBeInTheDocument();
    expect(staffApi.recordCreatorInvoice).not.toHaveBeenCalled();
  });

  it("warns when the figure moved after the invoice was raised", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", raisedBii)];
    await open({
      posts: [{ id: "post1", influencer_id: "i1", platform: "tiktok", post_url: "https://tiktok.test/1" }],
      metrics: [{ post_id: "post1", views: 5000, reach: 0, captured_at: new Date().toISOString() }],
    });
    expect(within(rowOf("Jane Wanjiku")).getByText("Figures changed since the invoice was raised (live KES 7,000, invoiced KES 5,000)")).toBeInTheDocument();
  });

  it("filters to invoices that are raised and not yet approved", async () => {
    db.tables.payouts = [payoutRow("p1", "i1", raisedBii), payoutRow("p2", "i2", approvedBii), payoutRow("p3", "i3")];
    await open();
    chooseFilter("Raised, not yet approved");
    await waitFor(() => expect(screen.queryByText("Peter Otieno")).toBeNull());
    expect(screen.getByText("Jane Wanjiku")).toBeInTheDocument();
    expect(screen.queryByText("Wanjiru Kamau")).toBeNull();
  });

  it("saves the campaign's payment terms, or clears them", async () => {
    await open({ paymentTermsDays: 30 });
    const input = screen.getByLabelText("Payment terms (days)");
    expect(input).toHaveValue(30);
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.blur(input);
    await waitFor(() => expect(staffApi.setPaymentTerms).toHaveBeenCalledWith("c1", 45));
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect(staffApi.setPaymentTerms).toHaveBeenLastCalledWith("c1", null));
  });
});
