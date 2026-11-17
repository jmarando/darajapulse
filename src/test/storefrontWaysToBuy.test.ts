import { describe, expect, it } from "vitest";
import {
  buildRateGrids, filterGrid, formatOf, naturalList, offerGroups, propertyOf, sectionsOf, stationColumns, wayOf, WAYS, type Listing,
} from "@/lib/storefront";
import {
  addItems, changeOption, countByWay, defaultOption, lineKey, perUnit, planTotals, priceSummary, qtyLabel, removeItems, removeLine,
  savedEstimate, savedLineText, setQty, toggleItem, toggleLine, unitPrice, unitWord, type PlanLine,
} from "@/lib/storefrontPlan";

const L = (over: Partial<Listing>): Listing => ({ id: over.title ?? "x", kind: "ad_slot", title: "x", ...over });

const spots = (station: string, prices: (number | null)[], id = `${station}-spots`) => L({
  id, title: `${station}: Spot adverts`, platform: "radio", price_unit: "spot", price_kes: Math.min(...prices.filter((p): p is number => p !== null)),
  options: ["6–9 AM", "10 AM–2 PM", "Run of station"].map((label, n) => ({ label, price_kes: prices[n] })).filter((o) => o.price_kes !== null),
});

describe("ways to buy", () => {
  it("files every listing under the way people buy it", () => {
    expect(wayOf(L({ kind: "bundle", platform: "mixed" }))).toBe("packages");
    expect(wayOf(L({ kind: "owned_account", platform: "tiktok" }))).toBe("social");
    expect(wayOf(L({ kind: "influencer", platform: "radio" }))).toBe("talent");
    expect(wayOf(L({ platform: "radio" }))).toBe("radio");
    expect(wayOf(L({ platform: "tv" }))).toBe("tv");
    expect(wayOf(L({ platform: "web" }))).toBe("web");
    expect(wayOf(L({ platform: "print" }))).toBe("print");
    expect(wayOf(L({ platform: "podcast" }))).toBe("audio");
    expect(wayOf(L({ platform: "event" }))).toBe("events");
    expect(wayOf(L({ platform: "billboard" }))).toBe("other");
    expect(WAYS.map((w) => w.key)).toEqual(["packages", "radio", "tv", "web", "print", "audio", "social", "talent", "events", "other"]);
  });

  it("reads the property and the format from a 'Property: Format' title", () => {
    expect(propertyOf(L({ title: "Kiss 100: Spot adverts" }))).toBe("Kiss 100");
    expect(formatOf(L({ title: "Kiss 100: Spot adverts" }))).toBe("Spot adverts");
    expect(propertyOf(L({ title: "Songa Play: Maina and King'ang'i in the Morning" }))).toBe("Songa Play");
    expect(propertyOf(L({ title: "Advert production", subtitle: "Radio Africa studios · for any station" }))).toBe("Radio Africa studios");
    expect(formatOf(L({ title: "Advert production" }))).toBe("Advert production");
  });
});

