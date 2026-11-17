// A buyer's plan on a storefront: what they picked (a listing, and which of its choices), how many, and what it adds up
// to at the house's published prices.
import { wayOf, type Listing, type WayKey } from "@/lib/storefront";
import { kes } from "@/lib/storefrontRequests";
import type { OfferedItem } from "@/lib/storefrontBooking";

/**
 * One pick: a listing, the choice taken on it (null when it offers none), and how many. A listing sold per 1,000 views
 * (CPM) is bought by budget instead: `budget` is what the buyer spends, and its quantity stays 1.
 */
export type PlanLine = { id: string; option: string | null; qty: number; budget?: number };

export const MAX_QTY = 999;

export const lineKey = (id: string, option: string | null) => `${id}\u0001${option ?? ""}`;
const keyOf = (l: PlanLine) => lineKey(l.id, l.option);

/** Adds the choice, or takes it out when it's already there. */
export function toggleLine(lines: PlanLine[], id: string, option: string | null): PlanLine[] {
  const key = lineKey(id, option);
  return lines.some((l) => keyOf(l) === key) ? lines.filter((l) => keyOf(l) !== key) : [...lines, { id, option, qty: 1 }];
}

export const removeLine = (lines: PlanLine[], key: string): PlanLine[] => lines.filter((l) => keyOf(l) !== key);

const clampQty = (qty: number) => Math.min(MAX_QTY, Math.max(1, Math.round(Number(qty) || 1)));

export const setQty = (lines: PlanLine[], key: string, qty: number): PlanLine[] =>
  lines.map((l) => (keyOf(l) === key ? { ...l, qty: clampQty(qty) } : l));

/** Swaps a line's choice. When the plan already has the new choice, the two lines become one. */
export function changeOption(lines: PlanLine[], key: string, option: string | null): PlanLine[] {
  const line = lines.find((l) => keyOf(l) === key);
  if (!line) return lines;
  const next = lineKey(line.id, option);
  if (next === key) return lines;
  if (lines.some((l) => keyOf(l) === next)) {
    return lines.filter((l) => keyOf(l) !== key).map((l) => (keyOf(l) === next ? { ...l, qty: clampQty(l.qty + line.qty) } : l));
  }
  return lines.map((l) => (keyOf(l) === key ? { ...l, option } : l));
}

/** The choice a listing gets when it's added without one being picked (from the planner, say). */
export const defaultOption = (item: Pick<Listing, "options"> | undefined): string | null => item?.options?.[0]?.label ?? null;

/** Adds a listing with its first choice; when any line of it is already in the plan, takes them all out. */
export function toggleItem(lines: PlanLine[], item: Pick<Listing, "id" | "options">): PlanLine[] {
  return lines.some((l) => l.id === item.id)
    ? lines.filter((l) => l.id !== item.id)
    : [...lines, { id: item.id, option: defaultOption(item), qty: 1 }];
}

/** Adds each listing that isn't in the plan yet, with its first choice. */
export function addItems(lines: PlanLine[], items: Pick<Listing, "id" | "options">[]): PlanLine[] {
  const out = [...lines];
  for (const item of items) {
    if (!out.some((l) => l.id === item.id)) out.push({ id: item.id, option: defaultOption(item), qty: 1 });
  }
  return out;
}

export const removeItems = (lines: PlanLine[], ids: string[]): PlanLine[] => lines.filter((l) => !ids.includes(l.id));

/** How many of the plan's lines sit under each way to buy. */
export function countByWay(lines: PlanLine[], byId: Map<string, Listing>): Partial<Record<WayKey, number>> {
  const out: Partial<Record<WayKey, number>> = {};
  for (const line of lines) {
    const item = byId.get(line.id);
    if (!item) continue;
    const way = wayOf(item);
    out[way] = (out[way] ?? 0) + 1;
  }
  return out;
}

/** What one of this choice costs, or null when it's on request or prices aren't shown. */
export function unitPrice(item: Pick<Listing, "options" | "price_kes">, option: string | null): number | null {
  if (item.options?.length) {
    const o = item.options.find((x) => x.label === option);
    return typeof o?.price_kes === "number" && o.price_kes > 0 ? o.price_kes : null;
  }
  return typeof item.price_kes === "number" && item.price_kes > 0 ? item.price_kes : null;
}

