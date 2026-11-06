import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AddCreatorsDialog } from "@/components/creators/AddCreatorsDialog";
import { candidateFromProfiles, candidateFromRow } from "@/lib/creatorCandidates";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  discovery: vi.fn(),
  contacts: vi.fn(),
  campaigns: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "influencers") {
        return {
          insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
          update: (row: unknown) => ({ eq: (_c: string, id: string) => ({ select: () => ({ single: () => mocks.update(id, row) }) }) }),
        };
      }
      if (table === "campaign_influencers") {
        return { upsert: (rows: unknown, options: unknown) => ({ select: () => mocks.upsert(rows, options) }) };
      }
      if (table === "discovery_contacts") {
        return { select: () => ({ in: () => mocks.contacts() }) };
      }
      if (table === "campaigns") {
        return { select: () => ({ order: () => mocks.campaigns() }) };
      }
      // discovery_creators: every filter hands back the same chain, and awaiting it gives the rows.
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "or", "in", "limit", "order"]) chain[name] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.discovery()).then(resolve);
      return chain;
    },
  },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/geo", () => ({ useGeo: () => ({ countries: [], citiesOf: () => [] }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ agencyIds: ["ag1"] }) }));

const campaign = { id: "camp1", name: "Royal Mix", agency_id: "ag1" };
const roster = [
  { id: "a", full_name: "Jane Cooks", handle: "janecooks", primary_platform: "tiktok", alt_handles: ["instagram:jane.ig"], agency_id: "ag1", follower_count: 12000, email: "jane@example.com" },
  { id: "b", full_name: "Brian Otieno", handle: "brian.o", primary_platform: "instagram", alt_handles: [], agency_id: "ag1", follower_count: 800, email: null },
  { id: "c", full_name: "Other Agency", handle: "other", primary_platform: "tiktok", alt_handles: [], agency_id: "ag2", follower_count: 5 },
];

const open = (props: Partial<Parameters<typeof AddCreatorsDialog>[0]> = {}) => {
  const onDone = vi.fn();
  render(<AddCreatorsDialog open onOpenChange={vi.fn()} roster={roster} onDone={onDone} campaign={campaign} {...props} />);
  return { onDone };
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const tick = (name: RegExp) => fireEvent.click(screen.getByRole("checkbox", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.upsert.mockImplementation(async (rows: unknown[]) => ({ data: rows, error: null }));
  mocks.insert.mockImplementation(async (row: Record<string, unknown>) => ({ data: { id: "new1", ...row }, error: null }));
  mocks.update.mockImplementation(async (id: string, row: Record<string, unknown>) => ({ data: { id, ...row }, error: null }));
  mocks.discovery.mockResolvedValue({ data: [], error: null });
  mocks.contacts.mockResolvedValue({ data: [], error: null });
  mocks.campaigns.mockResolvedValue({ data: [{ id: "camp1", name: "Royal Mix", status: "live", agency_id: "ag1" }], error: null });
});

describe("adding from the roster on a campaign page", () => {
  it("adds several creators in one go, each with the fee and deliverables", async () => {
    const { onDone } = open();
    tick(/jane cooks/i);
    tick(/brian otieno/i);
    press(/continue with 2/i);
    fireEvent.change(screen.getByLabelText(/fee for each/i), { target: { value: "5000" } });
    press(/add 2 to royal mix/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [rows, options] = mocks.upsert.mock.calls[0];
    expect(rows).toEqual([
      expect.objectContaining({ campaign_id: "camp1", influencer_id: "a", fee_kes: 5000, deliverables_count: 1 }),
      expect.objectContaining({ campaign_id: "camp1", influencer_id: "b", fee_kes: 5000, deliverables_count: 1 }),
    ]);
    expect(rows[0].deliverables_breakdown.items[0].platforms).toEqual(["tiktok", "instagram"]);
    expect(options).toMatchObject({ onConflict: "campaign_id,influencer_id", ignoreDuplicates: true });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("lets one creator's fee differ", async () => {
    const { onDone } = open();
    tick(/jane cooks/i);
    tick(/brian otieno/i);
    press(/continue with 2/i);
    fireEvent.change(screen.getByLabelText(/fee for each/i), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText(/fee for brian otieno/i), { target: { value: "9000" } });
    press(/add 2 to royal mix/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.upsert.mock.calls[0][0][1].fee_kes).toBe(9000);
  });

  it("only offers the campaign's own agency's roster", () => {
    open();
    expect(screen.queryByRole("checkbox", { name: /other agency/i })).toBeNull();
  });

  it("leaves out creators already on this campaign", () => {
    open({ onCampaign: new Set(["a"]) });
    expect(screen.queryByRole("checkbox", { name: /jane cooks/i })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /brian otieno/i })).toBeInTheDocument();
  });

  it("finds a creator by a handle on any of their platforms", () => {
    open();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "jane.ig" } });
    expect(screen.getByRole("checkbox", { name: /jane cooks/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /brian otieno/i })).toBeNull();
  });

  it("filters by platform across all their accounts", () => {
    open();
    fireEvent.change(screen.getByLabelText(/platform filter/i), { target: { value: "instagram" } });
    expect(screen.getByRole("checkbox", { name: /jane cooks/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /brian otieno/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/platform filter/i), { target: { value: "tiktok" } });
    expect(screen.queryByRole("checkbox", { name: /brian otieno/i })).toBeNull();
  });

  it("warns about anyone with no email, because Broadcast can't reach them", () => {
    open();
    tick(/brian otieno/i);
    press(/continue with 1/i);
    expect(screen.getByText(/no email/i)).toBeInTheDocument();
  });
});