describe("the radio rate card", () => {
  it("puts one format's stations side by side, with a dash where a station doesn't sell a time", () => {
    const items = [
      spots("Kiss 100", [35000, 20500, 14000]),
      spots("Classic 105", [40000, null, 16000]),
      L({ id: "kiss-int", title: "Kiss 100: Interviews", platform: "radio", price_unit: "interview", options: [{ label: "10 AM–7 PM", price_kes: 150000 }] }),
      L({ id: "classic-int", title: "Classic 105: Interviews", platform: "radio", price_unit: "interview", options: [{ label: "10 AM–7 PM", price_kes: 150000 }, { label: "Live", unit: "game", price_kes: 450000 }] }),
    ];
    const { grids, loose } = buildRateGrids(items);
    expect(loose).toEqual([]);
    expect(grids.map((g) => g.format)).toEqual(["Spot adverts", "Interviews"]);
    const [spotGrid, interviewGrid] = grids;
    expect(spotGrid.columns.map((c) => c.name)).toEqual(["Kiss 100", "Classic 105"]);
    expect(spotGrid.rows.map((r) => r.label)).toEqual(["6–9 AM", "10 AM–2 PM", "Run of station"]);
    expect(spotGrid.rows[0].cells.map((c) => c?.price ?? null)).toEqual([35000, 40000]);
    expect(spotGrid.rows[1].cells[1]).toBeNull();
    expect(spotGrid.rows[0].cells[0]).toMatchObject({ itemId: "Kiss 100-spots", option: "6–9 AM" });
    expect(spotGrid.rows[0].unit).toBe("spot");
    // A row whose option names its own unit says so; the rest use the listing's.
    expect(interviewGrid.rows.map((r) => [r.label, r.unit])).toEqual([["10 AM–7 PM", "interview"], ["Live", "game"]]);
  });

  it("leaves out what doesn't make a grid: one station only, no choices, or no 'Station: Format' title", () => {
    const church = L({ id: "church", title: "Radio Jambo: Church programme", platform: "radio", options: [{ label: "4–6 AM", price_kes: 35000 }] });
    const production = L({ id: "prod", title: "Advert production", platform: "radio", options: [{ label: "Jingle", price_kes: 140000 }] });
    const plain = L({ id: "plain", title: "Kameme FM: Breakfast show", platform: "radio" });
    const { grids, loose } = buildRateGrids([spots("Kiss 100", [1, 2, 3]), spots("Classic 105", [1, 2, 3]), church, production, plain]);
    expect(grids).toHaveLength(1);
    expect(loose.map((i) => i.id)).toEqual(["church", "prod", "plain"]);
  });

  it("shows the grid without prices when the house keeps them to itself", () => {
    const hidden = (station: string) => L({ id: station, title: `${station}: Spot adverts`, platform: "radio", options: [{ label: "6–9 AM" }] });
    const { grids } = buildRateGrids([hidden("Kiss 100"), hidden("Classic 105")]);
    expect(grids[0].rows[0].cells.map((c) => c?.price)).toEqual([null, null]);
  });
});

describe("a buyer's plan", () => {
  const kiss = spots("Kiss 100", [35000, 20500, 14000], "kiss");
  const web = L({ id: "web", title: "The Star online: Leaderboard", platform: "web", price_unit: "week" });
  const talent = L({ id: "gidi", kind: "influencer", title: "Gidi", price_kes: 60000, price_unit: "mention" });
  const byId = new Map([kiss, web, talent].map((i) => [i.id, i]));

  it("picks and unpicks one choice at a time, and keeps one line per choice", () => {
    let lines: PlanLine[] = [];
    lines = toggleLine(lines, "kiss", "6–9 AM");
    lines = toggleLine(lines, "kiss", "Run of station");
    expect(lines).toEqual([{ id: "kiss", option: "6–9 AM", qty: 1 }, { id: "kiss", option: "Run of station", qty: 1 }]);
    lines = toggleLine(lines, "kiss", "6–9 AM");
    expect(lines).toEqual([{ id: "kiss", option: "Run of station", qty: 1 }]);
    expect(removeLine(lines, lineKey("kiss", "Run of station"))).toEqual([]);
  });

  it("keeps quantities between 1 and 999, and merges two lines when one changes to the other's choice", () => {
    let lines: PlanLine[] = [{ id: "kiss", option: "6–9 AM", qty: 3 }, { id: "kiss", option: "Run of station", qty: 2 }];
    expect(setQty(lines, lineKey("kiss", "6–9 AM"), 0)[0].qty).toBe(1);
    expect(setQty(lines, lineKey("kiss", "6–9 AM"), 5000)[0].qty).toBe(999);
    expect(setQty(lines, lineKey("kiss", "6–9 AM"), 7.6)[0].qty).toBe(8);
    lines = changeOption(lines, lineKey("kiss", "Run of station"), "6–9 AM");
    expect(lines).toEqual([{ id: "kiss", option: "6–9 AM", qty: 5 }]);
    expect(changeOption(lines, lineKey("kiss", "6–9 AM"), "10 AM–2 PM")).toEqual([{ id: "kiss", option: "10 AM–2 PM", qty: 5 }]);
  });

  it("adds what the planner picked with the listing's first choice", () => {
    expect(defaultOption(kiss)).toBe("6–9 AM");
    expect(defaultOption(web)).toBeNull();
  });

  it("totals what has a price and counts what is on request", () => {
    const lines: PlanLine[] = [
      { id: "kiss", option: "6–9 AM", qty: 10 },
      { id: "gidi", option: null, qty: 2 },
      { id: "web", option: null, qty: 1 },
      { id: "gone", option: null, qty: 1 },
    ];
    expect(unitPrice(kiss, "Run of station")).toBe(14000);
    expect(unitPrice(talent, null)).toBe(60000);
    expect(unitPrice(web, null)).toBeNull();
    expect(planTotals(lines, byId)).toEqual({ total: 470000, priced: 2, onRequest: 1, count: 3 });
  });
});