/** What one of this choice buys: the option's own unit, else the listing's. */
export const unitOf = (item: Pick<Listing, "options" | "price_unit">, option: string | null): string | null =>
  item.options?.find((x) => x.label === option)?.unit ?? item.price_unit ?? null;

/** Whether a listing is bought by budget at a price per 1,000 views or listens. */
export const isCpm = (item: Pick<Listing, "price_model"> | null | undefined): boolean => item?.price_model === "cpm";

/** A CPM listing's starting budget: its minimum, else 50,000 views at its lowest price. */
export function defaultBudget(item: Pick<Listing, "min_spend_kes" | "price_kes" | "options">): number {
  if (typeof item.min_spend_kes === "number" && item.min_spend_kes > 0) return item.min_spend_kes;
  const prices = (item.options?.length ? item.options.map((o) => o.price_kes) : [item.price_kes])
    .filter((p): p is number => typeof p === "number" && p > 0);
  return prices.length ? Math.min(...prices) * 50 : 10000;
}

export const setBudget = (lines: PlanLine[], key: string, budget: number): PlanLine[] =>
  lines.map((l) => (keyOf(l) === key ? { ...l, budget: Math.max(0, Math.round(Number(budget) || 0)) } : l));

/** What a line costs at the shown prices: its budget when sold per 1,000 views, else price × quantity. Null on request. */
export function lineCost(line: PlanLine, item: Listing): number | null {
  const price = unitPrice(item, line.option);
  if (price === null) return null;
  return isCpm(item) ? line.budget ?? defaultBudget(item) : price * line.qty;
}

/** The plan's total at the shown prices, how many lines it counts, and how many are on request. */
export function planTotals(lines: PlanLine[], byId: Map<string, Listing>) {
  let total = 0, priced = 0, onRequest = 0, count = 0;
  for (const line of lines) {
    const item = byId.get(line.id);
    if (!item) continue;
    count += 1;
    const cost = lineCost(line, item);
    if (cost === null) onRequest += 1;
    else { total += cost; priced += 1; }
  }
  return { total, priced, onRequest, count };
}

/** The plan as a quote request sends it: a CPM line's budget becomes thousands of views, so the request prices it. */
export function requestLines(lines: PlanLine[], byId: Map<string, Listing>): { id: string; option: string | null; qty: number }[] {
  return lines.map((l) => {
    const item = byId.get(l.id);
    if (!item || !isCpm(item)) return { id: l.id, option: l.option, qty: l.qty };
    const cpm = unitPrice(item, l.option);
    return { id: l.id, option: l.option, qty: cpm ? Math.max(1, Math.round((l.budget ?? defaultBudget(item)) / cpm)) : 1 };
  });
}

/** A listing as the booking maths prices it. */
export function toOffered(item: Listing): OfferedItem {
  return {
    id: item.id, title: item.title, kind: item.kind, platform: item.platform ?? null,
    price_kes: item.price_kes ?? null, price_unit: item.price_unit ?? null, options: item.options ?? null,
    bookable: Boolean(item.bookable), price_model: isCpm(item) ? "cpm" : "unit", min_spend_kes: item.min_spend_kes ?? null,
    ad_format: item.ad_format ?? null, handle: item.handle ?? null, deliverable_type: item.deliverable_type ?? null,
    follower_count: item.follower_count ?? null,
  };
}

/** Whether Book now shows: the house shows prices and booking is on, or in test mode on the ?book=test link. */
export function bookingMode(agency: { booking?: string | null; show_prices?: boolean | null }, search: URLSearchParams): "on" | "off" {
  if (!agency.show_prices) return "off";
  if (agency.booking === "on") return "on";
  return agency.booking === "test" && search.get("book") === "test" ? "on" : "off";
}

const startsWithNumber = (unit: string) => /^\d/.test(unit);

/** "a spot", "an interview", "per 4 weeks". */
export function perUnit(unit: string | null | undefined): string {
  const u = (unit ?? "").trim();
  if (!u) return "";
  if (startsWithNumber(u)) return `per ${u}`;
  return /^(?:[aeiou]|hour)/i.test(u) ? `an ${u}` : `a ${u}`;
}

