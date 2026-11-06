import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DraftsPanel } from "@/components/DraftsPanel";

// A stand-in for the database that remembers what was written, in order.
const db = vi.hoisted(() => ({
  campaign: {} as Record<string, unknown>,
  contest: null as null | { id: string; is_active: boolean },
  insertError: null as null | { message: string },
  writes: [] as { table: string; op: string; row: Record<string, unknown>; eq?: unknown[] }[],
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: table === "campaigns" ? db.campaign : table === "contests" ? db.contest : null,
          error: null,
        }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
        insert: async (row: Record<string, unknown>) => {
          db.writes.push({ table, op: "insert", row });
          return { error: table === "contests" ? db.insertError : null };
        },
        update: (row: Record<string, unknown>) => ({
          eq: async (...eq: unknown[]) => {
            db.writes.push({ table, op: "update", row, eq });
            return { error: null };
          },
        }),
      };
      return chain;
    },
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), refreshSession: async () => ({}) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), createSignedUrl: async () => ({ data: null }) }) },
  },
}));

const yellowCampaign = {
  require_draft_approval: false,
  name: "Uber Safety",
  hashtag: "UberKenya",
  start_date: null,
  end_date: null,
  agency_id: "agency-yellow",
  client_id: "client-uber",
};

const open = async (props: { campaignStatus?: string; onLinkChange?: () => void } = {}) => {
  render(<DraftsPanel campaignId="camp-1" {...props} />);
  // The switch stays disabled until the campaign has loaded.
  await waitFor(() => expect(screen.getByRole("switch")).not.toBeDisabled());
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(String(db.campaign.require_draft_approval));
};
const flip = () => fireEvent.click(screen.getByRole("switch"));
const writesTo = (table: string) => db.writes.filter((w) => w.table === table);

beforeEach(() => {
  db.campaign = { ...yellowCampaign };
  db.contest = null;
  db.insertError = null;
  db.writes = [];
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("turning video approval on", () => {
  it("sets up the submission link for the campaign's agency, then turns approval on", async () => {
    await open();
    flip();
    await waitFor(() => expect(writesTo("campaigns")).toHaveLength(1));
    expect(db.writes.map((w) => `${w.table}:${w.op}`)).toEqual(["contests:insert", "campaigns:update"]);
    expect(db.writes[0].row).toMatchObject({ campaign_id: "camp-1", agency_id: "agency-yellow", client_id: "client-uber", hashtag: "#UberKenya", prize: null });
    expect(db.writes[1].row).toEqual({ require_draft_approval: true });
  });

  it("leaves approval off when the link can't be made, so creators aren't told to upload with nowhere to go", async () => {
    db.insertError = { message: "permission denied" };
    await open();
    flip();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(writesTo("campaigns")).toHaveLength(0);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("doesn't make a second link when the campaign already has an open one", async () => {
    db.contest = { id: "contest-1", is_active: true };
    await open();
    flip();
    await waitFor(() => expect(writesTo("campaigns")).toHaveLength(1));
    expect(writesTo("contests")).toHaveLength(0);
  });

  it("reopens a closed link instead of adding one, because the brief always reads the oldest", async () => {
    db.contest = { id: "contest-1", is_active: false };
    await open();
    flip();
    await waitFor(() => expect(writesTo("campaigns")).toHaveLength(1));
    expect(writesTo("contests")).toEqual([{ table: "contests", op: "update", row: { is_active: true }, eq: ["id", "contest-1"] }]);
  });

  it("tells the campaign page, so the roster's copy-link item appears without a reload", async () => {
    const onLinkChange = vi.fn();
    await open({ onLinkChange });
    flip();
    await waitFor(() => expect(onLinkChange).toHaveBeenCalled());
  });
});

describe("turning video approval off", () => {
  it("leaves the link alone, because posts already submitted hang off it", async () => {
    db.campaign = { ...yellowCampaign, require_draft_approval: true };
    db.contest = { id: "contest-1", is_active: true };
    await open();
    flip();
    await waitFor(() => expect(writesTo("campaigns")).toHaveLength(1));
    expect(db.writes[0].row).toEqual({ require_draft_approval: false });
    expect(writesTo("contests")).toHaveLength(0);
  });
});

describe("a campaign that wants approval but has no way in for creators", () => {
  it("warns the team and sets the link up from the warning", async () => {
    db.campaign = { ...yellowCampaign, require_draft_approval: true };
    await open();
    expect(await screen.findByText(/can't reach the upload page/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /set up the link/i }));
    await waitFor(() => expect(writesTo("contests")).toHaveLength(1));
    expect(db.writes[0].op).toBe("insert");
  });

  it("warns when the link is closed too", async () => {
    db.campaign = { ...yellowCampaign, require_draft_approval: true };
    db.contest = { id: "contest-1", is_active: false };
    await open();
    expect(await screen.findByText(/can't reach the upload page/i)).toBeInTheDocument();
  });

  it("stays quiet when the link is open", async () => {
    db.campaign = { ...yellowCampaign, require_draft_approval: true };
    db.contest = { id: "contest-1", is_active: true };
    await open();
    expect(screen.queryByText(/can't reach the upload page/i)).toBeNull();
  });

  it("stays quiet when the campaign doesn't ask for approval", async () => {
    await open();
    expect(screen.queryByText(/can't reach the upload page/i)).toBeNull();
  });
});

describe("what the team is told about the campaign's status", () => {
  it("warns that a Draft campaign's posts stop refreshing, because the schedule skips drafts", async () => {
    db.campaign = { ...yellowCampaign, require_draft_approval: true };
    db.contest = { id: "contest-1", is_active: true };
    await open({ campaignStatus: "draft" });
    expect(await screen.findByText(/still a draft/i)).toBeInTheDocument();
  });

  it("says nothing once the campaign is live", async () => {
    db.campaign = { ...yellowCampaign, require_draft_approval: true };
    db.contest = { id: "contest-1", is_active: true };
    await open({ campaignStatus: "live" });
    expect(screen.queryByText(/still a draft/i)).toBeNull();
  });
});

describe("the panel's wording", () => {
  it("doesn't name another agency's client", async () => {
    await open();
    expect(screen.queryByText(/Unilever/)).toBeNull();
  });
});
