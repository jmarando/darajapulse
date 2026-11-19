import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/DemoRequestDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Demo request form</div> : null),
}));

import LandingDashboard from "@/pages/landings/LandingDashboard";

const renderPage = () => render(<MemoryRouter><LandingDashboard /></MemoryRouter>);

// Motion off, so the counted-up numbers are final as soon as the page renders.
beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

describe("the homepage", () => {
  it("leads with the promise and opens the demo form from a Book a demo button", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Every creator. Every post. Every shilling.");
    expect(screen.queryByText("Demo request form")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /book a demo/i })[0]);
    expect(screen.getByText("Demo request form")).toBeInTheDocument();
  });

  it("shows all four steps at once, in order", () => {
    renderPage();
    const how = screen.getByRole("region", { name: /from brief to payout/i });
    expect(within(how).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Brief & sign", "Approve drafts", "Measure every post", "Pay to the shilling",
    ]);
  });

  it("covers listening and the brand's own pages, and links to that part from the top bar", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 2, name: /hear what people are saying/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /catch it while it’s still small/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /your own pages, in one report/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Listening" })).toHaveAttribute("href", "#listening");
  });

  it("gives each number in words, for screen readers", () => {
    renderPage();
    for (const line of ["195M+ views measured", "3,200+ creators in Discovery", "1,800+ posts tracked live", "1,100+ contest entries scored"]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });

  it("sends people to Discovery and to sign-in", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /browse 3,200\+ creators/i })).toHaveAttribute("href", "/discovery");
    const signIn = screen.getAllByRole("link", { name: "Sign in" });
    expect(signIn.length).toBeGreaterThan(0);
    signIn.forEach((a) => expect(a).toHaveAttribute("href", "/auth"));
  });

  it("turns a phone's browser bar white while it is open, and puts the colour back after", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#1d1816";
    document.head.appendChild(meta);
    const { unmount } = renderPage();
    expect(meta.content).toBe("#ffffff");
    unmount();
    expect(meta.content).toBe("#1d1816");
    meta.remove();
  });
});
