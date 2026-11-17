// Booking maths shared by the storefront page, the booking functions and the tests: prices, VAT, cost per 1,000
// views, schedules and dates. Pure: no Deno, network or database, so the page shows what the server will charge.

export const VAT_RATE = 0.16;
/** Working days between booking and the earliest start, so the house can check the ad and schedule it. */
export const LEAD_WORKING_DAYS = 3;
/** Working days before the start by which the ad is due. */
export const AD_DUE_WORKING_DAYS = 2;
/** A narrowed audience ("Nairobi only", "Phones only") costs this much more per 1,000 views. */
export const NARROW_UPLIFT = 1.2;
/** Bigger bookings go through the house's team as a request. */
export const MAX_ONLINE_TOTAL = 5_000_000;
export const MPESA_MAX = 250_000;
export const PESALINK_MAX = 999_999;
export const BOOKING_LIMITS = {
  lines: 40, qty: 999, budget: 50_000_000, rangeDays: 366, files: 12, fileBytes: 26_214_400, script: 2000, note: 2000,
};
export const FILE_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "video/mp4",
];
export const BOOKING_RATE_LIMITS = { perEmailPerHour: 10, perStorefrontPer10Min: 30 };

export type PriceModel = "unit" | "cpm";
export const AD_FORMATS = [
  "radio_spot", "radio_mention", "radio_interview", "radio_classified", "radio_promotion",
  "web_leaderboard", "web_mpu", "web_halfpage", "web_takeover", "web_article",
  "audio_preroll", "audio_hostread", "print_display", "social_post", "package",
] as const;
export type AdFormat = typeof AD_FORMATS[number];

/** The kinds of material a booking can need from the buyer. */
export type Material = "audio" | "script" | "banner" | "print" | "social" | "article" | "interview" | "brief";
export const MATERIAL_ORDER: Material[] = ["audio", "script", "banner", "print", "social", "article", "interview", "brief"];
/** The house makes these for a fee when the buyer asks ("Make it for me"); the rest it makes from words and photos. */
export const MADE_FOR_A_FEE: Material[] = ["audio", "banner", "print"];
export type ProductionFees = Partial<Record<"audio" | "banner" | "print", number>>;

export type Target = "kenya" | "nairobi" | "mombasa" | "phones";
export const TARGETS: { key: Target; label: string }[] = [
  { key: "kenya", label: "All of Kenya" },
  { key: "nairobi", label: "Nairobi only" },
  { key: "mombasa", label: "Mombasa only" },
  { key: "phones", label: "Phones only" },
];

export type ScheduleKind = "flight" | "spread" | "dates" | "start";
export type PayMethod = "pesapal" | "bank";

/** What the buyer must give for a format; a Songa Play host read is words, the other pre-rolls are audio. */
export function materialsFor(format: AdFormat | string | null | undefined, option: string | null): Material[] {
  switch (format) {
    case "radio_spot": return ["audio"];
    case "radio_mention": case "radio_classified": case "audio_hostread": return ["script"];
    case "radio_interview": return ["interview"];
    case "radio_promotion": return ["audio", "script"];
    case "web_leaderboard": case "web_mpu": case "web_halfpage": case "web_takeover": return ["banner"];
    case "web_article": return ["article"];
    case "audio_preroll": return /read by the host/i.test(option ?? "") ? ["script"] : ["audio"];
    case "print_display": return ["print"];
    case "social_post": return ["social"];
    case "package": return ["brief"];
    default: return [];
  }
}

const SPREAD_UNITS = new Set(["spot", "mention"]);
const DATE_UNITS = new Set(["day", "insertion", "article", "story", "episode", "interview", "programme", "post", "video", "game"]);

/** How a line is scheduled: by budget over a run, spread over a run, on picked days, or from a start date. */
export function scheduleKind(unit: string | null | undefined, model: PriceModel): ScheduleKind {
  if (model === "cpm") return "flight";
  const u = (unit ?? "").trim().toLowerCase();
  if (SPREAD_UNITS.has(u)) return "spread";
  if (DATE_UNITS.has(u)) return "dates";
  return "start";
}

// ---------------------------------------------------------------- dates (ISO YYYY-MM-DD, worked in UTC)

const DAY_MS = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isWeekend = (t: number) => {
  const day = new Date(t).getUTCDay();
  return day === 0 || day === 6;
};

/** A real calendar date written as YYYY-MM-DD. */
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && ISO_RE.test(v) && toIso(toUtc(v)) === v;

