import { describe, expect, it } from "vitest";
import { fromLine, headlineNames, showcaseSlides } from "@/lib/storefrontShowcase";
import { contrastWithWhite, readableShade } from "@/lib/houseColor";
import { sectionsOf, type Listing } from "@/lib/storefront";

const spots = (station: string, about: string, reach: number, cover: string, prices: [number, number]): Listing => ({
  id: `${station}-spots`, kind: "ad_slot", platform: "radio", title: `${station}: Spot adverts`, subtitle: `${station} · ${about}`,
  follower_count: reach, cover_url: cover, price_kes: prices[1], price_unit: "spot", ad_format: "radio_spot", bookable: true,
  options: [{ label: "6–9 AM", price_kes: prices[0] }, { label: "Run of station", price_kes: prices[1] }],
});

const items: Listing[] = [
  { id: "pack", kind: "bundle", platform: "mixed", title: "Immersion package", cover_url: "/pack.webp", price_kes: 210000, price_unit: "package" },
  spots("Classic 105", "#1 station in Nairobi", 9_700_000, "/classic.webp", [40000, 16000]),
  spots("Radio Jambo", "Swahili, football and humour", 8_390_000, "/jambo.webp", [39500, 17000]),
  spots("Kiss 100", "hit music, young audience", 4_660_000, "/kiss.webp", [35000, 14000]),
  // Cheaper than a spot, but not what stands for a station.
  { id: "kiss-weekend", kind: "ad_slot", platform: "radio", title: "Kiss 100: Weekend airtime", subtitle: "Kiss 100 · hit music, young audience",
    follower_count: 4_660_000, cover_url: "/kiss.webp", price_kes: 10000, price_unit: "slot", ad_format: "radio_promotion" },
  spots("Homeboyz Radio", "urban youth", 1_480_000, "/homeboyz.webp", [30000, 10000]),
  { id: "star-lb", kind: "ad_slot", platform: "web", title: "The Star online: Leaderboard", subtitle: "The Star online · the-star.co.ke, Kenya's news site",
    follower_count: 4_000_000, cover_url: "/star.webp", price_kes: 300, price_unit: "1,000 views", price_model: "cpm", min_spend_kes: 15000, ad_format: "web_leaderboard" },
  // Same picture as Radio Jambo's slide: Songa Play should show its own.
  { id: "patanisho", kind: "ad_slot", platform: "podcast", title: "Songa Play: Patanisho", subtitle: "Songa Play podcast · From Gidi na Ghost",
    cover_url: "/jambo.webp", price_kes: 500, price_unit: "1,000 listens", price_model: "cpm", min_spend_kes: 10000, ad_format: "audio_preroll",
    options: [{ label: "15-second pre-roll", price_kes: 500 }] },
  { id: "stream", kind: "ad_slot", platform: "podcast", title: "Songa Play: Live stream pre-roll", subtitle: "Songa Play · the stations' live streams",
    cover_url: "/songa.webp", price_kes: 600, price_unit: "1,000 listens", price_model: "cpm", min_spend_kes: 10000, ad_format: "audio_preroll",
    options: [{ label: "Kiss 100", price_kes: 600 }] },
  { id: "paper", kind: "ad_slot", platform: "print", title: "The Star newspaper: Display ad", subtitle: "The Star newspaper · news and sport",
    cover_url: "/paper.webp", price_kes: 60000, price_unit: "insertion", ad_format: "print_display" },
  // A big account: social accounts have their own part of the page.
  { id: "fb", kind: "owned_account", platform: "facebook", title: "The Star on Facebook", follower_count: 20_000_000, cover_url: "/fb.webp", price_kes: 50000, price_unit: "post" },
];

describe("the storefront showcase", () => {
  it("leads with the properties that reach the most, three at most from one way to buy, then another way", () => {
    expect(showcaseSlides(items, true).map((s) => s.name)).toEqual(["Classic 105", "Radio Jambo", "Kiss 100", "The Star online", "Songa Play"]);
  });

  it("stands each station for its spots, with the price, who it reaches and what Add puts in the plan", () => {
    const kiss = showcaseSlides(items, true).find((s) => s.name === "Kiss 100")!;
    expect(kiss).toMatchObject({
      way: "radio", wayTitle: "Radio", photo: "/kiss.webp", option: "6–9 AM",
      price: "From KES 14,000 a spot", choice: "6–9 AM at KES 35,000 a spot",
      reachText: "4.7M listeners a week", about: "Hit music, young audience",
    });
    expect(kiss.item.id).toBe("Kiss 100-spots");
  });

  it("sells a website by the 1,000 views and keeps a web address in its own case", () => {
    const star = showcaseSlides(items, true).find((s) => s.name === "The Star online")!;
    expect(star).toMatchObject({
      price: "KES 300 per 1,000 views, minimum KES 15,000", option: null, choice: null,
      reachText: "4M visitors a month", about: "the-star.co.ke, Kenya's news site",
    });
  });

  it("never shows the same picture twice, and picks the listing that owns the picture it shows", () => {
    const slides = showcaseSlides(items, true);
    expect(new Set(slides.map((s) => s.photo)).size).toBe(slides.length);
    const songa = slides.find((s) => s.name === "Songa Play")!;
    expect(songa.photo).toBe("/songa.webp");
    expect(songa.item.id).toBe("stream");
    expect(songa.reachText).toBeNull();
  });

  it("names the choice without a price when the house doesn't show prices", () => {
    const hidden = items.map((i) => ({ ...i, price_kes: null, options: i.options?.map(({ label }) => ({ label })) ?? null }));
    const kiss = showcaseSlides(hidden, false).find((s) => s.name === "Kiss 100")!;
    expect(kiss.price).toBeNull();
    expect(kiss.choice).toBe("6–9 AM");
  });

  it("leaves out properties with no picture, and shows none when nothing has one", () => {
    expect(showcaseSlides(items.map((i) => ({ ...i, cover_url: null })), true)).toEqual([]);
  });

  it("builds the headline from the first two slides and the first from another way", () => {
    expect(headlineNames(showcaseSlides(items, true))).toEqual(["Classic 105", "Radio Jambo", "The Star"]);
    expect(headlineNames(showcaseSlides(items, true).slice(0, 1))).toEqual([]);
  });

  it("says where the page's prices start, radio and packages first", () => {
    expect(fromLine(sectionsOf(items, true), true)).toBe("Radio from KES 10,000 · Packages from KES 210,000");
    expect(fromLine(sectionsOf(items, true), false)).toBeNull();
  });
});

describe("the house colour on a filled button", () => {
  it("darkens a red that white text can't quite read on, and leaves the rest alone", () => {
    expect(contrastWithWhite("#ED1C24")).toBeLessThan(4.5);
    const red = readableShade("#ED1C24");
    expect(red).not.toBe("#ED1C24");
    expect(contrastWithWhite(red)).toBeGreaterThanOrEqual(4.5);
    expect(readableShade("#1d4ed8")).toBe("#1d4ed8");
    expect(readableShade("hsl(var(--primary))")).toBe("hsl(var(--primary))");
    expect(contrastWithWhite(readableShade("#fff"))).toBeGreaterThanOrEqual(4.5);
  });
});
