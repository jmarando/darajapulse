// Checking a booking sent from a storefront's checkout: first its shape (no database), then its prices against the
// listings as they are now. Pure, so the booking function and the tests share it.
import {
  BOOKING_LIMITS, FILE_TYPES, MADE_FOR_A_FEE, MATERIAL_ORDER, MAX_ONLINE_TOTAL, TARGETS,
  bookingTotals, isIsoDate, payMethods, priceLine,
  type LineInput, type Material, type OfferedItem, type PayMethod, type PricedLine, type ProductionFees, type Target, type Totals,
} from "./storefront-booking.ts";

export type BuyerInput = {
  name: string; company?: string | null; email: string; phone?: string | null; kra_pin?: string | null; client?: string | null;
};
export type MaterialInput = {
  mode: "have" | "make" | "later"; script?: string | null; topic?: string | null; guest?: string | null;
  guest_phone?: string | null; notes?: string | null;
};
export type KitInput = { headline?: string | null; message?: string | null; cta?: string | null; colour?: string | null };
export type FileSlot = Material | "kit_logo" | "kit_photo";
export type FileInput = { slot: FileSlot; name: string; type: string; size: number };
export type QuoteLine = { id: string; option: string | null; qty: number };
export type CreateInput = {
  agency_slug: string; lines: LineInput[]; quote_lines: QuoteLine[];
  materials: Partial<Record<Material, MaterialInput>>; kit: KitInput; buyer: BuyerInput; method: PayMethod; files: FileInput[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const COLOUR_RE = /^#[0-9a-fA-F]{6}$/;
const MODES = ["have", "make", "later"] as const;
const SLOTS: FileSlot[] = [...MATERIAL_ORDER, "kit_logo", "kit_photo"];
const TARGET_KEYS = TARGETS.map((t) => t.key);

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

/** Trimmed text without NULs (Postgres refuses them), cut to `max`; null when empty or not text. */
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.split("\u0000").join("").trim();
  return t ? t.slice(0, max) : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readLine(raw: unknown): LineInput | null {
  const x = obj(raw);
  if (typeof x.id !== "string" || !UUID_RE.test(x.id)) return null;
  const target = TARGET_KEYS.includes(x.target as Target) ? x.target as Target : null;
  return {
    id: x.id,
    option: text(x.option, 200),
    qty: num(x.qty) ?? 1,
    budget: num(x.budget),
    target,
    start: isIsoDate(x.start) ? x.start : null,
    end: isIsoDate(x.end) ? x.end : null,
    dates: Array.isArray(x.dates) ? x.dates.filter(isIsoDate).slice(0, BOOKING_LIMITS.rangeDays) : null,
  };
}

function readMaterial(raw: unknown): MaterialInput | null {
  const x = obj(raw);
  if (!MODES.includes(x.mode as MaterialInput["mode"])) return null;
  return {
    mode: x.mode as MaterialInput["mode"],
    script: text(x.script, BOOKING_LIMITS.script),
    topic: text(x.topic, 200),
    guest: text(x.guest, 200),
    guest_phone: text(x.guest_phone, 50),
    notes: text(x.notes, BOOKING_LIMITS.note),
  };
}

/** The checkout's request, tidied and checked for shape. Prices and dates are checked by priceBooking. */
export function readCreate(raw: unknown): { ok: true; value: CreateInput } | (Fail & { spam?: true }) {
  const input = obj(raw);
  if (typeof input.website === "string" && input.website.trim()) return { ok: false, error: "spam", spam: true };
  const agencySlug = text(input.agency_slug, 80);
  if (!agencySlug || !/^[A-Za-z0-9-]+$/.test(agencySlug)) return fail("This storefront isn't available.");

  const b = obj(input.buyer);
  const name = text(b.name, 200);
  if (!name) return fail("Add your name.");
  const email = text(b.email, 320)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return fail("Add a valid email address.");

  const lines = (Array.isArray(input.lines) ? input.lines : []).map(readLine).filter((l): l is LineInput => l !== null);
  if (!lines.length) return fail("Pick at least one thing to book.");
  if (lines.length > BOOKING_LIMITS.lines) return fail(`Book at most ${BOOKING_LIMITS.lines} things at once.`);
  const method = input.method === "pesapal" || input.method === "bank" ? input.method : null;
  if (!method) return fail("Choose how to pay.");

  const quoteLines = (Array.isArray(input.quote_lines) ? input.quote_lines : []).flatMap((raw): QuoteLine[] => {
    const x = obj(raw);
    if (typeof x.id !== "string" || !UUID_RE.test(x.id)) return [];
    return [{ id: x.id, option: text(x.option, 200), qty: Math.min(BOOKING_LIMITS.qty, Math.max(1, Math.round(num(x.qty) ?? 1))) }];
  }).slice(0, BOOKING_LIMITS.lines);

  const materials: Partial<Record<Material, MaterialInput>> = {};
  const m = obj(input.materials);
  for (const key of MATERIAL_ORDER) {
    const read = readMaterial(m[key]);
    if (read) materials[key] = read;
  }

  const k = obj(input.kit);
  const colour = text(k.colour, 7);
  const files = (Array.isArray(input.files) ? input.files : []).slice(0, 40).flatMap((raw): FileInput[] => {
    const f = obj(raw);
    if (!SLOTS.includes(f.slot as FileSlot)) return [];
    const fileName = text(f.name, 200);
    if (!fileName) return [];
    return [{ slot: f.slot as FileSlot, name: fileName, type: text(f.type, 100) ?? "", size: num(f.size) ?? 0 }];
  });

  return {
    ok: true,
    value: {
      agency_slug: agencySlug,
      lines,
      quote_lines: quoteLines,
      materials,
      kit: { headline: text(k.headline, 120), message: text(k.message, 120), cta: text(k.cta, 120), colour: colour && COLOUR_RE.test(colour) ? colour : null },
      buyer: {
        name, email,
        company: text(b.company, 200),
        phone: text(b.phone, 50),
        kra_pin: text(b.kra_pin, 20)?.toUpperCase() ?? null,
        client: text(b.client, 200),
      },
      method,
      files,
    },
  };
}

/** The error for the first file the booking can't take, or null when they're all fine. */
export function checkFiles(files: FileInput[], needed: Material[]): string | null {
  if (files.length > BOOKING_LIMITS.files) return `Add at most ${BOOKING_LIMITS.files} files.`;
  for (const f of files) {
    if (!FILE_TYPES.includes(f.type)) return `"${f.name}" isn't a file type we take: use JPG, PNG, PDF, MP3, WAV or MP4.`;
    if (!(f.size > 0)) return `"${f.name}" is empty.`;
    if (f.size > BOOKING_LIMITS.fileBytes) return `"${f.name}" is over 25 MB.`;
    if (f.slot !== "kit_logo" && f.slot !== "kit_photo" && !needed.includes(f.slot)) return "That file doesn't belong to anything in this booking.";
  }
  return null;
}

export type CleanBooking = {
  lines: PricedLine[]; quoteLines: QuoteLine[]; materials: Partial<Record<Material, MaterialInput>>; makes: Material[];
  kit: KitInput; buyer: BuyerInput; method: PayMethod; files: FileInput[]; totals: Totals; start: string; end: string | null;
};

/** Prices every line against the listings as they are now, settles the material, and checks the total and the way to pay. */
export function priceBooking(
  input: CreateInput, offered: OfferedItem[], fees: ProductionFees, ready: { pesapal: boolean; bank: boolean }, today: string,
): { ok: true; value: CleanBooking } | Fail {
  const byId = new Map(offered.map((i) => [i.id, i]));
  const lines: PricedLine[] = [];
  for (const l of input.lines) {
    const item = byId.get(l.id);
    if (!item) return fail("Something in your plan is no longer offered. Refresh the page and pick again.");
    const priced = priceLine(item, l, today);
    if (priced.ok === false) return priced;
    lines.push(priced.line);
  }

  const needed = MATERIAL_ORDER.filter((m) => lines.some((l) => l.materials.includes(m)));
  const materials: Partial<Record<Material, MaterialInput>> = {};
  for (const m of needed) {
    const given = input.materials[m];
    // Only audio, banners and print are made for a fee; the others are made from the buyer's words and photos.
    materials[m] = given ? { ...given, mode: given.mode === "make" && !MADE_FOR_A_FEE.includes(m) ? "have" : given.mode } : { mode: "later" };
  }
  const makes = needed.filter((m) => materials[m]?.mode === "make");

  const fileError = checkFiles(input.files, needed);
  if (fileError) return fail(fileError);

  const totals = bookingTotals(lines.map((l) => l.total), makes, fees);
  if (totals.total > MAX_ONLINE_TOTAL) return fail("Bookings above KES 5,000,000 go through the team: send this one as a request instead.");
  if (!payMethods(totals.total, ready).some((p) => p.method === input.method)) return fail("That way to pay isn't available for this booking.");

  const starts = lines.map((l) => l.start).sort();
  const ends = lines.map((l) => l.end).filter((e): e is string => Boolean(e)).sort();
  return {
    ok: true,
    value: {
      lines, quoteLines: input.quote_lines.filter((q) => byId.has(q.id)), materials, makes, kit: input.kit, buyer: input.buyer,
      method: input.method, files: input.files, totals, start: starts[0], end: ends.length ? ends[ends.length - 1] : null,
    },
  };
}

/** Files the page says it uploaded, each with its own storage path; entries missing a name, slot or path are dropped. */
export function readUploaded(raw: unknown): (FileInput & { path: string })[] {
  return (Array.isArray(raw) ? raw : []).slice(0, BOOKING_LIMITS.files).flatMap((f): (FileInput & { path: string })[] => {
    const x = obj(f);
    if (typeof x.name !== "string" || typeof x.path !== "string" || !SLOTS.includes(x.slot as FileSlot)) return [];
    return [{ slot: x.slot as FileSlot, name: x.name.slice(0, 200), type: String(x.type ?? ""), size: Number(x.size) || 0, path: x.path }];
  });
}
