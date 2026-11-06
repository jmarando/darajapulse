import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ListeningAlerts from "@/components/listening/ListeningAlerts";
import ListeningKeywords from "@/components/listening/ListeningKeywords";
import { MAX_RECIPIENTS } from "@/lib/listeningAlerts";
import { ACT_VIEWS, WATCH_VIEWS, views } from "../../supabase/functions/_shared/listening-brief";

// A stand-in for the client that records what the card asks of it: the rule it reads, the row it writes and the
// call it makes for a test email.
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  invoke: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, id: string) => ({ maybeSingle: () => mocks.read(table, columns, column, id) }),
      }),
      upsert: (row: unknown, options: unknown) => mocks.save(table, row, options),
    }),
    functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const rule = (enabled: boolean, recipients: string[]) => ({ data: { enabled, recipients }, error: null });
const renderCard = (props: { canEdit?: boolean } = {}) =>
  render(<ListeningAlerts clientId="c1" brandName="Acme" canEdit {...props} />);
const list = () => screen.getByLabelText("Who gets the emails");
const type = (text: string) => fireEvent.change(list(), { target: { value: text } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.save.mockResolvedValue({ error: null });
  mocks.invoke.mockResolvedValue({ data: { sent: true }, error: null });
});

describe("ListeningAlerts: what is saved", () => {
  it("shows the saved rule: alerts on and the addresses listed", async () => {
    mocks.read.mockResolvedValue(rule(true, ["ann@agency.test", "ben@agency.test"]));
    renderCard();
    expect(await screen.findByRole("switch")).toBeChecked();
    expect(list()).toHaveValue("ann@agency.test\nben@agency.test");
    expect(mocks.read).toHaveBeenCalledWith("listening_alert_rules", expect.any(String), "client_id", "c1");
    expect(screen.queryByText("Only your agency can change who gets alerts.")).not.toBeInTheDocument();
  });

  it("starts with alerts off and nobody listed when nothing was saved yet", async () => {
    renderCard();
    expect(await screen.findByRole("switch")).not.toBeChecked();
    expect(list()).toHaveValue("");
  });

  it("offers no form when the saved rule could not be read, so nothing is overwritten blind", async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    renderCard();
    expect(await screen.findByText(/Couldn't load the alert settings/)).toHaveTextContent("permission denied");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("follows the brand it is on, even when an earlier brand's answer arrives late", async () => {
    let answerForOne!: (reply: unknown) => void;
    mocks.read
      .mockImplementationOnce(() => new Promise((resolve) => { answerForOne = resolve; }))
      .mockResolvedValueOnce(rule(false, ["two@agency.test"]));
    const { rerender } = renderCard();
    rerender(<ListeningAlerts clientId="c2" brandName="Beta" canEdit />);
    expect(await screen.findByDisplayValue("two@agency.test")).toBeInTheDocument();
    await act(async () => answerForOne(rule(true, ["one@agency.test"])));
    expect(list()).toHaveValue("two@agency.test");
    expect(screen.getByRole("switch")).not.toBeChecked();
    // And a save from here goes to the brand on screen, never to the one it came from.
    press("Save");
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(
      "listening_alert_rules", expect.objectContaining({ client_id: "c2", recipients: ["two@agency.test"] }), expect.anything(),
    ));
  });
});

