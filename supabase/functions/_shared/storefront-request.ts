// Checking and shaping a quote request sent from a media house's public storefront.
// Pure (no database, network or Deno), so the storefront-request function and the tests share it.

/** A storefront listing as get_public_storefront returns it (only active items of an active storefront). */
export type StorefrontItem = {
  id: string;
  kind: string;
  title: string;
  platform: string | null;
  handle: string | null;
  deliverable_type: string | null;
  /** Shown only when the house shows prices. */
  price_kes?: number | null;
  price_unit?: string | null;
  options?: { label: string; price_kes?: number | null; unit?: string | null }[] | null;
};

/** One pick: a listing, the choice taken on it (null when it offers none), and how many. */
export type RequestLine = { id: string; option: string | null; qty: number };

export type CleanRequest = {
  agencySlug: string;
  /** The listings picked, once each, in the order picked. */
  itemIds: string[];
  lines: RequestLine[];
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  company: string | null;
  budgetKes: number | null;
  targetStart: string | null;
  targetEnd: string | null;
  message: string | null;
  brief: string | null;
};

export const LIMITS = { slug: 80, name: 200, email: 320, phone: 50, company: 200, message: 4000, brief: 4000, items: 40, option: 200, qty: 999 };
/** One address may send this many requests an hour; one storefront takes this many in ten minutes. */
export const RATE_LIMITS = { perEmailPerHour: 5, perStorefrontPer10Min: 30 };

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Trimmed text with NULs dropped (Postgres refuses them), cut to `max`; null when empty or not text. */
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.split("\u0000").join("").trim();
  return t ? t.slice(0, max) : null;
};

const isoDate = (v: unknown): string | null => {
  const t = text(v, 10);
  return t && DATE_RE.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
};

export type Checked = { ok: true; value: CleanRequest } | { ok: false; error: string; spam?: true };

/** The page's lines ({id, option, qty}), tidied: real ids only, one line per choice (the first kept), 1 to 999 of each. */
function readLines(v: unknown): RequestLine[] {
  if (!Array.isArray(v)) return [];
  const out: RequestLine[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    if (typeof x.id !== "string" || !UUID_RE.test(x.id)) continue;
    const option = text(x.option, LIMITS.option);
    if (out.some((l) => l.id === x.id && l.option === option)) continue;
    const qty = Math.min(LIMITS.qty, Math.max(1, Math.round(Number(x.qty) || 1)));
    out.push({ id: x.id, option, qty });
  }
  return out;
}

/** Checks what the storefront's request form sent. The error is written for the person filling it in. */
export function checkRequest(input: Record<string, unknown>): Checked {
  // A field people never see; bots fill it in. Pretend success so they don't retry.
  if (typeof input.website === "string" && input.website.trim()) return { ok: false, error: "spam", spam: true };
  const agencySlug = text(input.agency_slug, LIMITS.slug);
  if (!agencySlug || !/^[A-Za-z0-9-]+$/.test(agencySlug)) return { ok: false, error: "This storefront isn't available." };
  // Pages since 16 Nov 2026 send lines (a choice and a number per pick); older pages send item_ids only.
  let lines = readLines(input.lines);
  if (!lines.length) {
    const ids = Array.isArray(input.item_ids)
      ? [...new Set(input.item_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))]
      : [];
    lines = ids.map((id) => ({ id, option: null, qty: 1 }));
  }
  if (!lines.length) return { ok: false, error: "Pick at least one item." };
  if (lines.length > LIMITS.items) return { ok: false, error: `Pick at most ${LIMITS.items} items.` };
  const ids = [...new Set(lines.map((l) => l.id))];
  const contactName = text(input.contact_name, LIMITS.name);
  if (!contactName) return { ok: false, error: "Add your name." };
  const contactEmail = text(input.contact_email, LIMITS.email)?.toLowerCase() ?? null;
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) return { ok: false, error: "Add a valid email address." };
  let budgetKes: number | null = null;
  if (input.budget_kes !== null && input.budget_kes !== undefined && input.budget_kes !== "") {
    const n = Number(input.budget_kes);
    if (!Number.isFinite(n) || n < 0 || n > 2_000_000_000) return { ok: false, error: "Give the budget as a number of shillings." };
    budgetKes = Math.round(n);
  }
  const targetStart = isoDate(input.target_start);
  const targetEnd = isoDate(input.target_end);
  if (targetStart && targetEnd && targetEnd < targetStart) return { ok: false, error: "The end date is before the start date." };
  return {
    ok: true,
    value: {
      agencySlug,
      itemIds: ids,
      lines,
      contactName,
      contactEmail,
      contactPhone: text(input.contact_phone, LIMITS.phone),
      company: text(input.company, LIMITS.company),
      budgetKes,
      targetStart,
      targetEnd,
      message: text(input.message, LIMITS.message),
      brief: text(input.brief, LIMITS.brief),
    },
  };
}

/** A line the storefront still offers, with what one of it costs when the house shows prices, and what one buys. */
export type PickedLine = { item: StorefrontItem; option: string | null; qty: number; unitPrice: number | null; unit: string | null };

const priceOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** The lines a request names, in order, keeping only listings still offered and choices they still offer. */
export function pickLines(lines: RequestLine[], offered: StorefrontItem[]): PickedLine[] {
  const byId = new Map(offered.map((i) => [i.id, i]));
  const out: PickedLine[] = [];
  for (const line of lines) {
    const item = byId.get(line.id);
    if (!item) continue;
    if (line.option !== null) {
      const o = (item.options ?? []).find((x) => x.label === line.option);
      if (!o) continue;
      out.push({ item, option: o.label, qty: line.qty, unitPrice: priceOrNull(o.price_kes), unit: o.unit ?? item.price_unit ?? null });
    } else {
      // A listing with choices picked without one (an older page) has no single price.
      const price = item.options?.length ? null : priceOrNull(item.price_kes);
      out.push({ item, option: null, qty: line.qty, unitPrice: price, unit: item.price_unit ?? null });
    }
  }
  return out;
}

/** "10 spots", "2 × 4 weeks": how many of something, as the emails say it. */
function qtyText(qty: number, unit: string | null): string {
  if (!unit) return `× ${qty}`;
  if (/^\d/.test(unit)) return `${qty} × ${unit}`;
  if (qty === 1) return `1 ${unit}`;
  return `${qty} ${/s$/.test(unit) ? unit : /(?:ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`}`;
}

/** A line as the emails list it: the choice (else the deliverable), and the number when more than one. */
function lineDeliverable(p: PickedLine): string {
  const base = p.option ?? p.item.deliverable_type ?? "";
  if (p.qty <= 1) return base;
  if (!p.unit) return base ? `${base} × ${p.qty}` : `× ${p.qty}`;
  return base ? `${base} · ${qtyText(p.qty, p.unit)}` : qtyText(p.qty, p.unit);
}

/** The inventory_bookings row for a checked request. A brief written in the storefront's planner joins the message. */
export function bookingRow(agencyId: string, req: CleanRequest, picked: PickedLine[]) {
  const message = [req.message, req.brief ? `Brief: ${req.brief}` : null].filter(Boolean).join("\n\n") || null;
  return {
    agency_id: agencyId,
    inventory_item_id: picked[0]?.item.id ?? null,
    items: picked.map(({ item: i, option, qty, unit, unitPrice }) => ({
      id: i.id, title: i.title, kind: i.kind, platform: i.platform, handle: i.handle, deliverable_type: i.deliverable_type,
      option, qty, unit, price_kes: unitPrice,
    })),
    contact_name: req.contactName,
    contact_email: req.contactEmail,
    contact_phone: req.contactPhone,
    company: req.company,
    budget_kes: req.budgetKes,
    target_start: req.targetStart,
    target_end: req.targetEnd,
    message,
    status: "new",
  };
}

/** Who at the media house hears about a request: its contact address, else its admins, else the platform inbox. */
export function houseRecipients(supportEmail: string | null | undefined, adminEmails: string[], fallback: string): string[] {
  const clean = (e: string) => e.trim().toLowerCase();
  if (supportEmail && EMAIL_RE.test(supportEmail.trim())) return [clean(supportEmail)];
  const admins = [...new Set(adminEmails.filter((e) => EMAIL_RE.test((e || "").trim())).map(clean))];
  return admins.length ? admins.slice(0, 5) : [clean(fallback)];
}

export const KIND_WORD: Record<string, string> = { owned_account: "Channel", influencer: "Talent", ad_slot: "On air", bundle: "Package" };
const AD_WORD: Record<string, string> = { web: "Website", print: "Print", podcast: "Podcast", event: "Event" };

/** What a listing is, in one word for the emails: an ad slot by its medium ("On air", "Website", "Podcast"). */
const kindWord = (i: StorefrontItem): string => (i.kind === "ad_slot" && AD_WORD[i.platform ?? ""]) || KIND_WORD[i.kind] || i.kind;

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export type RequestEmail = {
  houseName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  company: string | null;
  items: { title: string; kind: string; deliverable: string }[];
  /** "KES 350,000 at rate-card prices, plus 1 item priced on request", when the house shows prices. */
  estimate: string | null;
  budget: string | null;
  dates: string | null;
  message: string | null;
  brief: string | null;
  requestsUrl: string;
};

const kesText = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

/** The plan's total at the shown prices, and how many lines are on request; null when nothing has a price. */
function estimateText(picked: PickedLine[]): string | null {
  const priced = picked.filter((p) => p.unitPrice !== null);
  if (!priced.length) return null;
  const total = priced.reduce((sum, p) => sum + (p.unitPrice ?? 0) * p.qty, 0);
  const onRequest = picked.length - priced.length;
  return `${kesText(total)} at rate-card prices${onRequest ? `, plus ${onRequest} item${onRequest === 1 ? "" : "s"} priced on request` : ""}`;
}

/** What both emails (to the media house, and the receipt to the requester) show. */
export function emailData(houseName: string, req: CleanRequest, picked: PickedLine[], requestsUrl: string): RequestEmail {
  const dates = req.targetStart && req.targetEnd
    ? `${fmtDate(req.targetStart)} to ${fmtDate(req.targetEnd)}`
    : req.targetStart ? `From ${fmtDate(req.targetStart)}` : req.targetEnd ? `By ${fmtDate(req.targetEnd)}` : null;
  return {
    houseName,
    contactName: req.contactName,
    contactEmail: req.contactEmail,
    contactPhone: req.contactPhone,
    company: req.company,
    items: picked.map((p) => ({ title: p.item.title, kind: kindWord(p.item), deliverable: lineDeliverable(p) })),
    estimate: estimateText(picked),
    budget: req.budgetKes != null ? `KES ${req.budgetKes.toLocaleString("en-KE")}` : null,
    dates,
    message: req.message,
    brief: req.brief,
    requestsUrl,
  };
}
