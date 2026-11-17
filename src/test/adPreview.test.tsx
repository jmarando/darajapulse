import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdPreview from "@/components/storefront/booking/AdPreview";
import { printBox, propertyName } from "@/lib/adPreview";
import type { Listing } from "@/lib/storefront";

const leaderboard: Listing = {
  id: "w1", kind: "ad_slot", platform: "web", title: "The Star online: Leaderboard", price_kes: 300, price_unit: "1,000 views",
  price_model: "cpm", min_spend_kes: 15000, bookable: true, ad_format: "web_leaderboard",
};
const print: Listing = { id: "p1", kind: "ad_slot", platform: "print", title: "The Star newspaper: Display ad", ad_format: "print_display" };
const kissSpots: Listing = { id: "k1", kind: "ad_slot", platform: "radio", title: "Kiss 100: Spot adverts", ad_format: "radio_spot", follower_count: 4_660_000 };
const kissInstagram: Listing = { id: "s1", kind: "owned_account", platform: "instagram", title: "Kiss 100 on Instagram", ad_format: "social_post" };

describe("see it in place", () => {
  it("shows the banner's size where it runs, on a computer and on a phone", () => {
    const { rerender } = render(<AdPreview item={leaderboard} device="computer" accent="#e11d48" />);
    expect(screen.getByText("Your ad, 728 × 90")).toBeInTheDocument();
    rerender(<AdPreview item={leaderboard} device="phone" accent="#e11d48" />);
    expect(screen.getByText("Your ad, 320 × 50")).toBeInTheDocument();
  });

  it("draws a draft from the buyer's words in the ad's place", () => {
    render(<AdPreview item={leaderboard} kit={{ headline: "Fresh bread daily", cta: "Order now" }} device="computer" accent="#e11d48" />);
    expect(screen.getByText("Fresh bread daily")).toBeInTheDocument();
  });

  it("puts the print ad on the page at its size", () => {
    render(<AdPreview item={print} option="Half page" accent="#e11d48" />);
    expect(screen.getAllByText("Half page").length).toBeGreaterThan(0);
  });

  it("marks the spots on the week", () => {
    render(<AdPreview item={kissSpots} option="6–9 AM" accent="#e11d48"
      schedule={[{ date: "2026-11-23", count: 2 }, { date: "2026-11-24", count: 2 }, { date: "2026-11-25", count: 2 }]} />);
    expect(screen.getAllByText("2 spots")).toHaveLength(3);
  });

  it("shows a post on the station's own account", () => {
    render(<AdPreview item={kissInstagram} accent="#e11d48" />);
    expect(screen.getAllByText("Kiss 100").length).toBeGreaterThan(0);
  });
});

describe("sizes and names", () => {
  it("knows the print sizes on a six-column page", () => {
    expect(printBox("18 × 6")).toMatchObject({ cols: 6, rows: 3 });
    expect(printBox("Quarter page")).toMatchObject({ cols: 3, rows: 5 });
    expect(printBox("Full page")).toMatchObject({ cols: 6, rows: 10 });
  });
  it("names the property behind a listing", () => {
    expect(propertyName({ title: "The Star online: Leaderboard" })).toBe("The Star");
    expect(propertyName({ title: "Mpasho: Side box (MPU)" })).toBe("Mpasho");
    expect(propertyName({ title: "Kiss 100 on Instagram" })).toBe("Kiss 100");
  });
});
