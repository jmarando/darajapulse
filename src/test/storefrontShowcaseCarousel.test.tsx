import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Showcase, { DWELL_MS } from "@/components/storefront/Showcase";
import { showcaseSlides, type ShowcaseSlide } from "@/lib/storefrontShowcase";
import type { Listing } from "@/lib/storefront";

const station = (name: string, reach: number, prices: [number, number]): Listing => ({
  id: `${name}-spots`, kind: "ad_slot", platform: "radio", title: `${name}: Spot adverts`, subtitle: `${name} · on air`,
  follower_count: reach, cover_url: `/${name}.webp`, price_kes: prices[1], price_unit: "spot", ad_format: "radio_spot",
  options: [{ label: "6–9 AM", price_kes: prices[0] }, { label: "Run of station", price_kes: prices[1] }],
});
const slides = showcaseSlides([
  station("Classic 105", 9_700_000, [40000, 16000]),
  station("Radio Jambo", 8_390_000, [39500, 17000]),
  station("Kiss 100", 4_660_000, [35000, 14000]),
], true);

const shown = () => screen.getAllByRole("tabpanel", { hidden: true }).find((p) => p.getAttribute("aria-hidden") === "false")!;
const renderShowcase = (props: Partial<Parameters<typeof Showcase>[0]> = {}) => {
  const onAdd = vi.fn();
  const onMore = vi.fn();
  render(<Showcase slides={slides} accent="#ED1C24" strong="#E11A22" picked={() => false} onAdd={onAdd} onMore={onMore} {...props} />);
  return { onAdd, onMore };
};

afterEach(() => vi.useRealTimers());

describe("the storefront showcase", () => {
  it("opens on the property that reaches the most, with its price and what Add puts in the plan", () => {
    renderShowcase();
    expect(shown()).toHaveAccessibleName("1 of 3: Classic 105");
    expect(shown()).toHaveTextContent("9.7M listeners a week");
    expect(shown()).toHaveTextContent("From KES 16,000 a spot");
    expect(shown()).toHaveTextContent("Adds 6–9 AM at KES 40,000 a spot");
    expect(screen.getByRole("tab", { name: /Classic 105/ })).toHaveAttribute("aria-selected", "true");
  });

  it("adds the slide's choice, and sends the buyer to the rest", () => {
    const { onAdd, onMore } = renderShowcase();
    fireEvent.click(screen.getByRole("button", { name: "Add Classic 105, 6–9 AM to your plan" }));
    expect(onAdd).toHaveBeenCalledWith(slides[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "See the rate card" })[0]);
    expect(onMore).toHaveBeenCalledWith(slides[0]);
  });

  it("says when the slide's choice is already in the plan", () => {
    renderShowcase({ picked: (s: ShowcaseSlide) => s.name === "Classic 105" });
    const button = screen.getByRole("button", { name: "Classic 105: in your plan. Take it out" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("In your plan");
  });

  it("jumps to a property from its tab, and moves between tabs with the arrow keys", () => {
    renderShowcase();
    fireEvent.click(screen.getByRole("tab", { name: /Kiss 100/ }));
    expect(shown()).toHaveAccessibleName("3 of 3: Kiss 100");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(shown()).toHaveAccessibleName("1 of 3: Classic 105");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(shown()).toHaveAccessibleName("3 of 3: Kiss 100");
  });

  describe("moving on by itself", () => {
    beforeEach(() => vi.useFakeTimers());

    it("shows the next property after a few seconds", () => {
      renderShowcase();
      act(() => { vi.advanceTimersByTime(DWELL_MS); });
      expect(shown()).toHaveAccessibleName("2 of 3: Radio Jambo");
    });

    it("holds on Pause, and while the buyer points at it", () => {
      renderShowcase();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      act(() => { vi.advanceTimersByTime(DWELL_MS * 2); });
      expect(shown()).toHaveAccessibleName("1 of 3: Classic 105");
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      fireEvent.mouseEnter(screen.getByRole("region", { name: "What you can book" }));
      act(() => { vi.advanceTimersByTime(DWELL_MS * 2); });
      expect(shown()).toHaveAccessibleName("1 of 3: Classic 105");
    });

    it("stays put, with no Pause button, for people who ask for less motion", () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes("reduce") })) as typeof window.matchMedia;
      try {
        renderShowcase();
        act(() => { vi.advanceTimersByTime(DWELL_MS * 2); });
        expect(shown()).toHaveAccessibleName("1 of 3: Classic 105");
        expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      } finally {
        window.matchMedia = original;
      }
    });
  });
});