describe("how prices read", () => {
  it("says what one price buys, and how many", () => {
    expect(perUnit("spot")).toBe("a spot");
    expect(perUnit("interview")).toBe("an interview");
    expect(perUnit("hour")).toBe("an hour");
    expect(perUnit("4 weeks")).toBe("per 4 weeks");
    expect(perUnit(null)).toBe("");
    expect(qtyLabel(1, "spot")).toBe("1 spot");
    expect(qtyLabel(10, "spot")).toBe("10 spots");
    expect(qtyLabel(2, "4 weeks")).toBe("2 × 4 weeks");
    expect(qtyLabel(3, null)).toBe("× 3");
  });

  it("gives a card one line: the price, a starting price, on request, or nothing when prices are hidden", () => {
    const one = L({ price_kes: 60000, price_unit: "mention" });
    const many = L({ price_kes: 14000, price_unit: "spot", options: [{ label: "6–9 AM", price_kes: 35000 }, { label: "Run of station", price_kes: 14000 }] });
    const mixedUnits = L({ price_kes: 2500, options: [{ label: "Spot", price_kes: 50000, unit: "spot" }, { label: "Effect", price_kes: 2500, unit: "effect" }] });
    const quoted = L({ price_unit: "week" });
    expect(priceSummary(one, true)).toBe("KES 60,000 a mention");
    expect(priceSummary(many, true)).toBe("From KES 14,000 a spot");
    expect(priceSummary(mixedUnits, true)).toBe("From KES 2,500");
    expect(priceSummary(quoted, true)).toBe("Price on request");
    expect(priceSummary(one, false)).toBeNull();
  });
});