/** The date n working days (Monday to Friday) after, or before when n is negative. */
export function addWorkingDays(iso: string, n: number): string {
  let t = toUtc(iso);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(Math.trunc(n));
  while (left > 0) {
    t += step * DAY_MS;
    if (!isWeekend(t)) left -= 1;
  }
  return toIso(t);
}

export const earliestStart = (today: string): string => addWorkingDays(today, LEAD_WORKING_DAYS);
export const adDue = (start: string): string => addWorkingDays(start, -AD_DUE_WORKING_DAYS);

/** Every date from start to end, both included; empty when the end comes first. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toUtc(start), last = toUtc(end); t <= last; t += DAY_MS) out.push(toIso(t));
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "24 Nov". */
export const shortDate = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Spots shared as evenly as they go over the days; fewer spots than days are spaced out. */
export function spreadSpots(qty: number, days: string[]): { date: string; count: number }[] {
  if (!days.length || qty <= 0) return [];
  const counts = days.map(() => 0);
  for (let i = 0; i < qty; i++) counts[Math.floor((i * days.length) / qty)] += 1;
  return days.map((date, i) => ({ date, count: counts[i] })).filter((d) => d.count > 0);
}

// ---------------------------------------------------------------- cost per 1,000 views

export const effectiveCpm = (cpm: number, target: Target): number => (target === "kenya" ? cpm : Math.round(cpm * NARROW_UPLIFT));
export const cpmViews = (budget: number, cpm: number): number => (cpm > 0 ? Math.floor((budget * 1000) / cpm) : 0);

// ---------------------------------------------------------------- pricing a line

/** A listing as the booking side reads it: its prices are shown, whatever the storefront's display switch says. */
export type OfferedItem = {
  id: string; title: string; kind: string; platform: string | null;
  price_kes: number | null; price_unit: string | null;
  options: { label: string; price_kes?: number | null; unit?: string | null }[] | null;
  bookable: boolean; price_model: PriceModel; min_spend_kes: number | null; ad_format: string | null;
  handle?: string | null; deliverable_type?: string | null; follower_count?: number | null;
};

/** One line of a booking as the page sends it. */
export type LineInput = {
  id: string; option: string | null; qty: number; budget?: number | null; target?: Target | null;
  start?: string | null; end?: string | null; dates?: string[] | null;
};

export type PricedLine = {
  id: string; title: string; option: string | null; qty: number; unit: string | null; unitPrice: number;
  model: PriceModel; cpm: number | null; budget: number | null; target: Target; views: number | null;
  kind: ScheduleKind; start: string; end: string | null; dates: string[]; total: number;
  adFormat: string | null; materials: Material[];
};

const kesText = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const TARGET_KEYS = TARGETS.map((t) => t.key);

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

