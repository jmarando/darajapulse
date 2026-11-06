import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreatorForm } from "@/components/creators/CreatorForm";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
      update: (row: unknown) => ({ eq: (_c: string, id: string) => ({ select: () => ({ single: () => mocks.update(id, row) }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/geo", () => ({ useGeo: () => ({ countries: [], citiesOf: () => [] }) }));

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const handleBox = (n: number) => screen.getAllByLabelText("Handle or profile link")[n];
const followersBox = (n: number) => screen.getAllByLabelText("Followers")[n];
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

const setup = (props: Partial<Parameters<typeof CreatorForm>[0]> = {}) => {
  const onSaved = vi.fn();
  render(<CreatorForm roster={[]} onSaved={onSaved} {...props} />);
  return { onSaved };
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.insert.mockResolvedValue({ data: { id: "new" }, error: null });
  mocks.update.mockResolvedValue({ data: { id: "saved" }, error: null });
});

describe("creating a creator", () => {
  it("saves several platforms for one creator, each with its followers", async () => {
    const { onSaved } = setup();
    type("Full name", "Jane Cooks");
    fireEvent.change(handleBox(0), { target: { value: "@janecooks" } });
    fireEvent.change(followersBox(0), { target: { value: "12000" } });
    fireEvent.change(handleBox(1), { target: { value: "https://www.instagram.com/jane.ig/" } });
    fireEvent.change(followersBox(1), { target: { value: "800" } });
    fireEvent.change(handleBox(2), { target: { value: "https://x.com/jane_x" } });
    press("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      full_name: "Jane Cooks",
      handle: "janecooks",
      primary_platform: "tiktok",
      alt_handles: ["instagram:jane.ig", "twitter:jane_x"],
      follower_count: 12000,
      account_stats: { "instagram:jane.ig": { followers: 800, engagement_rate: null } },
    }));
  });

  it("files a new creator under the campaign's agency when it is given one", async () => {
    const { onSaved } = setup({ agencyId: "ag9" });
    type("Full name", "Jane");
    press("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ agency_id: "ag9" });
  });

  it("needs a name", () => {
    setup();
    press("Save");
    expect(mocks.toast.error).toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("won't save a link it can't read", () => {
    setup();
    type("Full name", "Jane");
    fireEvent.change(handleBox(0), { target: { value: "https://vm.tiktok.com/ZM8abc/" } });
    press("Save");
    expect(mocks.toast.error).toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("saves without an email but says what that costs", async () => {
    const { onSaved } = setup();
    type("Full name", "Jane");
    press("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.toast.message).toHaveBeenCalledWith(expect.stringMatching(/email/i));
  });

  it("lowercases and trims the email", async () => {
    const { onSaved } = setup();
    type("Full name", "Jane");
    type(/^email/i, "  Jane@Example.COM ");
    press("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ email: "jane@example.com" });
  });
});

describe("catching someone already on the roster", () => {
  const roster = [{ id: "a", full_name: "Jane Cooks", handle: "janecooks", primary_platform: "tiktok", alt_handles: [], agency_id: "ag1", follower_count: 500 }];

  it("stops when a handle is already on the roster and adds the new accounts to that creator", async () => {
    const { onSaved } = setup({ roster });
    type("Full name", "J Cooks");
    fireEvent.change(handleBox(0), { target: { value: "janecooks" } });
    fireEvent.change(handleBox(1), { target: { value: "jane.ig" } });
    press("Save");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(screen.getByText(/already on your roster as Jane Cooks/i)).toBeInTheDocument();
    press(/add to jane cooks/i);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith("a", expect.objectContaining({ handle: "janecooks", alt_handles: ["instagram:jane.ig"], follower_count: 500 }));
  });

  it("asks about a same-named creator, and can still create a new one", async () => {
    const { onSaved } = setup({ roster });
    type("Full name", "jane cooks");
    fireEvent.change(handleBox(0), { target: { value: "different_handle" } });
    press("Save");
    expect(screen.getByText(/already have a Jane Cooks/i)).toBeInTheDocument();
    press(/create new/i);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalled();
  });

  it("doesn't call a creator a duplicate of themselves when editing", async () => {
    const { onSaved } = setup({ roster, row: roster[0] });
    press("Save changes");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalled();
  });
});

describe("editing a creator", () => {
  const row = {
    id: "r1", full_name: "Jane Cooks", handle: "janecooks", primary_platform: "tiktok", follower_count: 12000, engagement_rate: 3.5,
    alt_handles: ["instagram:jane.ig"], account_stats: { "instagram:jane.ig": { followers: 800 } }, niche: "Food", region: "Kenya",
    email: "jane@example.com", phone_mpesa: "254700000000", country_code: "KE", city: "Nairobi",
  };

  it("loads what's stored and saves an added platform without losing the rest", async () => {
    const { onSaved } = setup({ row });
    expect((handleBox(1) as HTMLInputElement).value).toBe("jane.ig");
    fireEvent.change(handleBox(2), { target: { value: "jane.fb" } });
    press("Save changes");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith("r1", expect.objectContaining({
      handle: "janecooks",
      alt_handles: ["instagram:jane.ig", "facebook:jane.fb"],
      follower_count: 12000,
      engagement_rate: 3.5,
      email: "jane@example.com",
    }));
  });

  it("keeps the numbers of a creator who has no handle yet", async () => {
    const { onSaved } = setup({ row: { ...row, handle: "", alt_handles: [], account_stats: null } });
    press("Save changes");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ follower_count: 12000, engagement_rate: 3.5, primary_platform: "tiktok" });
  });
});
