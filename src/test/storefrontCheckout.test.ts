import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/storefront";
import type { PlanLine } from "@/lib/storefrontPlan";
import { buildCreateBody, checkoutTotals, emptyKit, initialSchedule } from "@/lib/storefrontCheckout";

const kiss: Listing = {
  id: "00000000-0000-4000-8000-000000000011", kind: "ad_slot", platform: "radio", title: "Kiss 100: Spot adverts", price_kes: 14000,
  price_unit: "spot", options: [{ label: "6–9 AM", price_kes: 35000 }], bookable: true, ad_format: "radio_spot",
};
const leaderboard: Listing = {
  id: "00000000-0000-4000-8000-000000000012", kind: "ad_slot", platform: "web", title: "The Star online: Leaderboard", price_kes: 300,
  price_unit: "1,000 views", price_model: "cpm", min_spend_kes: 15000, bookable: true, ad_format: "web_leaderboard",
};
const event: Listing = { id: "00000000-0000-4000-8000-000000000013", kind: "ad_slot", platform: "event", title: "Station bar event, Nairobi", price_kes: 200000, bookable: false };
const byId = new Map([kiss, leaderboard, event].map((i) => [i.id, i]));
const plan: PlanLine[] = [
  { id: kiss.id, option: "6–9 AM", qty: 10 },
  { id: leaderboard.id, option: null, qty: 1 },
  { id: event.id, option: null, qty: 1 },
];
const fees = { audio: 50000, banner: 15000, print: 12000 };
const today = "2026-11-17";

describe("the checkout's starting schedule", () => {
  const lines = initialSchedule(plan, byId, today);
  it("starts at the earliest date, whenever the plan was made", () => {
    expect(lines.map((l) => l.start)).toEqual(["2026-11-20", "2026-11-20"]);
  });
  it("runs spots for a week and banners for two", () => {
    expect(lines[0].end).toBe("2026-11-26");
    expect(lines[1]).toMatchObject({ end: "2026-12-03", budget: 15000, target: "kenya" });
  });
  it("leaves out what can't be booked online", () => {
    expect(lines.map((l) => l.id)).toEqual([kiss.id, leaderboard.id]);
  });
});

describe("the checkout's totals", () => {
  it("adds the fee for an ad the house makes, and VAT", () => {
    const { totals, errors } = checkoutTotals(initialSchedule(plan, byId, today), byId, ["audio"], fees, today);
    expect(errors).toEqual({});
    expect(totals.total).toBe(481400);
  });
  it("names the line that's under its minimum", () => {
    const lines = initialSchedule(plan, byId, today).map((l) => (l.id === leaderboard.id ? { ...l, budget: 10000 } : l));
    const { errors } = checkoutTotals(lines, byId, [], fees, today);
    expect(Object.values(errors)).toEqual(["The minimum for The Star online: Leaderboard is KES 15,000."]);
  });
});

describe("what the checkout sends", () => {
  it("lists every file in the order it uploads them, and the quote lines apart", () => {
    const spot = new File(["x"], "spot.mp3", { type: "audio/mpeg" });
    const logo = new File(["x"], "logo.png", { type: "image/png" });
    const { body, files } = buildCreateBody({
      agencySlug: "radioafrica", lines: initialSchedule(plan, byId, today), quoteLines: [plan[2]], needed: ["audio", "banner"],
      materials: { audio: { mode: "have", files: [spot] }, banner: { mode: "make", files: [] } },
      kit: { ...emptyKit, logo, headline: "Fresh bread daily" }, buyer: { name: "Wanjiku", company: "", email: "w@example.com", phone: "", kra_pin: "", client: "" },
      method: "bank", website: "",
    });
    expect(files).toEqual([spot, logo]);
    expect(body.files).toEqual([
      { slot: "audio", name: "spot.mp3", type: "audio/mpeg", size: 1 },
      { slot: "kit_logo", name: "logo.png", type: "image/png", size: 1 },
    ]);
    expect(body.quote_lines).toEqual([{ id: event.id, option: null, qty: 1 }]);
    expect(body.materials).toEqual({ audio: { mode: "have" }, banner: { mode: "make" } });
    expect(body.kit).toMatchObject({ headline: "Fresh bread daily" });
    expect((body.lines[0] as Record<string, unknown>).key).toBeUndefined();
  });
});