/** Prices one line against the listing as it is now, and checks its amount and dates. */
export function priceLine(item: OfferedItem, input: LineInput, today: string): { ok: true; line: PricedLine } | Fail {
  const title = item.title;
  if (!item.bookable) return fail(`${title} can't be booked online.`);
  const hasChoices = Boolean(item.options?.length);
  const option = hasChoices ? input.option ?? null : null;
  let unitPrice: number | null;
  let unit: string | null;
  if (hasChoices) {
    const o = item.options!.find((x) => x.label === option);
    if (!o) return fail(`Pick a choice for ${title}.`);
    unitPrice = positive(o.price_kes);
    unit = o.unit ?? item.price_unit ?? null;
  } else {
    unitPrice = positive(item.price_kes);
    unit = item.price_unit ?? null;
  }
  if (unitPrice === null) return fail(`${title} has no price yet.`);

  const model: PriceModel = item.price_model === "cpm" ? "cpm" : "unit";
  const kind = scheduleKind(unit, model);
  const target: Target = input.target && TARGET_KEYS.includes(input.target) ? input.target : "kenya";
  let qty = 1;
  let budget: number | null = null;
  let cpm: number | null = null;
  let views: number | null = null;
  if (model === "cpm") {
    const b = Math.round(Number(input.budget));
    if (!Number.isFinite(b) || b <= 0) return fail(`Set a budget for ${title}.`);
    const min = positive(item.min_spend_kes) ?? 0;
    if (b < min) return fail(`The minimum for ${title} is ${kesText(min)}.`);
    if (b > BOOKING_LIMITS.budget) return fail(`The budget for ${title} is more than we can take online.`);
    budget = b;
    cpm = effectiveCpm(unitPrice, target);
    views = cpmViews(b, cpm);
  } else {
    const q = Math.round(Number(input.qty));
    if (!Number.isFinite(q) || q < 1) return fail(`Say how many of ${title} you want.`);
    qty = Math.min(BOOKING_LIMITS.qty, q);
  }

  const earliest = earliestStart(today);
  const tooEarly = () => fail(`${title} can start on ${shortDate(earliest)} at the earliest.`);
  let start: string;
  let end: string | null = null;
  let dates: string[] = [];
  if (kind === "dates") {
    dates = [...new Set((input.dates ?? []).filter(isIsoDate))].sort();
    if (!dates.length) return fail(`Pick the days for ${title}.`);
    if (dates[0] < earliest) return tooEarly();
    qty = dates.length;
    start = dates[0];
    end = dates[dates.length - 1];
  } else {
    if (!isIsoDate(input.start)) return fail(`Pick when ${title} starts.`);
    start = input.start;
    if (start < earliest) return tooEarly();
    if (kind === "flight" || kind === "spread") {
      if (!isIsoDate(input.end)) return fail(`Pick when ${title} ends.`);
      end = input.end;
      if (end < start) return fail(`${title} ends before it starts.`);
      if ((toUtc(end) - toUtc(start)) / DAY_MS + 1 > BOOKING_LIMITS.rangeDays) return fail(`${title} can run for a year at most.`);
    }
  }

  return {
    ok: true,
    line: {
      id: item.id, title, option, qty, unit, unitPrice, model, cpm, budget, target, views, kind, start, end, dates,
      total: model === "cpm" ? (budget as number) : unitPrice * qty,
      adFormat: item.ad_format ?? null, materials: materialsFor(item.ad_format, option),
    },
  };
}

// ---------------------------------------------------------------- totals and payment

export type Totals = { media: number; production: number; vat: number; total: number };

/** Media, the house's fee once for each kind of material it makes, VAT at 16% on both, and the total. */
export function bookingTotals(lineTotals: number[], makes: Material[], fees: ProductionFees): Totals {
  const media = lineTotals.reduce((sum, n) => sum + Math.round(n), 0);
  const production = [...new Set(makes)]
    .filter((m): m is "audio" | "banner" | "print" => MADE_FOR_A_FEE.includes(m))
    .reduce((sum, m) => sum + (positive(fees[m]) ?? 0), 0);
  const vat = Math.round((media + production) * VAT_RATE);
  return { media, production, vat, total: media + production + vat };
}

/** The ways this total can be paid, each with a note when the amount is over that way's limit. */
export function payMethods(total: number, ready: { pesapal: boolean; bank: boolean }): { method: PayMethod; note: string | null }[] {
  if (total > MAX_ONLINE_TOTAL) return [];
  const out: { method: PayMethod; note: string | null }[] = [];
  if (ready.pesapal) {
    out.push({ method: "pesapal", note: total > MPESA_MAX ? "M-Pesa takes up to KES 250,000 a payment: use a card for this amount." : null });
  }
  if (ready.bank) {
    out.push({ method: "bank", note: total > PESALINK_MAX ? "PesaLink takes up to KES 999,999 a transfer: send it in parts, or by RTGS." : null });
  }
  return out;
}

/** Whether Pesapal's own status says this booking is paid: completed, in KES, for the full amount. */
export function pesapalPaid(
  status: { status_code?: number; amount?: number; currency?: string; confirmation_code?: string | null; payment_method?: string | null },
  total: number,
): { paid: boolean; ref: string | null; method: string | null } {
  const paid = status.status_code === 1
    && (status.currency ?? "").toUpperCase() === "KES"
    && Math.abs(Number(status.amount) - total) < 1;
  return { paid, ref: paid ? status.confirmation_code ?? null : null, method: paid ? status.payment_method ?? null : null };
}

// ---------------------------------------------------------------- references, tokens, file names

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** "BK-7F3K2Q": for people to quote. Access always needs the token. */
export function newRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `BK-${Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;
}

/** 32 URL-safe characters from 24 random bytes. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** "my-logo-final.png": lower case, hyphens, the extension kept, at most 80 characters. */
export function safeFileName(name: string): string {
  const at = name.lastIndexOf(".");
  const ext = at > 0 ? name.slice(at + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (at > 0 ? name.slice(0, at) : name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  return `${base.slice(0, ext ? 79 - ext.length : 80)}${ext ? `.${ext}` : ""}`;
}
