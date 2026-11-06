import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GetPaidCard from "@/components/payouts/GetPaidCard";

// Only the database is stood in for; the card, its validation and its states are the real ones.
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc } }));

const signed = { contract_signed: true, details: null, payout: null };
const saved = {
  contract_signed: true,
  payout: null,
  details: {
    mpesa_number_masked: "07••• ••• 678", mpesa_name: "Jane Kamau", kra_pin_masked: "A••••••789Z", legal_name: "Jane Wanjiku Kamau",
    id_number_masked: "••••5678", vat_registered: false, bii_consent: true, confirmed_at: "2026-10-30T09:00:00Z",
  },
};

const answer = (card: unknown, save: () => unknown = () => ({ data: saved, error: null })) =>
  rpc.mockImplementation(async (name: string) => (name === "get_payout_card_by_token" ? { data: card, error: null } : save()));
const saveCalls = () => rpc.mock.calls.filter(([name]) => name === "save_payout_details_by_token");
const consent = /approve it on \*222#/;

const open = async () => {
  render(<GetPaidCard token="tok" />);
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("get_payout_card_by_token", { _token: "tok" }));
  await act(async () => { await Promise.resolve(); });
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillForm = (overrides: Partial<Record<"number" | "confirm" | "mpesaName" | "pin" | "legal" | "id", string>> = {}) => {
  const v = { number: "0712 345 678", confirm: "0712345678", mpesaName: "Jane Kamau", pin: "a123456789z", legal: "Jane Wanjiku Kamau", id: "12345678", ...overrides };
  type("M-Pesa (Safaricom) number", v.number);
  type("Type the number again", v.confirm);
  type("Name registered on this M-Pesa line", v.mpesaName);
  type("KRA PIN", v.pin);
  type("Full name as on your ID", v.legal);
  type("ID number", v.id);
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Save details" }));

describe("GetPaidCard", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("shows nothing until the agreement is signed", async () => {
    answer({ contract_signed: false, details: null, payout: null });
    await open();
    expect(screen.queryByText(/get paid/i)).toBeNull();
  });

  it("asks for the details and says why", async () => {
    answer(signed);
    await open();
    expect(screen.getByRole("heading", { name: "Get paid" })).toBeInTheDocument();
    expect(screen.getByText("KRA needs your name as on your ID and your ID number to raise your eTIMS invoice.")).toBeInTheDocument();
    expect(screen.getByText(/M-Pesa \(Safaricom\) number/)).toBeInTheDocument();
    expect(screen.getByLabelText(consent)).toBeInTheDocument();
  });

  it("blocks mismatched numbers", async () => {
    answer(signed);
    await open();
    fillForm({ confirm: "0722000000" });
    fireEvent.click(screen.getByLabelText(consent));
    submit();
    expect(await screen.findByText("The two numbers don't match")).toBeInTheDocument();
    expect(saveCalls()).toHaveLength(0);
  });

  it("saves the normalised values", async () => {
    answer(signed);
    await open();
    fillForm();
    fireEvent.click(screen.getByLabelText(consent));
    submit();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_payout_details_by_token", {
      _token: "tok",
      _details: {
        mpesa_number: "254712345678", mpesa_name: "Jane Kamau", kra_pin: "A123456789Z", legal_name: "Jane Wanjiku Kamau",
        id_number: "12345678", vat_registered: false, bii_consent: true,
      },
    }));
    expect(await screen.findByText("07••• ••• 678")).toBeInTheDocument();
  });

  it("shows saved details masked", async () => {
    answer(saved);
    await open();
    expect(screen.getByText("07••• ••• 678")).toBeInTheDocument();
    expect(screen.getByText("A••••••789Z")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update details" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("A123456789Z");
  });

  it("VAT-registered creators get no consent box and a different note", async () => {
    answer(signed);
    await open();
    fireEvent.click(screen.getByLabelText("I'm registered for VAT"));
    expect(screen.queryByLabelText(consent)).toBeNull();
    expect(screen.getByText("You'll send us your own eTIMS invoice.")).toBeInTheDocument();
  });

  it("shows the RPC error", async () => {
    // Supabase hands a database error back as `error`; it does not reject.
    answer(signed, () => ({ data: null, error: { message: "Sign your agreement first" } }));
    await open();
    fillForm();
    fireEvent.click(screen.getByLabelText(consent));
    submit();
    expect(await screen.findByText("Sign your agreement first")).toBeInTheDocument();
  });

  it("shows a friendly message when the connection drops", async () => {
    rpc.mockResolvedValueOnce({ data: signed, error: null }).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await open();
    fillForm();
    fireEvent.click(screen.getByLabelText(consent));
    submit();
    expect(await screen.findByText("Couldn't reach the server. Check your connection and try again.")).toBeInTheDocument();
  });
});

describe("GetPaidCard invoice status", () => {
  const payout = (over: Record<string, unknown> = {}) => ({
    ...saved,
    payout: {
      status: "pending", gross_kes: 5000, net_kes: 4750, invoice_route: null, invoice_status: "not_raised",
      invoice_raised_at: null, invoice_decided_at: null, report_approved_at: "2026-10-28T09:00:00Z", payment_terms_days: 45, ...over,
    },
  });
  const decline = "Your invoice wasn't approved. We'll raise it again, so watch for KRA's text.";

  beforeEach(() => {
    rpc.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T08:00:00Z"));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("says the figure is final before the invoice is raised", async () => {
    answer(payout());
    await open();
    expect(screen.getByText("Your figure is final: KES 5,000. We'll raise your eTIMS invoice next.")).toBeInTheDocument();
  });

  it("asks the creator to approve a raised BII invoice by the deadline", async () => {
    answer(payout({ invoice_route: "bii", invoice_status: "raised", invoice_raised_at: "2026-11-02T08:00:00Z" }));
    await open();
    expect(screen.getByText("Approve your invoice on *222# by 2 Dec 2026 (12 days left).")).toBeInTheDocument();
  });

  it("says a creator's own invoice is being checked", async () => {
    answer(payout({ invoice_route: "creator", invoice_status: "raised", invoice_raised_at: "2026-11-02T08:00:00Z" }));
    await open();
    expect(screen.getByText("We're checking the invoice you sent.")).toBeInTheDocument();
  });

  it("gives the payment due date once the invoice is approved", async () => {
    answer(payout({ invoice_route: "bii", invoice_status: "approved", invoice_raised_at: "2026-11-02T08:00:00Z", invoice_decided_at: "2026-11-05T09:00:00Z" }));
    await open();
    expect(screen.getByText("Invoice approved. Payment due 20 Dec 2026.")).toBeInTheDocument();
  });

  it("says the due date is to be confirmed when it can't be worked out", async () => {
    answer(payout({ invoice_route: "bii", invoice_status: "approved", invoice_decided_at: "2026-11-05T09:00:00Z", report_approved_at: null }));
    await open();
    expect(screen.getByText("Invoice approved. Payment due date to be confirmed.")).toBeInTheDocument();
  });

  it.each(["declined", "expired"])("tells the creator a %s invoice will be raised again", async (status) => {
    answer(payout({ invoice_route: "bii", invoice_status: status, invoice_raised_at: "2026-10-02T08:00:00Z", invoice_decided_at: "2026-11-01T08:00:00Z" }));
    await open();
    expect(screen.getByText(decline)).toBeInTheDocument();
  });
});
