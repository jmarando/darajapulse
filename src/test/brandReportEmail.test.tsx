import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BrandReportEmail from "@/components/channels/BrandReportEmail";

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), invoke: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: (column: string, id: string) => ({ maybeSingle: () => mocks.read(table, column, id) }) }),
      upsert: (row: unknown, options: unknown) => mocks.save(table, row, options),
    }),
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const show = async (props: { canEdit?: boolean } = {}) => {
  render(<BrandReportEmail clientId="c1" brandName="Acme" canEdit {...props} />);
  await act(async () => { await Promise.resolve(); });
};
const type = (text: string) => fireEvent.change(screen.getByLabelText("Who gets the email"), { target: { value: text } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.save.mockResolvedValue({ error: null });
  mocks.invoke.mockResolvedValue({ data: { sent: true }, error: null });
});

describe("BrandReportEmail", () => {
  it("starts off, with nobody on the list", async () => {
    await show();
    expect(mocks.read).toHaveBeenCalledWith("brand_report_settings", "client_id", "c1");
    expect(screen.getByRole("switch", { name: "Monthly email" })).not.toBeChecked();
    expect(screen.getByLabelText("Who gets the email")).toHaveValue("");
  });

  it("saves cleaned addresses", async () => {
    await show();
    type("A@Example.test, b@example.test\nA@example.test");
    press("Save");
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith("brand_report_settings", expect.objectContaining({ client_id: "c1", recipients: ["a@example.test", "b@example.test"] }), { onConflict: "client_id" }));
  });

  it("refuses a pasted name and address, and saves nothing", async () => {
    await show();
    type("Someone <a@example.test>");
    press("Save");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("can't be on with no address", async () => {
    await show();
    fireEvent.click(screen.getByRole("switch", { name: "Monthly email" }));
    press("Save");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add an email address first" }));
  });

  it("lets a brand user read it and not change it", async () => {
    mocks.read.mockResolvedValue({ data: { monthly_email: true, recipients: ["a@example.test"] }, error: null });
    await show({ canEdit: false });
    expect(screen.getByRole("switch", { name: "Monthly email" })).toBeDisabled();
    expect(screen.getByLabelText("Who gets the email")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send me a test" })).toBeNull();
  });

  it("asks for a test with no addresses, so it can only go to the person pressing", async () => {
    await show();
    type("someone@example.test");
    press("Send me a test");
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("send-brand-report", { body: { client_id: "c1", test: true } }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Test email sent" })));
  });

  it("says so when the test couldn't be sent, including when the address is blocked", async () => {
    mocks.invoke.mockResolvedValue({ data: { sent: false, error: "Your address is on the do-not-send list." }, error: null });
    await show();
    press("Send me a test");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't send the test", description: "Your address is on the do-not-send list.", variant: "destructive" })));
  });
});
