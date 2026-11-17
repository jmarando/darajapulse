// The storefront checkout's state and what it sends: the starting schedule, live totals priced by the same code the
// server uses, the create request with its files in upload order, and the uploads themselves.
import {
  addWorkingDays, bookingTotals, earliestStart, MATERIAL_ORDER, priceLine, scheduleKind,
  type CreateInput, type LineInput, type Material, type PayMethod, type PricedLine, type ProductionFees, type Target, type Totals,
} from "@/lib/storefrontBooking";
import { defaultBudget, isCpm, lineKey, toOffered, unitOf, type PlanLine } from "@/lib/storefrontPlan";
import type { Listing } from "@/lib/storefront";

export type CheckoutLine = LineInput & { key: string };

export type MaterialState = {
  mode: "have" | "make" | "later"; files: File[];
  script?: string; topic?: string; guest?: string; guest_phone?: string; notes?: string;
};
export type KitState = { logo: File | null; photos: File[]; headline: string; message: string; cta: string; colour: string };
export const emptyKit: KitState = { logo: null, photos: [], headline: "", message: "", cta: "", colour: "" };
export type BuyerState = { name: string; company: string; email: string; phone: string; kra_pin: string; client: string };
export const emptyBuyer: BuyerState = { name: "", company: "", email: "", phone: "", kra_pin: "", client: "" };

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Today where the buyer is, as YYYY-MM-DD. */
export const localToday = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/**
 * Each bookable line of the plan with a schedule to start from, always from the earliest date allowed today (so a plan
 * made days ago never opens with dates in the past): spots over a week, budgets over two weeks, picked days one working
 * day apart, everything else from the start date.
 */
export function initialSchedule(lines: PlanLine[], byId: Map<string, Listing>, today: string): CheckoutLine[] {
  const start = earliestStart(today);
  return lines.flatMap((l): CheckoutLine[] => {
    const item = byId.get(l.id);
    if (!item?.bookable) return [];
    const cpm = isCpm(item);
    const base: CheckoutLine = {
      key: lineKey(l.id, l.option), id: l.id, option: l.option, qty: l.qty,
      budget: cpm ? l.budget ?? defaultBudget(item) : null, target: "kenya" as Target, start: null, end: null, dates: null,
    };
    switch (scheduleKind(unitOf(item, l.option), cpm ? "cpm" : "unit")) {
      case "flight": return [{ ...base, start, end: addDays(start, 13) }];
      case "spread": return [{ ...base, start, end: addDays(start, 6) }];
      case "dates": return [{ ...base, dates: Array.from({ length: Math.max(1, l.qty) }, (_, i) => addWorkingDays(start, i)) }];
      default: return [{ ...base, start }];
    }
  });
}

/** The lines priced as the server will price them, each line's error by its key, the totals, and the material needed. */
export function checkoutTotals(
  lines: CheckoutLine[], byId: Map<string, Listing>, makes: Material[], fees: ProductionFees, today: string,
): { priced: PricedLine[]; errors: Record<string, string>; totals: Totals; needed: Material[] } {
  const priced: PricedLine[] = [];
  const errors: Record<string, string> = {};
  for (const l of lines) {
    const item = byId.get(l.id);
    if (!item) { errors[l.key] = "This is no longer offered."; continue; }
    const r = priceLine(toOffered(item), l, today);
    if (r.ok === false) errors[l.key] = r.error;
    else priced.push(r.line);
  }
  const needed = MATERIAL_ORDER.filter((m) => priced.some((p) => p.materials.includes(m)));
  return { priced, errors, totals: bookingTotals(priced.map((p) => p.total), makes.filter((m) => needed.includes(m)), fees), needed };
}

/** The create request, and the files to upload in the same order as its `files` list. */
export function buildCreateBody(args: {
  agencySlug: string; lines: CheckoutLine[]; quoteLines: PlanLine[]; needed: Material[];
  materials: Partial<Record<Material, MaterialState>>; kit: KitState; buyer: BuyerState; method: PayMethod; website: string;
}): { body: CreateInput & { website: string }; files: File[] } {
  const files: File[] = [];
  const list: CreateInput["files"] = [];
  const add = (slot: CreateInput["files"][number]["slot"], f: File) => {
    files.push(f);
    list.push({ slot, name: f.name, type: f.type, size: f.size });
  };
  const materials: CreateInput["materials"] = {};
  for (const m of args.needed) {
    const s = args.materials[m] ?? { mode: "later", files: [] };
    const words = Object.fromEntries(
      (["script", "topic", "guest", "guest_phone", "notes"] as const).filter((k) => s[k]?.trim()).map((k) => [k, s[k]!.trim()]),
    );
    materials[m] = { mode: s.mode, ...words };
    if (s.mode === "have") s.files.forEach((f) => add(m, f));
  }
  if (args.kit.logo) add("kit_logo", args.kit.logo);
  args.kit.photos.slice(0, 3).forEach((f) => add("kit_photo", f));
  return {
    files,
    body: {
      agency_slug: args.agencySlug,
      lines: args.lines.map(({ key: _key, ...line }) => line),
      quote_lines: args.quoteLines.map((q) => ({ id: q.id, option: q.option, qty: q.qty })),
      materials,
      kit: { headline: args.kit.headline || null, message: args.kit.message || null, cta: args.kit.cta || null, colour: args.kit.colour || null },
      buyer: { ...args.buyer },
      method: args.method,
      files: list,
      website: args.website,
    },
  };
}

type UploadClient = {
  storage: { from: (bucket: string) => { uploadToSignedUrl: (path: string, token: string, file: File, opts?: { contentType?: string }) => Promise<{ error: unknown }> } };
};

/** Uploads each file through its signed link; returns the ones that arrived, as files_added takes them. */
export async function uploadAll(
  client: UploadClient, uploads: { slot: string; path: string; token: string }[], files: File[],
): Promise<{ slot: string; path: string; name: string; type: string; size: number }[]> {
  const done: { slot: string; path: string; name: string; type: string; size: number }[] = [];
  for (const [n, u] of uploads.entries()) {
    const f = files[n];
    if (!f) continue;
    const { error } = await client.storage.from("storefront-ads").uploadToSignedUrl(u.path, u.token, f, { contentType: f.type });
    if (!error) done.push({ slot: u.slot, path: u.path, name: f.name, type: f.type, size: f.size });
  }
  return done;
}

/** The message a failed function call carries, read from its response body when there is one. */
export async function functionError(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
    const body = ctx?.json ? await ctx.json() : null;
    if (body?.error) return body.error;
  } catch { /* the body wasn't JSON */ }
  return fallback;
}
