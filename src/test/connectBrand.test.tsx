import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ConnectBrand from "@/pages/ConnectBrand";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), assign: vi.fn() }));
vi.mock("@/integrations/supabase/publicClient", () => ({
  publicSupabase: {
    rpc: (name: string, args: unknown) => mocks.rpc(name, args),
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
  },
}));

const open = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/connect/brand/done" element={<ConnectBrand />} />
        <Route path="/connect/brand/:token" element={<ConnectBrand />} />
      </Routes>
    </MemoryRouter>,
  );
const link = (status: string) => ({ data: { status, brand_name: "Acme", brand_logo: null, agency_name: "Good Agency" }, error: null });
const assets = [
  { id: "p1", platform: "facebook", name: "Acme Kenya", username: "AcmeKenya", avatar_url: null, page_id: "p1" },
  { id: "i1", platform: "instagram", name: "Acme IG", username: "acme.kenya", avatar_url: null, page_id: "p1" },
];
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign: mocks.assign } });
});

describe("the page behind a connect link", () => {
  it("says who is asking, what Pulse reads and what it won't do, with a tip for in-app browsers", async () => {
    mocks.rpc.mockResolvedValue(link("open"));
    open("/connect/brand/tok");
    expect(await screen.findByRole("button", { name: "Continue with Facebook" })).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_brand_connect_link", { _token: "tok" });
    expect(screen.getByRole("heading", { name: "Connect Acme to Daraja Pulse" })).toBeInTheDocument();
    expect(screen.getByText(/Good Agency uses Daraja Pulse/)).toBeInTheDocument();
    expect(screen.getByText(/your pages' posts, their views, likes, comments and shares, your followers and audience/)).toBeInTheDocument();
    expect(screen.getByText(/post, comment or read your messages/)).toBeInTheDocument();
    expect(screen.getByText("If Facebook won't open here, open this link in Chrome or Safari.")).toBeInTheDocument();
  });

  it("sends the person to Facebook with the link's token", async () => {
    mocks.rpc.mockResolvedValue(link("open"));
    mocks.invoke.mockResolvedValue({ data: { url: "https://www.facebook.com/dialog" }, error: null });
    open("/connect/brand/tok");
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Facebook" }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith("https://www.facebook.com/dialog"));
    expect(mocks.invoke).toHaveBeenCalledWith("brand-connect-start", { body: { link_token: "tok" } });
  });

  it("names the agency on an expired or cancelled link, with no button", async () => {
    mocks.rpc.mockResolvedValue(link("expired"));
    const { unmount } = open("/connect/brand/tok");
    expect(await screen.findByText("This link has expired. Ask Good Agency for a new one.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Facebook" })).toBeNull();
    unmount();
    mocks.rpc.mockResolvedValue(link("cancelled"));
    open("/connect/brand/tok");
    expect(await screen.findByText("This link was cancelled. Ask Good Agency for a new one.")).toBeInTheDocument();
  });

  it("says when it doesn't know the link", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    open("/connect/brand/tok");
    expect(await screen.findByText("We don't know this link. Check you have all of it.")).toBeInTheDocument();
  });

  it("offers a retry when the call fails, and doesn't call the link expired", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } }).mockResolvedValue(link("open"));
    open("/connect/brand/tok");
    expect(await screen.findByText("Couldn't load this page.")).toBeInTheDocument();
    expect(screen.queryByText(/expired/)).toBeNull();
    press("Try again");
    expect(await screen.findByRole("button", { name: "Continue with Facebook" })).toBeInTheDocument();
  });
});

