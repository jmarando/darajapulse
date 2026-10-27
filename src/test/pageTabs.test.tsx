import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTab, PageTabDivider, PageTabList, ViewSwitch } from "@/components/dash/PageTabs";

const bar = (value: string, onValueChange = () => {}) =>
  render(
    <Tabs value={value} onValueChange={onValueChange}>
      <PageTabList aria-label="Campaign sections">
        <PageTab value="overview">Overview</PageTab>
        <PageTab value="creators" count={136}>Creators &amp; content</PageTab>
        <PageTabDivider />
        <PageTab value="contests">Contests</PageTab>
        <PageTab value="rsvps" count={0}>RSVPs</PageTab>
      </PageTabList>
      <TabsContent value="overview">Overview body</TabsContent>
      <TabsContent value="creators">Creators body</TabsContent>
    </Tabs>,
  );

describe("PageTabList", () => {
  it("is a tab bar with the current tab marked", () => {
    bar("creators");
    const list = screen.getByRole("tablist", { name: "Campaign sections" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual(["Overview", "Creators & content", "Contests", "RSVPs"]);
    expect(screen.getByRole("tab", { name: /Creators & content/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Creators body")).toBeInTheDocument();
  });

  it("shows a count where there is one, including a zero", () => {
    bar("overview");
    expect(within(screen.getByRole("tab", { name: /Creators & content/ })).getByText("136")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /RSVPs/ })).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: "Overview" })).queryByText(/\d/)).toBeNull();
  });

  it("changes tab when one is chosen", () => {
    const onChange = vi.fn();
    bar("overview", onChange);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Contests" }), { button: 0 });
    expect(onChange).toHaveBeenCalledWith("contests");
  });

  it("keeps the dividers out of the way of screen readers", () => {
    const { container } = bar("overview");
    const divider = container.querySelector('[role="tablist"] > [aria-hidden="true"]');
    expect(divider).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  describe("when the bar is wider than the screen", () => {
    const render3 = (active: string) => (
      <Tabs value={active}>
        <PageTabList aria-label="Sections" active={active}>
          <PageTab value="a">A</PageTab>
          <PageTab value="b">B</PageTab>
        </PageTabList>
      </Tabs>
    );
    const size = (el: HTMLElement, props: Record<string, number>) =>
      Object.entries(props).forEach(([k, v]) => Object.defineProperty(el, k, { configurable: true, value: v }));

    it("brings the current tab into view, centred", () => {
      const scrollTo = vi.fn();
      const { rerender } = render(render3("a"));
      const list = screen.getByRole("tablist");
      list.scrollTo = scrollTo;
      size(list, { scrollWidth: 900, clientWidth: 300 });
      size(screen.getByRole("tab", { name: "B" }), { offsetLeft: 700, offsetWidth: 100 });
      rerender(render3("b"));
      expect(scrollTo).toHaveBeenCalledWith({ left: 600, behavior: "smooth" }); // 700 - (300 - 100) / 2
    });

    it("leaves the bar alone when all of it fits", () => {
      const scrollTo = vi.fn();
      const { rerender } = render(render3("a"));
      const list = screen.getByRole("tablist");
      list.scrollTo = scrollTo;
      size(list, { scrollWidth: 300, clientWidth: 300 });
      rerender(render3("b"));
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  it("scrolls sideways instead of wrapping onto a second row", () => {
    bar("overview");
    const list = screen.getByRole("tablist");
    expect(list.className).toContain("overflow-x-auto");
    expect(list.className).not.toContain("flex-wrap");
  });
});

describe("ViewSwitch", () => {
  const items = [{ value: "contests", label: "Linked contests" }, { value: "submissions", label: "Submissions", count: 825 }];

  it("shows the views with the current one marked", () => {
    render(<ViewSwitch label="Contest views" items={items} value="submissions" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Contest views" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submissions/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Linked contests" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("825")).toBeInTheDocument();
  });

  it("changes view when one is chosen", () => {
    const onChange = vi.fn();
    render(<ViewSwitch label="Contest views" items={items} value="contests" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Submissions/ }));
    expect(onChange).toHaveBeenCalledWith("submissions");
  });
});
