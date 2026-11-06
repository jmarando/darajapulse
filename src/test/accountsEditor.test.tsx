import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountsEditor } from "@/components/creators/AccountsEditor";
import type { CreatorAccount } from "@/lib/creatorAccounts";

const acct = (over: Partial<CreatorAccount> = {}): CreatorAccount => ({
  platform: "tiktok", handle: "janecooks", readable: true, followers: null, engagement: null, ...over,
});

const setup = (initial: CreatorAccount[] = []) => {
  const onChange = vi.fn();
  render(<AccountsEditor initial={initial} onChange={onChange} />);
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1];
  return { onChange, accounts: () => last()[0] as CreatorAccount[], problems: () => last()[1] as number };
};
const handleBox = (n: number) => screen.getAllByLabelText("Handle or profile link")[n];
const platformBox = (n: number) => screen.getAllByLabelText("Platform")[n] as HTMLSelectElement;
const followersBox = (n: number) => screen.getAllByLabelText("Followers")[n];
const type = (el: Element, value: string) => fireEvent.change(el, { target: { value } });

describe("AccountsEditor", () => {
  it("starts a new creator with the three usual platforms ready to fill", () => {
    setup();
    expect([0, 1, 2].map((n) => platformBox(n).value)).toEqual(["tiktok", "instagram", "facebook"]);
    expect(screen.getAllByLabelText("Handle or profile link")).toHaveLength(3);
  });

  it("takes one handle per platform, so a creator can have several", () => {
    const { accounts } = setup();
    type(handleBox(0), "@JaneCooks");
    type(handleBox(1), "jane.ig");
    type(handleBox(2), "jane.fb");
    expect(accounts().map((a) => [a.platform, a.handle])).toEqual([
      ["tiktok", "janecooks"],
      ["instagram", "jane.ig"],
      ["facebook", "jane.fb"],
    ]);
  });

  it("leaves empty rows out", () => {
    const { accounts } = setup();
    type(handleBox(1), "jane.ig");
    expect(accounts().map((a) => a.platform)).toEqual(["instagram"]);
  });

  it("works out the platform from a pasted link", () => {
    const { accounts } = setup();
    type(handleBox(0), "https://x.com/JaneCooks");
    expect(platformBox(0).value).toBe("twitter");
    expect(accounts()).toEqual([acct({ platform: "twitter", handle: "janecooks" })]);
  });

  it("swaps with the empty row a pasted link's platform had, so no platform is left without a row", () => {
    setup();
    type(handleBox(0), "https://www.instagram.com/jane.ig/");
    expect(platformBox(0).value).toBe("instagram");
    expect(platformBox(1).value).toBe("tiktok");
  });

  it("keeps each account's followers", () => {
    const { accounts } = setup();
    type(handleBox(0), "janecooks");
    type(followersBox(0), "12,000");
    expect(accounts()[0].followers).toBe(12000);
  });

  it("adds a row for the next platform not in use, down to the handle-only ones", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /add another platform/i }));
    expect(platformBox(3).value).toBe("twitter");
    fireEvent.click(screen.getByRole("button", { name: /add another platform/i }));
    expect(platformBox(4).value).toBe("youtube");
    fireEvent.click(screen.getByRole("button", { name: /add another platform/i }));
    expect(platformBox(5).value).toBe("linkedin");
  });

  it("removes a row", () => {
    const { accounts } = setup([acct(), acct({ platform: "instagram", handle: "jane.ig" })]);
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[1]);
    expect(accounts().map((a) => a.platform)).toEqual(["tiktok"]);
  });

  it("shows a creator's existing accounts and numbers", () => {
    setup([acct({ followers: 12000 }), acct({ platform: "instagram", handle: "jane.ig", followers: 800 })]);
    expect((handleBox(0) as HTMLInputElement).value).toBe("janecooks");
    expect((followersBox(1) as HTMLInputElement).value).toBe("800");
  });

  it("keeps a number it doesn't show when the row isn't touched", () => {
    const { accounts } = setup([acct({ engagement: 3.5 })]);
    type(followersBox(0), "5");
    expect(accounts()[0].engagement).toBe(3.5);
  });

  it("moves an account first when it is made the main one", () => {
    const { accounts } = setup([acct(), acct({ platform: "instagram", handle: "jane.ig" })]);
    fireEvent.click(screen.getAllByRole("button", { name: /make .* the main account/i })[0]);
    expect(accounts().map((a) => a.platform)).toEqual(["instagram", "tiktok"]);
  });

  it("offers no main button on a handle-only platform, which reports can't use", () => {
    setup([acct(), acct({ platform: "linkedin", handle: "jane-li" })]);
    expect(screen.queryByRole("button", { name: /make linkedin/i })).toBeNull();
  });

  it("explains a link it can't read and counts it as a problem", () => {
    const { accounts, problems } = setup();
    type(handleBox(0), "https://vm.tiktok.com/ZM8abc/");
    expect(screen.getByText(/short link/i)).toBeInTheDocument();
    expect(problems()).toBe(1);
    expect(accounts()).toEqual([]);
  });

  it("accepts a name but says what it costs", () => {
    const { accounts, problems } = setup();
    type(handleBox(2), "Jane Cooks Kitchen");
    expect(screen.getByText(/looks like a name/i)).toBeInTheDocument();
    expect(problems()).toBe(0);
    expect(accounts()).toEqual([acct({ platform: "facebook", handle: "Jane Cooks Kitchen", readable: false })]);
  });
});
