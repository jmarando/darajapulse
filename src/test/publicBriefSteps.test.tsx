import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicBrief from "@/pages/PublicBrief";

// The database is the only thing stood in for; the page and its cards are the real ones.
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/publicClient", () => ({ publicSupabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const brief = (over: Record<string, unknown> = {}) => ({
  ci_id: "ci1",
  status: "confirmed",
  brief_token: "brief-token-0001",
  fee_kes: 1000,
  deliverables_count: 8,
  deliverables_breakdown: null,
  contract_required: false,
  contract_signed: false,
  submission_token: "uberkenya",
  campaign: { name: "Uber Safety", hashtag: "UberKenya" },
  client: { name: "Uber Kenya", logo_url: null },
  influencer: { id: "i1", full_name: "Test Creator", handle: "testcreator", primary_platform: "tiktok" },
  ...over,
});

const draftState = (over: Record<string, unknown> = {}) => ({ required: true, approved_available: false, drafts: [], ...over });

type Reply = { data: unknown; error: unknown };
const answer = (b: unknown, state: Reply) =>
  rpc.mockImplementation(async (name: string) => {
    if (name === "get_brief_by_token") return { data: b, error: null };
    if (name === "get_creator_draft_state") return state;
    return { data: null, error: null };
  });

const open = async () => {
  render(
    <MemoryRouter initialEntries={["/b/brief-token-0001"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/b/:token" element={<PublicBrief />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Uber Safety" });
};

const hrefOf = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("the brief's status row", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("keeps the status pill and no longer points at a next step that isn't there", async () => {
    answer(brief(), { data: draftState({ required: false }), error: null });
    await open();
    expect(screen.getByText(/Status:\s*confirmed/i)).toBeInTheDocument();
    expect(screen.queryByText(/see next step below/i)).toBeNull();
  });

  it("still thanks a creator who declined", async () => {
    answer(brief({ status: "declined" }), { data: draftState({ required: false }), error: null });
    await open();
    expect(screen.getByText(/your response has been recorded/i)).toBeInTheDocument();
  });
});

describe("the brief's links on a campaign that wants the video approved first", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("links the creator to the upload and to the post link, each opening on its own step", async () => {
    answer(brief(), { data: draftState(), error: null });
    await open();
    expect(hrefOf(/upload my video/i)).toBe("/c/uberkenya?k=brief-token-0001&step=1");
    expect(hrefOf(/send my post link/i)).toBe("/c/uberkenya?k=brief-token-0001&step=2");
  });

  it("copies the personal link without a step, because it is the one to keep for every video", async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    answer(brief(), { data: draftState(), error: null });
    await open();
    fireEvent.click(screen.getByRole("button", { name: /copy my link/i }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/c/uberkenya?k=brief-token-0001`);
  });

  it("holds both links back until the agreement is signed", async () => {
    answer(brief({ contract_required: true, contract_signed: false }), { data: draftState(), error: null });
    await open();
    expect(screen.queryByRole("link", { name: /upload my video/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /send my post link/i })).toBeNull();
    expect(screen.getByText(/sign the agreement above/i)).toBeInTheDocument();
  });

  it("shows both links once the agreement is signed", async () => {
    answer(brief({ contract_required: true, contract_signed: true }), { data: draftState(), error: null });
    await open();
    expect(screen.getByRole("link", { name: /upload my video/i })).toBeInTheDocument();
  });

  it("says the links aren't ready when the campaign has none, instead of showing nothing", async () => {
    answer(brief({ submission_token: null }), { data: draftState(), error: null });
    await open();
    expect(screen.getByText(/isn't ready yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /upload my video/i })).toBeNull();
  });

  it("tells a creator with an approved video to post it, even if a newer one is in review", async () => {
    answer(brief(), {
      data: draftState({
        approved_available: true,
        drafts: [
          { status: "pending", review_note: null, post_url: null },
          { status: "approved", review_note: null, post_url: null },
        ],
      }),
      error: null,
    });
    await open();
    expect(screen.getByText(/your video is approved/i)).toBeInTheDocument();
  });

  it("shows the reviewer's note when the latest video needs changes, because the decision email lands here", async () => {
    answer(brief(), { data: draftState({ drafts: [{ status: "changes_requested", review_note: "The logo is too small", post_url: null }] }), error: null });
    await open();
    expect(screen.getByText(/The logo is too small/)).toBeInTheDocument();
  });

  it("says the video is with the team while it waits", async () => {
    answer(brief(), { data: draftState({ drafts: [{ status: "pending", review_note: null, post_url: null }] }), error: null });
    await open();
    expect(screen.getByText(/with the team/i)).toBeInTheDocument();
  });
});

describe("the brief's links on any other campaign", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(cleanup);

  it("keeps the single post link and offers no upload", async () => {
    answer(brief(), { data: draftState({ required: false }), error: null });
    await open();
    expect(hrefOf(/submit a post link/i)).toBe("/c/uberkenya?k=brief-token-0001");
    expect(screen.queryByRole("link", { name: /upload my video/i })).toBeNull();
  });

  it("still gives the post link when the approval check fails, because the next page checks it again", async () => {
    answer(brief(), { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    await open();
    expect(hrefOf(/submit a post link/i)).toBe("/c/uberkenya?k=brief-token-0001");
  });

  it("shows nothing about submitting when there is no link and no approval step", async () => {
    answer(brief({ submission_token: null }), { data: draftState({ required: false }), error: null });
    await open();
    expect(screen.queryByText(/isn't ready yet/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /submit a post link/i })).toBeNull();
  });
});
