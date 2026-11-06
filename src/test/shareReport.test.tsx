import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareReport from "@/components/channels/ShareReport";

const mocks = vi.hoisted(() => ({ live: vi.fn(), insert: vi.fn(), update: vi.fn(), toast: vi.fn(), copy: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => mocks.live() }) }) }),
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
      update: (row: unknown) => ({ eq: (column: string, id: string) => mocks.update(row, column, id) }),
    }),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const live = { id: "l1", token: "tok1" };
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.live.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ data: live, error: null });
  mocks.update.mockResolvedValue({ error: null });
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, hostname: "darajapulse.com", origin: "https://darajapulse.com" } });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy } });
});

describe("ShareReport", () => {
  it("reuses a live link and copies it", async () => {
    mocks.live.mockResolvedValue({ data: live, error: null });
    render(<ShareReport clientId="c1" brandName="Acme" />);
    press("Share");
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("https://darajapulse.com/o/tok1"));
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("makes a link when there is none", async () => {
    render(<ShareReport clientId="c1" brandName="Acme" />);
    press("Share");
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({ client_id: "c1" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("https://darajapulse.com/o/tok1"));
  });

  it("uses the other person's link if two people press Share together", async () => {
    mocks.live.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue({ data: live, error: null });
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    render(<ShareReport clientId="c1" brandName="Acme" />);
    press("Share");
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("https://darajapulse.com/o/tok1"));
  });

  it("offers WhatsApp with the link", async () => {
    render(<ShareReport clientId="c1" brandName="Acme" />);
    press("Share");
    const whatsapp = await screen.findByRole("link", { name: "Send on WhatsApp" });
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("https://darajapulse.com/o/tok1");
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("Acme");
  });

  it("turns a link off", async () => {
    render(<ShareReport clientId="c1" brandName="Acme" />);
    press("Share");
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ is_active: false }, "id", "l1"));
  });

  it("says so when it can't make a link", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    render(<ShareReport clientId="c1" brandName="Acme" />);
    press("Share");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.copy).not.toHaveBeenCalled();
  });
});
