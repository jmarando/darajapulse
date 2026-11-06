import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicContestSubmit from "@/pages/PublicContestSubmit";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const brief = {
  contract_required: false,
  contract_signed: false,
  deliverables_count: 8,
  influencer: { id: "i1", full_name: "Test Creator", handle: "testcreator", primary_platform: "tiktok" },
};
const answer = ({ state, hashtag = "#UberKenya" }: { state: unknown; hashtag?: string }) =>
  rpc.mockImplementation(async (name: string) => {
    if (name === "get_contest_by_token") return { data: { name: "Uber Safety — Post Submissions", hashtag, prize: null, client: { name: "Uber Kenya" } }, error: null };
    if (name === "get_brief_by_token") return { data: brief, error: null };
    if (name === "get_creator_draft_state") return { data: state, error: null };
    return { data: null, error: null };
  });

const open = async (search: string, findText: RegExp) => {
  render(
    <MemoryRouter initialEntries={[`/c/uberkenya${search}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/c/:token" element={<PublicContestSubmit />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByText(findText);
};

const uploadHeading = /send your video for approval/i;
const approvedFirstHeading = /get your video approved first/i;
const postLinkLabel = /^post link/i;

const nothingYet = { required: true, approved_available: false, drafts: [] };
const approvedWaiting = { required: true, approved_available: true, drafts: [{ id: "d1", status: "approved", post_url: null, created_at: "2026-11-05T09:00:00Z" }] };

describe("which step the personal link opens on", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("opens on the upload when the brief's upload button was pressed", async () => {
    answer({ state: nothingYet });
    await open("?k=brief-token-0001&step=1", uploadHeading);
  });

  it("keeps a creator on the upload they asked for, even with an approved video waiting", async () => {
    answer({ state: approvedWaiting });
    await open("?k=brief-token-0001&step=1", uploadHeading);
    // Give the "approved, so go to step 2" effect its chance to run.
    await screen.findByRole("button", { name: /send for approval/i });
    expect(screen.queryByLabelText(postLinkLabel)).toBeNull();
  });

  it("opens on the post link when the brief's post link button was pressed", async () => {
    answer({ state: approvedWaiting });
    await open("?k=brief-token-0001&step=2", postLinkLabel);
  });

  it("says the video needs approval first when the post link button was pressed too early", async () => {
    answer({ state: nothingYet });
    await open("?k=brief-token-0001&step=2", approvedFirstHeading);
    expect(screen.queryByText(uploadHeading)).toBeNull();
  });

  it("still opens on the upload for a link with no step and nothing approved", async () => {
    answer({ state: nothingYet });
    await open("?k=brief-token-0001", uploadHeading);
  });

  it("still jumps to the post link for a link with no step and a video approved", async () => {
    answer({ state: approvedWaiting });
    await open("?k=brief-token-0001", postLinkLabel);
  });
});

describe("a campaign with no hashtag", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  const noApproval = { required: false, approved_available: false, drafts: [] };

  it("asks creators to post with the hashtag when there is one", async () => {
    answer({ state: noApproval });
    await open("?k=brief-token-0001", /Post with/);
    expect(screen.getAllByText("#UberKenya").length).toBeGreaterThan(0);
  });

  it("doesn't ask them to post with nothing", async () => {
    answer({ state: noApproval, hashtag: "" });
    await open("?k=brief-token-0001", /Post, then drop the link/);
    expect(screen.queryByText(/Post with/)).toBeNull();
  });

  it("doesn't have them confirm the post includes nothing", async () => {
    answer({ state: noApproval, hashtag: "" });
    await open("?k=brief-token-0001", /the required brand mentions/);
    expect(screen.getByText(/the required brand mentions/).textContent).toMatch(/includes the required brand mentions/);
  });
});
