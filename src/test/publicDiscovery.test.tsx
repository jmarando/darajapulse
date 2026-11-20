import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/publicClient", () => ({
  publicSupabase: { functions: { invoke: (name: string, options: unknown) => mocks.invoke(name, options) } },
}));
vi.mock("@/components/DemoRequestDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Meeting request form</div> : null),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn() } }));

import PublicDiscovery from "@/pages/public/PublicDiscovery";

const showcase = {
  people: [{
    key: "amani", full_name: "Amani Wanjiru", city: "Nairobi", country_code: "KE", bio: "Recipes for busy families.", avatar_url: null,
    verified_at: "2026-10-01T00:00:00Z", niches: ["food"], contacts: [],
    profiles: [{ id: "p1", handle: "amani.cooks", platform: "tiktok", profile_url: "https://www.tiktok.com/@amani.cooks", follower_count: 152000, engagement_rate: 4.2 }],
    follower_total: 152000, engagement_avg: 4.2,
  }],
  next_offset: null,
  stats: { people: 2140, profiles: 3312, total_followers: 896_000_000, platforms: { tiktok: 1 }, countries: { KE: 1 }, cities: ["Nairobi"], niches: ["food"] },
};

const renderPage = () => render(<MemoryRouter><PublicDiscovery /></MemoryRouter>);

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: showcase, error: null });
});

describe("the public Discovery page", () => {
  it("wears the homepage's Daylight look, with no dark panels", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { level: 3, name: "Amani Wanjiru" });
    expect(container.firstElementChild).toHaveClass("daylight");
    // Justin does not want dark sections on the public pages; the old page had three.
    expect(container.querySelector('[class*="bg-foreground"]')).toBeNull();
  });

  it("leads with the landscape and gives each live total in words, for screen readers", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Explore East Africa’s creator landscape.");
    for (const line of ["2.1K people indexed", "3.3K profiles", "896M potential reach"]) {
      expect(await screen.findByText(line)).toBeInTheDocument();
    }
    expect(mocks.invoke).toHaveBeenCalledWith("public-discovery-showcase", expect.anything());
  });

  it("opens the meeting form from the top bar", () => {
    renderPage();
    expect(screen.queryByText("Meeting request form")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Book a meeting" })[0]);
    expect(screen.getByText("Meeting request form")).toBeInTheDocument();
  });

  it("opens a creator's profile from their card", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "View profile" }));
    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveTextContent("Amani Wanjiru");
    expect(panel).toHaveTextContent("Discuss this creator mix");
  });
});
