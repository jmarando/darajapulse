import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConnectMeta from "@/components/channels/ConnectMeta";

const mocks = vi.hoisted(() => ({ links: vi.fn(), insert: vi.fn(), update: vi.fn(), invoke: vi.fn(), toast: vi.fn(), assign: vi.fn(), copy: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ is: () => ({ gt: () => ({ order: () => mocks.links() }) }) }) }),
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
      update: (row: unknown) => ({ eq: (column: string, id: string) => mocks.update(row, column, id) }),
    }),
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const openLink = { id: "l1", token: "tok1", expires_at: "2026-11-10T09:00:00Z", created_at: "2026-11-03T09:00:00Z" };
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const show = (canMakeLinks = true) => render(<ConnectMeta clientId="c1" brandName="Acme" canMakeLinks={canMakeLinks} />);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.links.mockResolvedValue({ data: [], error: null });
  mocks.insert.mockResolvedValue({ data: openLink, error: null });
  mocks.update.mockResolvedValue({ error: null });
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, hostname: "darajapulse.com", origin: "https://darajapulse.com", assign: mocks.assign } });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy } });
});

describe("ConnectMeta", () => {
  it("logs in with the brand's id on Connect now", async () => {
    mocks.invoke.mockResolvedValue({ data: { url: "https://www.facebook.com/dialog" }, error: null });
    show();
    press("Connect Facebook and Instagram");
    press("Connect now");
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith("https://www.facebook.com/dialog"));
    expect(mocks.invoke).toHaveBeenCalledWith("brand-connect-start", { body: { client_id: "c1" } });
  });

  it("says so when the login can't start", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "no" } });
    show();
    press("Connect Facebook and Instagram");
    press("Connect now");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("makes a link for the brand and copies it", async () => {
    show();
    press("Connect Facebook and Instagram");
    press("Copy link");
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({ client_id: "c1" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("https://darajapulse.com/connect/brand/tok1"));
  });

  it("offers WhatsApp with the link and a plain message, once a link exists", async () => {
    mocks.links.mockResolvedValue({ data: [openLink], error: null });
    show();
    press("Connect Facebook and Instagram");
    const whatsapp = await screen.findByRole("link", { name: "Send on WhatsApp" });
    const text = decodeURIComponent((whatsapp.getAttribute("href") ?? "").split("text=")[1]);
    expect(text).toContain("Please connect Acme's Facebook and Instagram to Daraja Pulse");
    expect(text).toContain("read-only");
    expect(text).toContain("https://darajapulse.com/connect/brand/tok1");
  });

  it("lists open links with when they end, and cancels one", async () => {
    mocks.links.mockResolvedValue({ data: [openLink], error: null });
    show();
    press("Connect Facebook and Instagram");
    expect(await screen.findByText(/Works until 10 Nov/)).toBeInTheDocument();
    press("Cancel link");
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }), "id", "l1"));
  });

  it("gives a brand user Connect now only", async () => {
    show(false);
    press("Connect Facebook and Instagram");
    expect(screen.getByRole("button", { name: "Connect now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(mocks.links).not.toHaveBeenCalled();
  });
});