describe("the choosing page", () => {
  const route = "/connect/brand/done?p=pending-1&s=state-1";
  const read = { data: { brand_name: "Acme", agency_name: "Good Agency", assets }, error: null };

  it("asks which accounts are the brand's, with nothing ticked", async () => {
    mocks.invoke.mockResolvedValue(read);
    open(route);
    expect(await screen.findByText("Which of these are Acme's?")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("brand-connect-confirm", { body: { action: "read", pending_id: "pending-1", state: "state-1" } });
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Connect selected" })).toBeDisabled();
  });

  it("sends only what was ticked, and says what connected", async () => {
    mocks.invoke.mockResolvedValueOnce(read).mockResolvedValue({
      data: { connected: [{ name: "Acme Kenya", username: "AcmeKenya", platform: "facebook" }, { name: "Acme IG", username: "acme.kenya", platform: "instagram" }], signed_in: false },
      error: null,
    });
    open(route);
    fireEvent.click(await screen.findByLabelText(/Acme IG/));
    press("Connect selected");
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("brand-connect-confirm", { body: { action: "confirm", pending_id: "pending-1", state: "state-1", asset_ids: ["i1"] } }));
    expect(await screen.findByText("Connected: Acme Kenya (Facebook), @acme.kenya (Instagram). You can close this page.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to Pulse" })).toBeNull();
  });

  it("offers a way back to someone signed in", async () => {
    mocks.invoke.mockResolvedValueOnce(read).mockResolvedValue({ data: { connected: [{ name: "Acme Kenya", username: null, platform: "facebook" }], signed_in: true }, error: null });
    open(route);
    fireEvent.click(await screen.findByLabelText(/Acme Kenya/));
    press("Connect selected");
    expect(await screen.findByRole("link", { name: "Back to Pulse" })).toHaveAttribute("href", "/app/channels");
  });

  it("sends one call when confirm is pressed twice", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.invoke.mockResolvedValueOnce(read).mockReturnValue(new Promise((r) => { finish = r; }));
    open(route);
    fireEvent.click(await screen.findByLabelText(/Acme Kenya/));
    press("Connect selected");
    press("Connecting…");
    finish({ data: { connected: [], signed_in: false }, error: null });
    expect(mocks.invoke).toHaveBeenCalledTimes(2); // the read, and one confirm
  });

  it("says a finished or expired step is finished, when the page is reloaded or the back button used", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 410 } } });
    open(route);
    expect(await screen.findByText("This step is finished or has expired. Open the link again if you still need to connect.")).toBeInTheDocument();
  });

  it("keeps the choices and offers another go when connecting fails", async () => {
    mocks.invoke.mockResolvedValueOnce(read).mockResolvedValue({ data: null, error: { context: { status: 502 } } });
    open(route);
    fireEvent.click(await screen.findByLabelText(/Acme Kenya/));
    press("Connect selected");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't connect those. Please try again.");
    expect(screen.getByLabelText(/Acme Kenya/)).toBeChecked();
  });

  it("forgets the login on None of these, and says nothing was connected", async () => {
    mocks.invoke.mockResolvedValueOnce(read).mockResolvedValue({ data: { cancelled: true }, error: null });
    open(route);
    await screen.findByText("Which of these are Acme's?");
    press("None of these");
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("brand-connect-confirm", { body: { action: "cancel", pending_id: "pending-1", state: "state-1" } }));
    expect(await screen.findByText("Nothing was connected. You can close this page.")).toBeInTheDocument();
  });
});

describe("when the Facebook step went wrong", () => {
  it.each([
    ["denied", "You cancelled the Facebook step, so nothing was connected."],
    ["no_pages", "Facebook didn't share any pages. Log in with the profile that manages the page, and leave the page ticked when Facebook asks."],
    ["invalid_state", "This step has expired. Open the link again."],
    ["token", "Facebook didn't finish the login. Please try again."],
  ])("says %s in plain words", async (reason, text) => {
    open(`/connect/brand/done?status=error&reason=${reason}`);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("offers Try again when it began from a link, and a way back otherwise", async () => {
    const { unmount } = open("/connect/brand/done?status=error&reason=denied&link=tok");
    expect(await screen.findByRole("link", { name: "Try again" })).toHaveAttribute("href", "/connect/brand/tok");
    unmount();
    open("/connect/brand/done?status=error&reason=denied");
    expect(await screen.findByRole("link", { name: "Back to Pulse" })).toHaveAttribute("href", "/app/channels");
  });
});
