import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdStep from "@/components/storefront/booking/AdStep";
import { emptyKit, type MaterialState } from "@/lib/storefrontCheckout";
import type { Material, PricedLine } from "@/lib/storefrontBooking";
import type { Listing } from "@/lib/storefront";

const kiss: Listing = {
  id: "00000000-0000-4000-8000-000000000011", kind: "ad_slot", platform: "radio", title: "Kiss 100: Spot adverts",
  price_unit: "spot", options: [{ label: "6–9 AM", price_kes: 35000 }], bookable: true, ad_format: "radio_spot", follower_count: 4660000,
};
const spots: PricedLine = {
  id: kiss.id, title: kiss.title, option: "6–9 AM", qty: 2, unit: "spot", unitPrice: 35000, model: "unit", cpm: null, budget: null,
  target: "kenya", views: null, kind: "spread", start: "2026-11-23", end: "2026-11-24", dates: [], total: 70000,
  adFormat: "radio_spot", materials: ["audio"],
};

const renderStep = (materials: Partial<Record<Material, MaterialState>>, kit = emptyKit) => render(
  <AdStep needed={["audio"]} priced={[spots]} byId={new Map([[kiss.id, kiss]])} materials={materials} onMaterials={() => {}}
    kit={kit} onKit={() => {}} fees={{ audio: 50000 }} accent="#e11d48" houseName="Radio Africa Group" />,
);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:test-audio");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("making a radio ad in the checkout", () => {
  it("shows the spots on the week and a rough script from the brand kit", () => {
    renderStep({ audio: { mode: "make", files: [] } }, { ...emptyKit, headline: "Kiss Breakfast Bundle", message: "Two eggs and a coffee for KES 300", cta: "Visit yehtu.com" });
    expect(screen.getByRole("heading", { name: "See it in place" })).toBeInTheDocument();
    expect(screen.getAllByText("1 spot")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Rough script" })).toBeInTheDocument();
    expect(screen.getByText("Kiss Breakfast Bundle!")).toBeInTheDocument();
    expect(screen.getByText(/About 6 seconds of 30/)).toBeInTheDocument();
  });

  it("asks for the kit's words before there's a script to show", () => {
    renderStep({ audio: { mode: "make", files: [] } });
    expect(screen.getByText("Add a headline, the offer and a call to action above to see a rough script.")).toBeInTheDocument();
  });

  it("lets the buyer play the advert they uploaded", () => {
    const file = new File(["x"], "spot.mp3", { type: "audio/mpeg" });
    const { container } = renderStep({ audio: { mode: "have", files: [file] } });
    expect(container.querySelector("audio")).toHaveAttribute("src", "blob:test-audio");
    expect(screen.queryByRole("heading", { name: "Rough script" })).not.toBeInTheDocument();
  });

  it("still shows where it runs when the ad comes later", () => {
    renderStep({ audio: { mode: "later", files: [] } });
    expect(screen.getAllByText("1 spot")).toHaveLength(2);
  });
});
