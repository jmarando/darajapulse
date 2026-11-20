import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Clients from "@/pages/app/Clients";

// The client form's Country field decides which country Listening searches and reads for the brand. A new brand starts
// on the country the workspace's brands use, and a workspace with no brands has to pick. Invented brands only.

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  insert: vi.fn(),
  update: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      // Reading the list: every filter hands back the same chain, and awaiting it gives the brands.
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "order", "in"]) chain[name] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.rows, error: null }).then(resolve);
      chain.insert = (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) });
      chain.update = (row: unknown) => ({ eq: (_column: string, id: string) => mocks.update(id, row) });
      return chain;
    },
    functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) },
  },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ agencyIds: ["ag1"], isSuperAdmin: false, loading: false }) }));
vi.mock("@/components/AgencyTeamPicker", () => ({ AgencyTeamPicker: () => null }));

// Radix's Select scrolls and captures the pointer in ways jsdom doesn't implement.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

const showPage = () => render(<MemoryRouter><Clients /></MemoryRouter>);
const country = () => screen.getByRole("combobox", { name: "Country" });
const pick = (name: string) => {
  fireEvent.keyDown(country(), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockImplementation(async (row: Record<string, unknown>) => ({ data: { id: "new1", ...row }, error: null }));
  mocks.update.mockResolvedValue({ error: null });
});

describe("the client form's Country", () => {
  it("asks a workspace with no brands to pick one, and won't add the brand without it", async () => {
    mocks.rows = [];
    showPage();
    await screen.findByText("No clients yet");
    fireEvent.click(screen.getByRole("button", { name: /new client/i }));
    fireEvent.change(screen.getByPlaceholderText("Unilever — Royco"), { target: { value: "Nile Crisps" } });
    expect(country()).toHaveTextContent("Pick a country");
    fireEvent.click(screen.getByRole("button", { name: "Add client" }));
    expect(mocks.toast.error).toHaveBeenCalledWith("Pick the brand's country");
    expect(mocks.insert).not.toHaveBeenCalled();
    pick("Uganda");
    fireEvent.click(screen.getByRole("button", { name: "Add client" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Nile Crisps", country: "Uganda" })));
  });

  it("starts a new brand on the country the workspace's brands use", async () => {
    mocks.rows = [{ id: "c1", name: "Nile Crisps", country: "Uganda", campaigns: [] }];
    showPage();
    await screen.findByText("Nile Crisps");
    fireEvent.click(screen.getByRole("button", { name: /new client/i }));
    expect(country()).toHaveTextContent("Uganda");
  });

  it("shows a brand's own country when it is edited, and saves a change", async () => {
    mocks.rows = [{ id: "c1", name: "Nuru Coffee", country: "Kenya", campaigns: [] }];
    showPage();
    await screen.findByText("Nuru Coffee");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(country()).toHaveTextContent("Kenya");
    pick("Uganda");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("c1", expect.objectContaining({ country: "Uganda" })));
  });
});