describe("the page's sections", () => {
  const items = [
    L({ id: "talent", kind: "influencer", title: "Gidi", platform: "radio", cover_url: "/gidi.webp" }),
    L({ id: "kiss", title: "Kiss 100: Spot adverts", platform: "radio", price_kes: 14000, price_unit: "spot", cover_url: "/kiss.webp" }),
    L({ id: "east", title: "East FM: Spot adverts", platform: "radio", price_kes: 5000, price_unit: "spot" }),
    L({ id: "prod", title: "Advert production", platform: "radio", price_kes: 2500, price_unit: null }),
    L({ id: "pack", kind: "bundle", title: "Youth culture pack", platform: "mixed", cover_url: "/youth.webp" }),
    L({ id: "lead", title: "The Star online: Leaderboard", platform: "web", price_unit: "week" }),
  ];

  it("lists the ways to buy that have something, in the storefront's order, with how many, a picture and a starting price", () => {
    const sections = sectionsOf(items, true);
    expect(sections.map((s) => s.key)).toEqual(["packages", "radio", "web", "talent"]);
    const radio = sections.find((s) => s.key === "radio")!;
    expect(radio.items.map((i) => i.id)).toEqual(["kiss", "east", "prod"]);
    expect(radio.cover).toBe("/kiss.webp");
    // Production has no unit, so its KES 2,500 extra sound effect isn't the radio's starting price.
    expect(radio.fromPrice).toBe(5000);
    expect(sections.find((s) => s.key === "web")!.fromPrice).toBeNull();
    expect(sectionsOf(items, false).every((s) => s.fromPrice === null)).toBe(true);
  });

  it("gives each section a picture an earlier section isn't showing, when it has one", () => {
    const shared = [
      L({ id: "p", kind: "bundle", title: "Immersion package", platform: "mixed", cover_url: "/partnership.webp" }),
      L({ id: "e1", title: "Live outside broadcast", platform: "event", cover_url: "/partnership.webp" }),
      L({ id: "e2", title: "Station bar event", platform: "event", cover_url: "/bar.webp" }),
      L({ id: "w", title: "Mpasho: Leaderboard", platform: "web", cover_url: "/partnership.webp" }),
    ];
    expect(sectionsOf(shared, true).map((s) => [s.key, s.cover])).toEqual([
      ["packages", "/partnership.webp"], ["web", "/partnership.webp"], ["events", "/bar.webp"],
    ]);
  });

  it("starts from the cheapest choice when a listing has choices", () => {
    const withOptions = L({ id: "spots", title: "Kiss 100: Spot adverts", platform: "radio", price_kes: 99, price_unit: "spot",
      options: [{ label: "6–9 AM", price_kes: 35000 }, { label: "Run of station", price_kes: 14000 }, { label: "Later" }] });
    expect(sectionsOf([withOptions], true)[0].fromPrice).toBe(14000);
  });

  it("groups 'Property: Format' listings under their property and keeps the rest as they come", () => {
    const groups = offerGroups([
      L({ id: "a", title: "The Star online: Leaderboard", subtitle: "The Star online · the-star.co.ke, Kenya's news site", follower_count: 4_000_000, cover_url: "/star.webp" }),
      L({ id: "ob", title: "Live outside broadcast, Nairobi", subtitle: "Radio Africa Events · a station broadcasting from your venue" }),
      L({ id: "b", title: "Mpasho: Leaderboard", subtitle: "Mpasho · celebrity news" }),
      L({ id: "c", title: "The Star online: Half page", subtitle: "The Star online · the-star.co.ke, Kenya's news site", cover_url: "/star.webp" }),
      L({ id: "bar", title: "Station bar event, Nairobi" }),
    ]);
    expect(groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      ["The Star online", ["a", "c"]],
      [null, ["ob", "bar"]],
      ["Mpasho", ["b"]],
    ]);
    expect(groups[0]).toMatchObject({ about: "the-star.co.ke, Kenya's news site", cover: "/star.webp", reach: 4_000_000 });
    expect(groups[1]).toMatchObject({ about: null });
  });

  it("gives a group only the description and picture all its listings share", () => {
    const [songa] = offerGroups([
      L({ id: "p", title: "Songa Play: Patanisho", subtitle: "Songa Play podcast · From Gidi na Ghost's breakfast show", cover_url: "/gidi.webp" }),
      L({ id: "s", title: "Songa Play: Live stream pre-roll", subtitle: "Songa Play · the stations' live streams", cover_url: "/songa.webp" }),
    ]);
    expect(songa).toMatchObject({ name: "Songa Play", about: null, cover: null });
  });

  it("joins words the way a sentence does", () => {
    expect(naturalList([])).toBe("");
    expect(naturalList(["radio"])).toBe("radio");
    expect(naturalList(["radio", "print"])).toBe("radio and print");
    expect(naturalList(["packages", "radio", "print"])).toBe("packages, radio and print");
  });
});

describe("picking a station on the rate card", () => {
  const grids = buildRateGrids([
    spots("Kiss 100", [35000, 20500, 14000]),
    spots("Classic 105", [40000, null, 16000]),
    L({ id: "kiss-int", title: "Kiss 100: Interviews", platform: "radio", follower_count: 4_660_000, cover_url: "/kiss.webp", options: [{ label: "6–10 AM", price_kes: 500000 }] }),
    L({ id: "classic-int", title: "Classic 105: Interviews", platform: "radio", options: [{ label: "10 AM–7 PM", price_kes: 150000 }] }),
  ]).grids;

  it("lists each station once, in rate-card order, with its listeners and picture", () => {
    expect(stationColumns(grids).map((s) => [s.name, s.reach, s.cover])).toEqual([
      ["Kiss 100", 4_660_000, "/kiss.webp"],
      ["Classic 105", 0, null],
    ]);
  });

  it("shows one station's column and drops the rows it doesn't sell", () => {
    const classic = filterGrid(grids[0], "Classic 105");
    expect(classic.columns.map((c) => c.name)).toEqual(["Classic 105"]);
    expect(classic.rows.map((r) => [r.label, r.cells.map((c) => c?.price ?? null)])).toEqual([["6–9 AM", [40000]], ["Run of station", [16000]]]);
    expect(filterGrid(grids[1], "Kiss 100").rows.map((r) => r.label)).toEqual(["6–10 AM"]);
    expect(filterGrid(grids[0], null)).toBe(grids[0]);
    expect(filterGrid(grids[0], "Radio Jambo").rows).toEqual([]);
  });
});