const plural = (unit: string) => (/s$/.test(unit) ? unit : /(?:ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`);

/** "spot", "spots", "× 4 weeks": the word beside a number box. */
export function unitWord(qty: number, unit: string | null | undefined): string {
  const u = (unit ?? "").trim();
  if (!u) return "";
  if (startsWithNumber(u)) return `× ${u}`;
  return qty === 1 ? u : plural(u);
}

/** "1 spot", "10 spots", "2 × 4 weeks", "× 3". */
export function qtyLabel(qty: number, unit: string | null | undefined): string {
  const u = (unit ?? "").trim();
  if (!u) return `× ${qty}`;
  if (startsWithNumber(u)) return `${qty} × ${u}`;
  return `${qty} ${qty === 1 ? u : plural(u)}`;
}

/**
 * A card's price line: "KES 60,000 a mention", "From KES 14,000 a spot", "Price on request", or null when the house
 * doesn't show prices.
 */
export function priceSummary(
  item: Pick<Listing, "options" | "price_kes" | "price_unit"> & Partial<Pick<Listing, "price_model" | "min_spend_kes">>,
  showPrices: boolean,
): string | null {
  if (!showPrices) return null;
  const options = item.options ?? [];
  if (item.price_model === "cpm") {
    const prices = (options.length ? options.map((o) => o.price_kes) : [item.price_kes]).filter((p): p is number => typeof p === "number" && p > 0);
    if (!prices.length) return "Price on request";
    const per = /listen/i.test(item.price_unit ?? "") ? "per 1,000 listens" : "per 1,000 views";
    const lead = new Set(prices).size > 1 ? `From ${kes(Math.min(...prices))}` : kes(prices[0]);
    const min = typeof item.min_spend_kes === "number" && item.min_spend_kes > 0 ? `, minimum ${kes(item.min_spend_kes)}` : "";
    return `${lead} ${per}${min}`;
  }
  if (options.length) {
    const prices = options.map((o) => o.price_kes).filter((p): p is number => typeof p === "number" && p > 0);
    if (!prices.length) return "Price on request";
    const units = Array.from(new Set(options.map((o) => o.unit ?? item.price_unit ?? "")));
    const per = units.length === 1 ? perUnit(units[0]) : "";
    const lead = options.length === 1 ? kes(prices[0]) : `From ${kes(Math.min(...prices))}`;
    return per ? `${lead} ${per}` : lead;
  }
  if (typeof item.price_kes === "number" && item.price_kes > 0) {
    const per = perUnit(item.price_unit);
    return per ? `${kes(item.price_kes)} ${per}` : kes(item.price_kes);
  }
  return "Price on request";
}

/** What the storefront's parts need to show the plan and change it. */
export type PickApi = {
  showPrices: boolean;
  accent: string;
  /** How many of this choice are in the plan, 0 when none. */
  qtyOf: (id: string, option: string | null) => number;
  /** Whether any choice of this listing is in the plan. */
  isPicked: (id: string) => boolean;
  /** Adds this choice, or takes it out when it's there. */
  onPick: (id: string, option: string | null) => void;
  /** Adds the listing with its first choice, or takes out every line of it. */
  onToggleItem: (item: Listing) => void;
  onAddMany: (items: Listing[], add: boolean) => void;
  onOpen: (item: Listing) => void;
};

/** A picked line as a quote request saved it (see storefront-request's bookingRow); older requests carry no choice or number. */
export type SavedLine = { title?: string; deliverable_type?: string | null; handle?: string | null; option?: string | null; qty?: number | null; unit?: string | null; price_kes?: number | null };

/** "6–9 AM · 10 spots": the choice and how many, for the team reading a request. */
export function savedLineText(line: SavedLine): string {
  const qty = Number(line.qty) || 1;
  const count = line.unit || qty > 1 ? qtyLabel(qty, line.unit) : null;
  return [line.option || line.deliverable_type, count, line.handle].filter(Boolean).join(" · ");
}

/** A request's total at the prices it was sent with, and how many lines had none. Null when nothing had a price. */
export function savedEstimate(lines: SavedLine[]): { total: number; onRequest: number } | null {
  let total = 0, priced = 0;
  for (const l of lines) {
    if (typeof l.price_kes === "number" && l.price_kes > 0) { total += l.price_kes * (Number(l.qty) || 1); priced += 1; }
  }
  return priced ? { total, onRequest: lines.length - priced } : null;
}
