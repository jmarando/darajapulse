import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BroadcastCreatorsDialog } from "@/components/BroadcastCreatorsDialog";

const db = vi.hoisted(() => ({
  campaign: {} as Record<string, unknown> | null,
  contest: null as null | { submission_token: string },
}));
const invoke = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: table === "campaigns" ? db.campaign : table === "contests" ? db.contest : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      };
      return chain;
    },
    functions: { invoke },
  },
}));

const open = async () => {
  render(
    <BroadcastCreatorsDialog
      campaignId="camp-1"
      campaignName="Uber Safety"
      clientName="Uber Kenya"
      emails={["creator@example.test"]}
      recipients={[{ email: "creator@example.test", name: "Test Creator", briefToken: "brief-token-0001", fee: 1000, videos: 8 }]}
      briefBase="https://yellow.darajapulse.com/uber-kenya/uber-safety/brief"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /email creators/i }));
  await screen.findByRole("button", { name: /preview email/i });
  // Let the dialog's reads of the campaign and its contest land.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

const previewedData = async () => {
  fireEvent.click(screen.getByRole("button", { name: /preview email/i }));
  await waitFor(() => expect(invoke).toHaveBeenCalled());
  return invoke.mock.calls[0][1].body.templateData;
};

beforeEach(() => {
  db.campaign = { require_draft_approval: true, contract_template_id: null };
  db.contest = { submission_token: "uberkenya" };
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { html: "<p>hi</p>", subject: "s" }, error: null });
  toast.error.mockReset();
});
afterEach(cleanup);

describe("the brief email for a campaign", () => {
  it("says there's no agreement to sign when the campaign has none", async () => {
    await open();
    expect(screen.queryByText(/where they also sign the contract/i)).toBeNull();
    expect(await previewedData()).toMatchObject({ has_agreement: false, needs_approval: true });
  });

  it("says there is one when the campaign has a contract", async () => {
    db.campaign = { require_draft_approval: true, contract_template_id: "tmpl-1" };
    await open();
    expect(screen.getByText(/where they also sign the contract/i)).toBeInTheDocument();
    expect(await previewedData()).toMatchObject({ has_agreement: true, needs_approval: true });
  });

  it("carries each creator's personal link to both the brief and the submission page", async () => {
    await open();
    expect(await previewedData()).toMatchObject({
      brief_url: "https://yellow.darajapulse.com/uber-kenya/uber-safety/brief/brief-token-0001",
      submit_url: expect.stringContaining("/c/uberkenya?k=brief-token-0001"),
    });
  });

  it("tells staff where to fix it when there is no submission link to send", async () => {
    db.contest = null;
    await open();
    fireEvent.click(screen.getByRole("button", { name: /send brief email to 1/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/video approvals/i)));
    expect(invoke).not.toHaveBeenCalled();
  });
});