describe("ListeningAlerts: saving", () => {
  it("saves the switch and the tidied list for this brand, and shows the tidied list", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("switch"));
    type("Ann@Agency.test, ben@agency.test;\nann@agency.test");
    press("Save");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Alerts saved" })));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(
      "listening_alert_rules",
      { client_id: "c1", enabled: true, recipients: ["ann@agency.test", "ben@agency.test"], updated_at: expect.any(String) },
      { onConflict: "client_id" },
    );
    expect(list()).toHaveValue("ann@agency.test\nben@agency.test");
  });

  it("lets alerts be switched off with nobody listed", async () => {
    mocks.read.mockResolvedValue(rule(true, ["ann@agency.test"]));
    renderCard();
    fireEvent.click(await screen.findByRole("switch"));
    type("");
    press("Save");
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(
      "listening_alert_rules", expect.objectContaining({ enabled: false, recipients: [] }), expect.anything(),
    ));
  });

  it("refuses an address that is not one, and names it", async () => {
    renderCard();
    await screen.findByRole("switch");
    type("ann@agency.test, nope, ben@");
    press("Save");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive", title: "Check the email addresses", description: expect.stringContaining("nope, ben@"),
    }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("refuses to switch alerts on with nobody listed", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("switch"));
    press("Save");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Add an email address first" }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("refuses a list of more than 10 addresses", async () => {
    renderCard();
    await screen.findByRole("switch");
    type(Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `person${i}@agency.test`).join("\n"));
    press("Save");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Too many addresses" }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("says why when the database refuses the save, and keeps what was typed", async () => {
    mocks.save.mockResolvedValue({ error: { message: "new row violates row-level security policy" } });
    renderCard();
    await screen.findByRole("switch");
    type("ann@agency.test");
    press("Save");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: "Couldn't save alerts", description: "new row violates row-level security policy", variant: "destructive",
    }));
    expect(list()).toHaveValue("ann@agency.test");
  });

  it("holds both buttons while it saves, so a second tap does nothing", async () => {
    let finish!: (reply: unknown) => void;
    mocks.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCard();
    await screen.findByRole("switch");
    type("ann@agency.test");
    press("Save");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send me a test" })).toBeDisabled();
    await act(async () => finish({ error: null }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("ListeningAlerts: the test email", () => {
  it("asks for a test for this brand and sends no addresses, so it goes to the signed-in person only", async () => {
    renderCard();
    await screen.findByRole("switch");
    type("someone.else@agency.test");
    press("Send me a test");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Test email sent" })));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("listening-alerts", { body: { client_id: "c1", test: true } });
  });

  it.each([
    ["the call fails", { data: null, error: { message: "Edge Function returned a non-2xx status code" } }, "Edge Function returned a non-2xx status code"],
    ["the function gives a reason", { data: { error: "Your account has no email address to send a test to." }, error: null }, "Your account has no email address to send a test to."],
  ])("says so when %s and no test went out", async (_case, reply, reason) => {
    mocks.invoke.mockResolvedValue(reply);
    renderCard();
    await screen.findByRole("switch");
    press("Send me a test");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Test didn't send", description: reason, variant: "destructive" }));
  });

  it("holds both buttons while the test goes out", async () => {
    let finish!: (reply: unknown) => void;
    mocks.invoke.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCard();
    await screen.findByRole("switch");
    press("Send me a test");
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await act(async () => finish({ data: { sent: true }, error: null }));
    expect(screen.getByRole("button", { name: "Send me a test" })).toBeEnabled();
  });
});

describe("ListeningAlerts: who sees what", () => {
  it("is read-only for a brand user: the list can be seen but not changed, and no test can be sent", async () => {
    mocks.read.mockResolvedValue(rule(true, ["ann@agency.test"]));
    renderCard({ canEdit: false });
    expect(await screen.findByRole("switch")).toBeDisabled();
    expect(list()).toBeDisabled();
    expect(list()).toHaveValue("ann@agency.test");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send me a test" })).not.toBeInTheDocument();
    expect(screen.getByText("Only your agency can change who gets alerts.")).toBeInTheDocument();
  });

  it("says when an email goes out, with the same view counts the morning view uses", async () => {
    renderCard();
    const line = await screen.findByText(/negative post about Acme/);
    expect(line).toHaveTextContent(`${views(WATCH_VIEWS)} views (Watch)`);
    expect(line).toHaveTextContent(`${views(ACT_VIEWS)} views (Act)`);
  });
});

describe("ListeningKeywords: the alerts card", () => {
  const props = { clientId: "c1", brandName: "Acme", topics: [], creditsToday: null, showCredits: false, onChanged: () => {} };

  it("sits in the right-hand column, after \"Add a keyword\"", async () => {
    render(<ListeningKeywords {...props} canEditAlerts />);
    const add = screen.getByRole("heading", { name: "Add a keyword" });
    const alerts = await screen.findByRole("heading", { name: "Email alerts" });
    expect(add.compareDocumentPosition(alerts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alerts.closest("section")?.parentElement).toBe(add.closest("section")?.parentElement);
  });

  it("passes on whether the person may change alerts", async () => {
    const { rerender } = render(<ListeningKeywords {...props} canEditAlerts={false} />);
    expect(await screen.findByRole("switch")).toBeDisabled();
    rerender(<ListeningKeywords {...props} canEditAlerts />);
    expect(screen.getByRole("switch")).toBeEnabled();
  });
});
