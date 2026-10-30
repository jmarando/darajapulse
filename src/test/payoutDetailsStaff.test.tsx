import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CampaignPayments from "@/components/CampaignPayments";
import { detailsRow, props } from "./helpers/paymentsFixtures";

// Only the database is stood in for; the tab, the dialog and the checks are the real ones.
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  errors: {} as Record<string, { message: string }>,
  upsert: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit"]) chain[method] = () => chain;
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.upsert = (...args: unknown[]) => db.upsert(table, ...args);
      chain.then = (resolve: (reply: unknown) => unknown) =>
        resolve(db.errors[table] ? { data: null, error: db.errors[table] } : { data: db.tables[table] ?? [], error: null });
      return chain;
    },
  },
}));

// Radix's select and dialog lean on a few browser APIs that jsdom leaves out.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

const open = async () => {
  render(<CampaignPayments {...props()} />);
  await screen.findByText("Jane Wanjiku");
};
const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillDialog = (over: Partial<Record<"number" | "mpesaName" | "pin" | "legal" | "id", string>> = {}) => {
  const v = { number: "0712 345 678", mpesaName: "Jane Kamau", pin: "a123456789z", legal: "Jane Wanjiku Kamau", id: "12345678", ...over };
  type("M-Pesa (Safaricom) number", v.number);
  type("Name registered on this M-Pesa line", v.mpesaName);
  type("KRA PIN", v.pin);
  type("Full name as on their ID", v.legal);
  type("ID number", v.id);
};
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save details" }));
const upserted = () => db.upsert.mock.calls[0]?.[1] as Record<string, unknown>;
const chooseFilter = (label: string) => {
  fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: label }));
};

describe("staff payout details in the Payments tab", () => {
  beforeEach(() => { db.tables = {}; db.errors = {}; db.upsert.mockReset().mockResolvedValue({ error: null }); });
  afterEach(cleanup);

  it("saves staff-entered details, normalised", async () => {
    await open();
    fireEvent.click(within(rowOf("Wanjiru Kamau")).getByRole("button", { name: "Add details" }));
    fillDialog();
    fireEvent.click(screen.getByLabelText(/creator agreed/i));
    save();
    await waitFor(() => expect(db.upsert).toHaveBeenCalledTimes(1));
    expect(db.upsert).toHaveBeenCalledWith("creator_payout_details", expect.objectContaining({
      agency_id: "a1", influencer_id: "i3", mpesa_number: "254712345678", mpesa_name: "Jane Kamau", kra_pin: "A123456789Z",
      legal_name: "Jane Wanjiku Kamau", id_number: "12345678", vat_registered: false, bii_consent_at: expect.any(String),
    }), { onConflict: "agency_id,influencer_id" });
    expect(upserted()).not.toHaveProperty("confirmed_at"); // only the creator confirms their own details
  });

  it("keeps the creator's own consent time when staff re-save", async () => {
    db.tables.creator_payout_details = [detailsRow("i1", { bii_consent_at: "2026-10-31T08:00:00Z" })];
    await open();
    await within(rowOf("Jane Wanjiku")).findByText("Creator confirmed");
    fireEvent.click(within(rowOf("Jane Wanjiku")).getByRole("button", { name: "Edit details" }));
    type("Name registered on this M-Pesa line", "Jane W Kamau");
    save();
    await waitFor(() => expect(db.upsert).toHaveBeenCalledTimes(1));
    expect(upserted()).toMatchObject({ mpesa_name: "Jane W Kamau", bii_consent_at: "2026-10-31T08:00:00Z" });
  });

  it("refuses a bad PIN", async () => {
    await open();
    fireEvent.click(within(rowOf("Wanjiru Kamau")).getByRole("button", { name: "Add details" }));
    fillDialog({ pin: "B123456789Z" });
    fireEvent.click(screen.getByLabelText(/creator agreed/i));
    save();
    expect(await screen.findByText("Enter your KRA PIN, like A123456789Z")).toBeInTheDocument();
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("labels each creator's state", async () => {
    db.tables.creator_payout_details = [detailsRow("i1"), detailsRow("i2", { last_changed_by_kind: "staff" })];
    await open();
    expect(await screen.findByText("Creator confirmed")).toBeInTheDocument();
    expect(screen.getByText("Staff entered")).toBeInTheDocument();
    expect(screen.getByText("Details missing")).toBeInTheDocument();
  });

  it("flags a staff-made number change", async () => {
    db.tables.creator_payout_details = [detailsRow("i1", { last_changed_by_kind: "staff", mpesa_changed_at: "2026-10-31T08:00:00Z", mpesa_changed_by_kind: "staff" })];
    await open();
    expect(await screen.findByText(/Number changed by staff/)).toBeInTheDocument();
  });

  it("filters to creators with incomplete details", async () => {
    db.tables.creator_payout_details = [detailsRow("i1"), detailsRow("i2")];
    await open();
    await within(rowOf("Jane Wanjiku")).findByText("Creator confirmed");
    chooseFilter("Missing details");
    await waitFor(() => expect(screen.queryByText("Jane Wanjiku")).toBeNull());
    expect(screen.getByText("Wanjiru Kamau")).toBeInTheDocument();
    expect(screen.queryByText("Peter Otieno")).toBeNull();
  });

  it("doesn't call everyone missing when the details can't be loaded", async () => {
    db.errors.creator_payout_details = { message: 'relation "creator_payout_details" does not exist' };
    await open();
    expect(await screen.findByText("Payout details aren't available yet.")).toBeInTheDocument();
    expect(screen.queryByText("Details missing")).toBeNull();
  });
});
