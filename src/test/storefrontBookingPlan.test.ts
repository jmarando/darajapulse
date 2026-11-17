import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/storefront";
import { bookingMode, defaultBudget, planTotals, priceSummary, requestLines, toOffered, type PlanLine } from "@/lib/storefrontPlan";

const kiss: Listing = {
  id: "k1", kind: "ad_slot", platform: "radio", title: "Kiss 100: Spot adverts", price_kes: 14000, price_unit: "spot",
  options: [{ label: "6–9 AM", price_kes: 35000 }, { label: "Run of station", price_kes: 14000 }], bookable: true, ad_format: "radio_spot",
};
const leaderboard: Listing = {
  id: "w1", kind: "ad_slot", platform: "web", title: "The Star online: Leaderboard", price_kes: 300, price_unit: "1,000 views",
  price_model: "cpm", min_spend_kes: 15000, bookable: true, ad_format: "web_leaderboard",
};
const podcast: Listing = {
  id: "p1", kind: "ad_slot", platform: "podcast", title: "Songa Play: Patanisho", price_kes: 500, price_unit: "1,000 listens",
  price_model: "cpm", min_spend_kes: 10000, bookable: true, ad_format: "audio_preroll",
  options: [{ label: "15-second pre-roll", price_kes: 500 }, { label: "30-second pre-roll", price_kes: 750 }],
};
const byId = new Map([kiss, leaderboard, podcast].map((i) => [i.id, i]));
const lines: PlanLine[] = [{ id: "k1", option: "6–9 AM", qty: 10 }, { id: "w1", option: null, qty: 1, budget: 20000 }];

describe("prices sold per 1,000 views", () => {
  it("say the rate and the minimum", () => {
    expect(priceSummary(leaderboard, true)).toBe("KES 300 per 1,000 views, minimum KES 15,000");
    expect(priceSummary(podcast, true)).toBe("From KES 500 per 1,000 listens, minimum KES 10,000");
    expect(priceSummary(leaderboard, false)).toBeNull();
  });
  it("start from the minimum as the budget", () => {
    expect(defaultBudget(leaderboard)).toBe(15000);
  });
});

describe("the plan with budgets", () => {
  it("adds a CPM line's budget to the total", () => {
    expect(planTotals(lines, byId)).toMatchObject({ total: 370000, priced: 2, onRequest: 0 });
  });
  it("sends a CPM line in a quote request as thousands of views", () => {
    expect(requestLines(lines, byId)).toEqual([{ id: "k1", option: "6–9 AM", qty: 10 }, { id: "w1", option: null, qty: 67 }]);
  });
  it("turns a listing into what the booking maths prices", () => {
    expect(toOffered(leaderboard)).toMatchObject({ id: "w1", price_kes: 300, price_model: "cpm", min_spend_kes: 15000, bookable: true, ad_format: "web_leaderboard" });
  });
});

describe("whether Book now shows", () => {
  it("follows the house's switch, and the test link in test mode", () => {
    expect(bookingMode({ booking: "test", show_prices: true }, new URLSearchParams("book=test"))).toBe("on");
    expect(bookingMode({ booking: "test", show_prices: true }, new URLSearchParams(""))).toBe("off");
    expect(bookingMode({ booking: "on", show_prices: true }, new URLSearchParams(""))).toBe("on");
    expect(bookingMode({ booking: "on", show_prices: false }, new URLSearchParams(""))).toBe("off");
  });
});

describe("where a way to buy starts", () => {
  it("starts CPM listings from their minimum spend, not their rate per 1,000", async () => {
    const { sectionsOf } = await import("@/lib/storefront");
    const takeover: Listing = { id: "t1", kind: "ad_slot", platform: "web", title: "Mpasho: Homepage takeover", price_kes: 120000, price_unit: "day" };
    const mpasho: Listing = { ...leaderboard, id: "m1", title: "Mpasho: Leaderboard", price_kes: 250, min_spend_kes: 10000 };
    expect(sectionsOf([takeover, mpasho], true).find((s) => s.key === "web")?.fromPrice).toBe(10000);
  });
});