describe("creating a new creator from the campaign", () => {
  it("offers the many-platform form and selects the new creator", async () => {
    open();
    press(/create new/i);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Hassan" } });
    fireEvent.change(screen.getAllByLabelText("Handle or profile link")[0], { target: { value: "amina" } });
    fireEvent.change(screen.getAllByLabelText("Handle or profile link")[1], { target: { value: "amina.ig" } });
    press("Save");
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ agency_id: "ag1", handle: "amina", alt_handles: ["instagram:amina.ig"] });
    expect(await screen.findByRole("checkbox", { name: /amina hassan/i })).toBeChecked();
  });
});

describe("adding from Discovery", () => {
  const person = () => candidateFromProfiles(
    [
      { id: "p1", full_name: "New Person", handle: "newperson", platform: "tiktok", follower_count: 5000 },
      { id: "p2", full_name: "New Person", handle: "new.ig", platform: "instagram", follower_count: 900 },
    ],
    [{ creator_id: "p1", kind: "email", value: "new@example.com", is_public: true }],
  );

  it("puts them on the roster with every account and their contact, and on the campaign", async () => {
    const { onDone } = open({ initial: [person()] });
    expect(screen.getByText(/new creator/i)).toBeInTheDocument();
    press(/add 1 to royal mix/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      agency_id: "ag1", full_name: "New Person", handle: "newperson", alt_handles: ["instagram:new.ig"], email: "new@example.com", follower_count: 5000,
    });
    expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ influencer_id: "new1" });
  });

  it("doesn't make a second row for someone already on the roster, and adds what's new to them", async () => {
    const known = candidateFromProfiles(
      [{ id: "p1", full_name: "J Cooks", handle: "janecooks", platform: "tiktok" }, { id: "p2", full_name: "J Cooks", handle: "jane_x", platform: "twitter" }],
      [],
    );
    const { onDone } = open({ initial: [known] });
    expect(screen.getByText(/already on your roster/i)).toBeInTheDocument();
    press(/add 1 to royal mix/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith("a", expect.objectContaining({ handle: "janecooks", alt_handles: ["instagram:jane.ig", "twitter:jane_x"] }));
    expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ influencer_id: "a" });
  });

  it("lets an account be unticked before saving", async () => {
    const { onDone } = open({ initial: [person()] });
    fireEvent.click(screen.getByRole("checkbox", { name: /new\.ig/i }));
    press(/add 1 to royal mix/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ handle: "newperson", alt_handles: [] });
  });

  it("can add to the roster alone, with no campaign", async () => {
    const { onDone } = open({ campaign: null, initial: [person()] });
    press(/add 1 to roster/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("finds people from Discovery while on a campaign", async () => {
    mocks.discovery.mockResolvedValue({
      data: [
        { id: "p1", full_name: "New Person", handle: "newperson", platform: "tiktok", follower_count: 5000 },
        { id: "p2", full_name: "New Person", handle: "new.ig", platform: "instagram", follower_count: 900 },
      ],
      error: null,
    });
    open();
    press(/discovery/i);
    fireEvent.change(screen.getByLabelText(/search discovery/i), { target: { value: "new person" } });
    fireEvent.submit(screen.getByLabelText(/search discovery/i).closest("form")!);
    const box = await screen.findByRole("checkbox", { name: /new person/i });
    fireEvent.click(box);
    press(/continue with 1/i);
    expect(screen.getByText(/new creator/i)).toBeInTheDocument();
  });

  it("shows when saving fails and doesn't claim success", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { message: "nope" } });
    const { onDone } = open({ initial: [person()] });
    press(/add 1 to royal mix/i);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/new person/i)));
    expect(onDone).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("sending roster creators to a campaign from the Creators page", () => {
  it("asks which campaign, then adds them", async () => {
    const { onDone } = open({ campaign: null, initial: [candidateFromRow(roster[0])] });
    const chooser = await screen.findByLabelText(/campaign/i);
    expect(screen.getByRole("button", { name: /add 1/i })).toBeDisabled();
    await screen.findByRole("option", { name: /royal mix/i });
    fireEvent.change(chooser, { target: { value: "camp1" } });
    press(/add 1 to royal mix/i);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.upsert.mock.calls[0][0][0]).toMatchObject({ campaign_id: "camp1", influencer_id: "a" });
  });
});

describe("pasting a list", () => {
  it("reads it, recognises who is on the roster, and adds the rest", async () => {
    const { onDone } = open();
    press(/paste a list/i);
    fireEvent.change(screen.getByLabelText("Paste your list"), { target: { value: "https://www.tiktok.com/@janecooks\nAmina Hassan, https://www.instagram.com/amina.ig/\nhttps://vm.tiktok.com/ZM8abc/" } });
    press(/read list/i);
    await screen.findByText(/check and add/i);
    expect(screen.getByText("Amina Hassan")).toBeInTheDocument();
    expect(screen.getByText(/already on your roster/i)).toBeInTheDocument();
    expect(screen.getByText(/short link/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /add 2 to royal mix/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.insert.mock.calls.map((c) => c[0].full_name)).toContain("Amina Hassan");
  });
});
