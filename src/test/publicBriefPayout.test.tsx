import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicBrief from "@/pages/PublicBrief";

// Only the database is stood in for. The agreement has its own tests, so here it just marks where the card goes.
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc } }));
vi.mock("@/components/ContractSign", () => ({ default: () => <div data-testid="contract-sign" /> }));

const brief = (contractSigned: boolean) => ({
  ci_id: "ci1", status: "pending", brief_token: "tok", fee_kes: 5000, deliverables_count: 1, deliverables_breakdown: null,
  contract_required: true, contract_signed: contractSigned, submission_token: null,
  campaign: { name: "Royco KE Q3 Nano", hashtag: "#RoycoKitchenTales" },
  client: { name: "Royco", logo_url: null },
  influencer: { id: "i1", full_name: "Jane Wanjiku", handle: "jane", primary_platform: "tiktok" },
});

const open = async (contractSigned: boolean) => {
  rpc.mockImplementation(async (name: string) => {
    if (name === "get_brief_by_token") return { data: brief(contractSigned), error: null };
    if (name === "get_payout_card_by_token") return { data: { contract_signed: contractSigned, details: null, payout: null }, error: null };
    return { data: null, error: null };
  });
  render(
    <MemoryRouter initialEntries={["/b/tok"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/b/:token" element={<PublicBrief />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByTestId("contract-sign");
};

describe("PublicBrief payout card", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("shows the Get paid card once the agreement is signed", async () => {
    await open(true);
    expect(await screen.findByRole("heading", { name: "Get paid" })).toBeInTheDocument();
  });

  it("keeps the card away until then, and doesn't even ask for it", async () => {
    await open(false);
    expect(screen.queryByRole("heading", { name: "Get paid" })).toBeNull();
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("get_payout_card_by_token");
  });
});
