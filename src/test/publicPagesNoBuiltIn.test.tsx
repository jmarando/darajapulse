import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

vi.mock("@/components/DemoRequestDialog", () => ({ default: () => null }));

import LandingDashboard from "@/pages/landings/LandingDashboard";
import LandingBento from "@/pages/landings/LandingBento";
import PublicFooter from "@/components/PublicFooter";

// Justin, 20 Nov 2026: take the "Built in Nairobi" line off the homepage and everywhere else.
describe("no 'Built in Nairobi' line on the public pages", () => {
  it.each<[string, ReactElement]>([
    ["the homepage", <LandingDashboard />],
    ["the public footer", <PublicFooter />],
    ["the bento landing", <LandingBento />],
  ])("%s", (_, page) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    render(<MemoryRouter>{page}</MemoryRouter>);
    expect(screen.queryAllByText(/built in nairobi/i)).toHaveLength(0);
  });
});
