import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChannelsPage from "@/components/channels/ChannelsPage";

const mocks = vi.hoisted(() => ({ brands: vi.fn(), members: vi.fn(), channels: vi.fn(), rpc: vi.fn(), auth: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "clients") return { select: () => ({ order: () => mocks.brands() }) };
      if (table === "client_members") return { select: () => ({ eq: () => mocks.members() }) };
      return { select: () => ({ eq: () => ({ order: () => mocks.channels() }) }) };
    },
    rpc: (name: string, args: unknown) => mocks.rpc(name, args),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/PostThumb", () => ({ PostThumb: () => null }));

const emptyDoc = { client: { name: "Acme", logo_url: null }, from: "2026-10-01", to: "2026-10-31", previous_from: "2026-08-31", previous_to: "2026-09-30", channels: [], days: [], posts: [] };
const open = (portal = false, route = "/app/channels") => render(<MemoryRouter initialEntries={[route]}><ChannelsPage portal={portal} /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockReturnValue({ user: { id: "u1" }, isAgency: true, isSuperAdmin: false });
  mocks.brands.mockResolvedValue({ data: [{ id: "c1", name: "Acme" }] });
  mocks.members.mockResolvedValue({ data: [{ clients: { id: "c1", name: "Acme" } }] });
  mocks.channels.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: emptyDoc, error: null });
});

describe("ChannelsPage", () => {
  it("asks staff to add handles when a brand has none", async () => {
    open();
    expect(await screen.findByText("Add this brand's handles to start its report.")).toBeInTheDocument();
  });

  it("tells a brand user their agency hasn't added their accounts yet", async () => {
    mocks.auth.mockReturnValue({ user: { id: "u1" }, isAgency: false, isSuperAdmin: false });
    open(true);
    expect(await screen.findByText("Your agency hasn't added your accounts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add handle" })).toBeNull();
  });

  it("asks for the report of the brand in the address, for the period on screen", async () => {
    open(false, "/app/channels?brand=c9");
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("get_brand_report_rows", expect.objectContaining({ _client_id: "c9" })));
    const { _from, _to } = mocks.rpc.mock.calls[0][1];
    expect(_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("says it couldn't load instead of showing an empty report when the rows call fails, and tries again", async () => {
    mocks.channels.mockResolvedValue({ data: [{ id: "ch1", client_id: "c1", platform: "tiktok", handle: "acme", source: "public", status: "ok" }], error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    open();
    expect(await screen.findByText("Couldn't load the report.")).toBeInTheDocument();
    expect(screen.queryByText("Followers")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Couldn't load the report.")).toBeNull());
  });

  it("explains itself when there is no brand yet", async () => {
    mocks.brands.mockResolvedValue({ data: [] });
    open();
    expect(await screen.findByText("Add a client first. Channels run per client brand.")).toBeInTheDocument();
  });

  it("tells a brand user with no brand to ask their agency", async () => {
    mocks.auth.mockReturnValue({ user: { id: "u1" }, isAgency: false, isSuperAdmin: false });
    mocks.members.mockResolvedValue({ data: [] });
    open(true);
    expect(await screen.findByText("Your account isn't linked to a brand yet. Ask your agency to invite you.")).toBeInTheDocument();
  });
});
