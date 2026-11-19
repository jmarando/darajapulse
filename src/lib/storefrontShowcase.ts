// The top of a storefront: the house's biggest properties as slides (a picture, who it reaches, a price and a choice to
// add), the names its headline leads with, and the prices the page starts from. Chosen from the house's own listings,
// so it works for any media house without anyone curating it.
import { propertyName } from "@/lib/adPreview";
import {
  aboutOf, fmtCompact, lowestPrice, propertyOf, reachLabel, WAYS, wayOf,
  type Listing, type Section, type WayKey,
} from "@/lib/storefront";
import { defaultOption, perUnit, priceSummary } from "@/lib/storefrontPlan";
import { kes } from "@/lib/storefrontRequests";

export type ShowcaseSlide = {
  /** The property as the storefront names it: "Kiss 100", "The Star online". */
  name: string;
  way: WayKey;
  /** "Radio", "Websites". */
  wayTitle: string;
  /** What the property is, from its subtitle: "Hit music, young audience". */
  about: string | null;
  reach: number;
  /** "4.7M listeners a week"; null when the house hasn't given a number. */
  reachText: string | null;
  photo: string;
  /** The listing the slide's Add puts in the plan, and the choice it adds (the listing's first). */
  item: Listing;
  option: string | null;
  /** "From KES 14,000 a spot"; null when the house doesn't show prices. */
  price: string | null;
  /** What Add puts in the plan when the listing has choices: "6–9 AM at KES 35,000 a spot". */
  choice: string | null;
};

/** Media a buyer books airtime or space on. Packages, accounts, people and events have their own parts of the page. */
const SHOWN: WayKey[] = ["radio", "tv", "web", "print", "audio"];
/** The formats that best stand for a property, the most typical first: a spot for a station, a top banner for a site. */
const FORMAT_RANK = ["radio_spot", "web_leaderboard", "audio_preroll", "print_display", "web_mpu", "radio_mention", "web_article", "audio_hostread"];
const rankOf = (format: string | null | undefined) => {
  const at = FORMAT_RANK.indexOf(format ?? "");
  return at < 0 ? FORMAT_RANK.length : at;
};
/** No more than this many slides from one way to buy, so a house with many stations still shows its other media. */
const PER_WAY = 3;

/** "Hit music, young audience"; a subtitle that starts with a web address keeps its own case. */
const sentence = (text: string | null): string | null =>
  !text ? null : /^\S*\.\S/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);

type Property = { name: string; way: WayKey; reach: number; items: Listing[] };

/**
 * Up to `max` slides, one per property: first the properties with the most reach (no more than three from one way to
 * buy), then a property from each way not shown yet, then the rest. Only properties with a picture, and with a price
 * when the house shows prices. Each slide stands for the property's most typical listing and gets a picture no earlier
 * slide uses. Only listings named "Property: Format", as the rate card reads them: without that, a listing's name is a
 * show or a deal ("Kameme Breakfast Show — Live Read"), not a station a headline can name, so such a house keeps its
 * plain headline.
 */
export function showcaseSlides(items: Listing[], showPrices: boolean, max = 5): ShowcaseSlide[] {
  const byName = new Map<string, Listing[]>();
  for (const item of items) {
    if (!SHOWN.includes(wayOf(item)) || !item.title.includes(": ")) continue;
    const name = propertyOf(item);
    byName.set(name, [...(byName.get(name) ?? []), item]);
  }
  const offered = (item: Listing) => !showPrices || lowestPrice(item) !== null;
  const listingsIn = (way: WayKey) => items.filter((i) => wayOf(i) === way).length;
  const wayAt = (way: WayKey) => WAYS.findIndex((w) => w.key === way);
  const properties: Property[] = [...byName]
    .map(([name, list]) => ({ name, way: wayOf(list[0]), reach: Math.max(0, ...list.map((i) => Number(i.follower_count) || 0)), items: list }))
    .filter((p) => p.items.some((i) => i.cover_url) && p.items.some(offered))
    .sort((a, b) => b.reach - a.reach || listingsIn(b.way) - listingsIn(a.way) || wayAt(a.way) - wayAt(b.way));

  const chosen: Property[] = [];
  const fromWay = (way: WayKey) => chosen.filter((p) => p.way === way).length;
  const take = (ok: (p: Property) => boolean) => {
    for (const p of properties) if (chosen.length < max && !chosen.includes(p) && ok(p)) chosen.push(p);
  };
  take((p) => p.reach > 0 && fromWay(p.way) < PER_WAY);
  take((p) => fromWay(p.way) === 0);
  take((p) => fromWay(p.way) < PER_WAY);

  const used = new Set<string>();
  return chosen.map((p) => {
    const ranked = p.items.filter(offered)
      .sort((a, b) => rankOf(a.ad_format) - rankOf(b.ad_format) || (lowestPrice(a) ?? Infinity) - (lowestPrice(b) ?? Infinity));
    const best = rankOf(ranked[0].ad_format);
    // Among the most typical listings, one whose own picture isn't on screen yet.
    const item = ranked.find((i) => rankOf(i.ad_format) === best && i.cover_url && !used.has(i.cover_url)) ?? ranked[0];
    const covers = [item.cover_url, ...p.items.map((i) => i.cover_url)].filter((c): c is string => Boolean(c));
    const photo = covers.find((c) => !used.has(c)) ?? covers[0];
    used.add(photo);

    const label = reachLabel(item.kind, item.platform);
    const option = defaultOption(item);
    const chosenOption = item.options?.find((o) => o.label === option);
    const optionPrice = showPrices && typeof chosenOption?.price_kes === "number" && chosenOption.price_kes > 0 ? chosenOption.price_kes : null;
    const per = perUnit(chosenOption?.unit ?? item.price_unit);
    return {
      name: p.name,
      way: p.way,
      wayTitle: WAYS[wayAt(p.way)].title,
      about: sentence(aboutOf(item)),
      reach: p.reach,
      reachText: p.reach > 0 ? `${fmtCompact(p.reach)} ${label === "reach" ? "reach" : label}` : null,
      photo,
      item,
      option,
      price: priceSummary(item, showPrices),
      choice: option ? (optionPrice ? `${option} at ${kes(optionPrice)}${per ? ` ${per}` : ""}` : option) : null,
    };
  });
}

/**
 * The names the headline leads with: the first two slides and the first later one from another way to buy ("Classic
 * 105. Radio Jambo. The Star."), shortened as a reader says them. Empty when there are fewer than two slides.
 */
export function headlineNames(slides: ShowcaseSlide[]): string[] {
  if (slides.length < 2) return [];
  const other = slides.find((s, i) => i > 1 && s.way !== slides[0].way) ?? slides[2];
  return [slides[0], slides[1], other].filter((s): s is ShowcaseSlide => Boolean(s)).map((s) => propertyName(s.item));
}

/** "Radio from KES 5,000 · Packages from KES 210,000": radio and packages first, else the first two priced ways. */
export function fromLine(sections: Section[], showPrices: boolean): string | null {
  if (!showPrices) return null;
  const priced = sections.filter((s) => typeof s.fromPrice === "number" && s.fromPrice > 0);
  const lead = (["radio", "packages"] as WayKey[]).map((key) => priced.find((s) => s.key === key)).filter((s): s is Section => Boolean(s));
  const chosen = [...new Set([...lead, ...priced])].slice(0, 2);
  return chosen.length ? chosen.map((s) => `${s.title} from ${kes(s.fromPrice as number)}`).join(" · ") : null;
}