describe("adding from a card or the planner", () => {
  const kiss = spots("Kiss 100", [35000, 20500, 14000], "kiss");
  const talent = L({ id: "gidi", kind: "influencer", title: "Gidi", price_kes: 60000, price_unit: "mention" });
  const web = L({ id: "web", title: "The Star online: Leaderboard", platform: "web" });

  it("adds a listing with its first choice, and takes out every line of it when added again", () => {
    let lines = toggleItem([], kiss);
    expect(lines).toEqual([{ id: "kiss", option: "6–9 AM", qty: 1 }]);
    lines = toggleLine(lines, "kiss", "Run of station");
    expect(toggleItem(lines, kiss)).toEqual([]);
    expect(toggleItem([], talent)).toEqual([{ id: "gidi", option: null, qty: 1 }]);
  });

  it("adds several at once without doubling what's already there, and removes several", () => {
    const lines: PlanLine[] = [{ id: "kiss", option: "Run of station", qty: 4 }];
    expect(addItems(lines, [kiss, talent, web])).toEqual([
      { id: "kiss", option: "Run of station", qty: 4 },
      { id: "gidi", option: null, qty: 1 },
      { id: "web", option: null, qty: 1 },
    ]);
    expect(removeItems(addItems(lines, [kiss, talent, web]), ["kiss", "web"])).toEqual([{ id: "gidi", option: null, qty: 1 }]);
  });

  it("counts the plan's lines under each way to buy", () => {
    const byId = new Map([kiss, talent, web].map((i) => [i.id, i]));
    const lines: PlanLine[] = [
      { id: "kiss", option: "6–9 AM", qty: 2 }, { id: "kiss", option: "Run of station", qty: 1 }, { id: "gidi", option: null, qty: 1 }, { id: "gone", option: null, qty: 1 },
    ];
    expect(countByWay(lines, byId)).toEqual({ radio: 2, talent: 1 });
  });

  it("names what the number counts next to the number box", () => {
    expect(unitWord(1, "spot")).toBe("spot");
    expect(unitWord(10, "spot")).toBe("spots");
    expect(unitWord(2, "4 weeks")).toBe("× 4 weeks");
    expect(unitWord(3, null)).toBe("");
  });
});

describe("a request as the team reads it", () => {
  it("says the choice and how many, and falls back to the deliverable for older requests", () => {
    expect(savedLineText({ title: "Kiss 100: Spot adverts", option: "6–9 AM", qty: 10, unit: "spot", price_kes: 35000 })).toBe("6–9 AM · 10 spots");
    expect(savedLineText({ title: "Gidi", deliverable_type: "Live mention", qty: 1, unit: "mention" })).toBe("Live mention · 1 mention");
    expect(savedLineText({ title: "Kiss 100 on TikTok", deliverable_type: "1 video", handle: "@kiss100kenya" })).toBe("1 video · @kiss100kenya");
    expect(savedLineText({ title: "Pack", qty: 2 })).toBe("× 2");
  });

  it("adds up what had a price and counts what didn't", () => {
    expect(savedEstimate([
      { option: "6–9 AM", qty: 10, unit: "spot", price_kes: 35000 },
      { title: "Leaderboard", qty: 1, unit: "week", price_kes: null },
      { title: "Gidi", price_kes: 60000 },
    ])).toEqual({ total: 410000, onRequest: 1 });
    expect(savedEstimate([{ title: "old request" }])).toBeNull();
  });
});
