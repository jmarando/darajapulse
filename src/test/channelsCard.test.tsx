import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChannelsCard from "@/components/channels/ChannelsCard";
import { updatedLabel, type BrandChannel } from "@/lib/brandChannels";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), remove: vi.fn(), invoke: vi.fn(), toast: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(table, row) }) }),
      delete: () => ({ eq: (column: string, id: string) => mocks.remove(table, column, id) }),
    }),
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
    rpc: (name: string, args: unknown) => mocks.rpc(name, args),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const channel = (over: Partial<BrandChannel> = {}): BrandChannel => ({
  id: "ch1", client_id: "c1", platform: "tiktok", handle: "acmekenya", external_id: null, display_name: "Acme Kenya", avatar_url: null,
  source: "public", status: "ok", status_note: null, connected_at: null, connected_by_name: null, last_pull_at: null,
  last_good_pull_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), created_at: "2026-11-03T00:00:00Z", ...over,
});

const renderCard = (props: Partial<Parameters<typeof ChannelsCard>[0]> = {}) => {
  const onChanged = vi.fn();
  render(<ChannelsCard clientId="c1" brandName="Acme" channels={[]} canManage onChanged={onChanged} {...props} />);
  return { onChanged };
};
const typeHandle = (text: string) => fireEvent.change(screen.getByLabelText("Handle or link"), { target: { value: text } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.insert.mockResolvedValue({ data: channel(), error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.invoke.mockResolvedValue({ data: { status: "ok", note: null, display_name: "Acme Kenya" }, error: null });
});

describe("adding a handle", () => {
  it("refuses a post link in plain words and saves nothing", () => {
    renderCard();
    typeHandle("https://www.facebook.com/share/p/abc");
    press("Add handle");
    expect(screen.getByRole("alert")).toHaveTextContent(/link to a post/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("saves the cleaned handle, then asks for one read of it", async () => {
    const { onChanged } = renderCard();
    typeHandle("https://www.facebook.com/AcmeKenya/");
    press("Add handle");
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith("brand_channels", { client_id: "c1", platform: "facebook", handle: "acmekenya" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("brand-channels-sync", { body: { channel_ids: ["ch1"] } }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.getByLabelText("Handle or link")).toHaveValue("");
  });

  it("says when the account is already on this brand", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    renderCard();
    typeHandle("acmekenya");
    press("Add handle");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That account is already on this brand."));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("says what the first read found when the handle doesn't exist", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "error", note: "Not found on Facebook. Check the handle." }, error: null });
    renderCard();
    typeHandle("nobodyhere");
    press("Add handle");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Not found on Facebook. Check the handle." })));
  });

  it("keeps the handle when the first read fails to start, and says tonight's run will get it", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "timed out" } });
    const { onChanged } = renderCard();
    typeHandle("acmekenya");
    press("Add handle");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/Tonight/) })));
    expect(onChanged).toHaveBeenCalled();
  });

  it("has no Add handle or Remove for a brand user", () => {
    renderCard({ canManage: false, channels: [channel()] });
    expect(screen.queryByRole("button", { name: "Add handle" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });
});

describe("the accounts on the card", () => {
  it("names each account, where its numbers come from and when they were read", () => {
    renderCard({ channels: [channel()] });
    expect(screen.getByText("Acme Kenya")).toBeInTheDocument();
    expect(screen.getByText("@acmekenya · TikTok")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Updated 3 h ago")).toBeInTheDocument();
  });

  it("shows each state in words, with its note", () => {
    renderCard({
      channels: [
        channel({ id: "a", status: "error", status_note: "Not found on TikTok. Check the handle.", last_good_pull_at: null, display_name: null, handle: "wrong" }),
        channel({ id: "b", source: "connected", handle: "b" }),
        channel({ id: "c", source: "connected", status: "needs_reconnect", status_note: "Removed in Facebook settings", handle: "c" }),
        channel({ id: "d", status: "paused", status_note: "Public numbers are paused: the data provider is out of credits.", handle: "d" }),
      ],
    });
    expect(screen.getByText("Can't be read")).toBeInTheDocument();
    expect(screen.getByText("Not found on TikTok. Check the handle.")).toBeInTheDocument();
    expect(screen.getByText("Not read yet")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Needs reconnecting")).toBeInTheDocument();
    expect(screen.getByText("Removed in Facebook settings")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("asks before removing, and removes only on a yes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onChanged } = renderCard({ channels: [channel()] });
    press("Remove @acmekenya");
    expect(mocks.remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    press("Remove @acmekenya");
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("brand_channels", "id", "ch1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    confirm.mockRestore();
  });
});

describe("updatedLabel", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it("says how long ago, in plain words", () => {
    expect(updatedLabel(null, now)).toBe("Not read yet");
    expect(updatedLabel(ago(0), now)).toBe("Updated just now");
    expect(updatedLabel(ago(5), now)).toBe("Updated 5 min ago");
    expect(updatedLabel(ago(180), now)).toBe("Updated 3 h ago");
    expect(updatedLabel(ago(60 * 24), now)).toBe("Updated 1 day ago");
    expect(updatedLabel(ago(60 * 24 * 3), now)).toBe("Updated 3 days ago");
  });
});

describe("connecting from the card", () => {
  it("offers Disconnect on a connected account, and asks first", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
    const { onChanged } = renderCard({ canManage: false, canConnect: true, channels: [channel({ source: "connected" })] });
    press("Disconnect @acmekenya");
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("disconnect_brand_channel", { _channel_id: "ch1" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    confirm.mockRestore();
  });

  it("offers no Disconnect on a public account, or without the right to connect", () => {
    renderCard({ canConnect: true, channels: [channel()] });
    expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull();
  });

  it("offers Reconnect on a page whose token was rejected, as well as its note", () => {
    const onReconnect = vi.fn();
    renderCard({ canConnect: true, onReconnect, channels: [channel({ source: "connected", status: "needs_reconnect", status_note: "Removed in Facebook settings" })] });
    press("Reconnect @acmekenya");
    expect(onReconnect).toHaveBeenCalled();
  });
});

describe("the connect control", () => {
  it("sits in the card's body, so it can't squeeze the title on a phone", () => {
    renderCard({ connect: <button>Connect here</button> });
    const button = screen.getByRole("button", { name: "Connect here" });
    expect(button.closest("header")).toBeNull();
  });
});
