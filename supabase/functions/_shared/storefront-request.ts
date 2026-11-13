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
};

export type CleanRequest = {
  agencySlug: string;
  itemIds: string[];
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

export const LIMITS = { slug: 80, name: 200, email: 320, phone: 50, company: 200, message: 4000, brief: 4000, items: 40 };
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

/** Checks what the storefront's request form sent. The error is written for the person filling it in. */
export function checkRequest(input: Record<string, unknown>): Checked {
  // A field people never see; bots fill it in. Pretend success so they don't retry.
  if (typeof input.website === "string" && input.website.trim()) return { ok: false, error: "spam", spam: true };
  const agencySlug = text(input.agency_slug, LIMITS.slug);
  if (!agencySlug || !/^[A-Za-z0-9-]+$/.test(agencySlug)) return { ok: false, error: "This storefront isn't available." };
  const ids = Array.isArray(input.item_ids)
    ? [...new Set(input.item_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))]
    : [];
  if (!ids.length) return { ok: false, error: "Pick at least one item." };
  if (ids.length > LIMITS.items) return { ok: false, error: `Pick at most ${LIMITS.items} items.` };
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

/** The listings a request names, in the order picked, keeping only ones the storefront still offers. */
export function pickItems(itemIds: string[], offered: StorefrontItem[]): StorefrontItem[] {
  const byId = new Map(offered.map((i) => [i.id, i]));
  return itemIds.map((id) => byId.get(id)).filter((i): i is StorefrontItem => Boolean(i));
}

/** The inventory_bookings row for a checked request. A brief written in the storefront's planner joins the message. */
export function bookingRow(agencyId: string, req: CleanRequest, items: StorefrontItem[]) {
  const message = [req.message, req.brief ? `Brief: ${req.brief}` : null].filter(Boolean).join("\n\n") || null;
  return {
    agency_id: agencyId,
    inventory_item_id: items[0]?.id ?? null,
    items: items.map((i) => ({
      id: i.id, title: i.title, kind: i.kind, platform: i.platform, handle: i.handle, deliverable_type: i.deliverable_type,
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

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export type RequestEmail = {
  houseName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  company: string | null;
  items: { title: string; kind: string; deliverable: string }[];
  budget: string | null;
  dates: string | null;
  message: string | null;
  brief: string | null;
  requestsUrl: string;
};

/** What both emails (to the media house, and the receipt to the requester) show. */
export function emailData(houseName: string, req: CleanRequest, items: StorefrontItem[], requestsUrl: string): RequestEmail {
  const dates = req.targetStart && req.targetEnd
    ? `${fmtDate(req.targetStart)} to ${fmtDate(req.targetEnd)}`
    : req.targetStart ? `From ${fmtDate(req.targetStart)}` : req.targetEnd ? `By ${fmtDate(req.targetEnd)}` : null;
  return {
    houseName,
    contactName: req.contactName,
    contactEmail: req.contactEmail,
    contactPhone: req.contactPhone,
    company: req.company,
    items: items.map((i) => ({ title: i.title, kind: KIND_WORD[i.kind] ?? i.kind, deliverable: i.deliverable_type ?? "" })),
    budget: req.budgetKes != null ? `KES ${req.budgetKes.toLocaleString("en-KE")}` : null,
    dates,
    message: req.message,
    brief: req.brief,
    requestsUrl,
  };
}
