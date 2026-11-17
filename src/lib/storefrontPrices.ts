// The house's Prices tab and Settings: a listing's price form and what saving it writes, and the storefront's settings.

export type PriceEdit = {
  bookable: boolean; price_model: "unit" | "cpm"; price: string; price_unit: string; min_spend: string;
  options: { label: string; price: string; unit: string }[];
};

type SavedOption = { label: string; price_kes?: number | null; unit?: string | null };
type SavedRow = {
  bookable?: boolean | null; price_model?: string | null; base_rate_kes?: number | null; price_unit?: string | null;
  min_spend_kes?: number | null; options?: SavedOption[] | null;
};

const num = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? String(n) : "");

export function editFrom(row: SavedRow): PriceEdit {
  return {
    bookable: Boolean(row.bookable),
    price_model: row.price_model === "cpm" ? "cpm" : "unit",
    price: num(row.base_rate_kes),
    price_unit: row.price_unit ?? "",
    min_spend: num(row.min_spend_kes),
    options: (row.options ?? []).map((o) => ({ label: o.label, price: num(o.price_kes), unit: o.unit ?? "" })),
  };
}

const MAX = 50_000_000;
/** Whole shillings from a box: "" is none; anything else must be a whole number in range. */
const shillings = (v: string): number | null | "bad" => {
  const t = v.replace(/[,\s]/g, "");
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "bad";
  const n = Number(t);
  return n <= MAX ? n : "bad";
};

export type PricePatch = {
  bookable: boolean; price_model: "unit" | "cpm"; base_rate_kes: number; price_unit: string | null;
  min_spend_kes: number | null; options: SavedOption[] | null;
};

/** What saving a price form writes, or why it can't be saved. */
export function rowPatch(edit: PriceEdit): { ok: true; patch: PricePatch } | { ok: false; error: string } {
  const bad = () => ({ ok: false as const, error: "Prices are whole shillings, like 15000." });
  const options: SavedOption[] = [];
  const seen = new Set<string>();
  for (const o of edit.options) {
    const label = o.label.trim();
    if (!label) continue;
    if (seen.has(label.toLowerCase())) return { ok: false, error: "Each choice needs its own name." };
    seen.add(label.toLowerCase());
    const price = shillings(o.price);
    if (price === "bad") return bad();
    options.push({ label, ...(price ? { price_kes: price } : {}), ...(o.unit.trim() ? { unit: o.unit.trim() } : {}) });
  }
  const price = shillings(edit.price);
  const min = shillings(edit.min_spend);
  if (price === "bad" || min === "bad") return bad();
  const optionPrices = options.map((o) => o.price_kes).filter((p): p is number => typeof p === "number" && p > 0);
  const base = options.length ? (optionPrices.length ? Math.min(...optionPrices) : 0) : price ?? 0;
  if (edit.price_model === "cpm" && base <= 0) return { ok: false, error: "Give it a price per 1,000 before selling it this way." };
  if (edit.bookable && base <= 0) return { ok: false, error: "Give it a price before booking it online." };
  return {
    ok: true,
    patch: {
      bookable: edit.bookable,
      price_model: edit.price_model,
      base_rate_kes: base,
      price_unit: edit.price_unit.trim() || (edit.price_model === "cpm" ? "1,000 views" : null),
      min_spend_kes: edit.price_model === "cpm" ? min : null,
      options: options.length ? options : null,
    },
  };
}

export type SettingsForm = {
  show_prices: boolean; booking: "off" | "test" | "on"; support_email: string; audio: string; banner: string; print: string;
  account_name: string; bank_name: string; bank_branch: string; account_number: string; paybill: string; paybill_account: string;
};

/** The house's settings as the agencies row and the payment details row take them. */
export function settingsPatch(form: SettingsForm) {
  const production: Record<string, number> = {};
  for (const k of ["audio", "banner", "print"] as const) {
    const n = shillings(form[k]);
    if (typeof n === "number" && n > 0) production[k] = n;
  }
  const t = (v: string) => v.trim() || null;
  return {
    agency: {
      storefront_show_prices: form.show_prices,
      storefront_booking: form.booking,
      support_email: t(form.support_email),
      storefront_production: production,
    },
    payment: {
      account_name: t(form.account_name), bank_name: t(form.bank_name), bank_branch: t(form.bank_branch),
      account_number: t(form.account_number), paybill: t(form.paybill), paybill_account: t(form.paybill_account),
    },
  };
}
