// A buyer's booking on a media house's storefront: create it (prices recomputed here), add ad files, pay by Pesapal or
// bank transfer, tell the house about a transfer, and approve or question the house-made ad. Public: the anon key
// reaches it, and every step after create needs the booking's token. Design: STOREFRONT_BOOKINGS_DESIGN.md.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  BOOKING_LIMITS, BOOKING_RATE_LIMITS, earliestStart, newRef, newToken, safeFileName,
  type Material, type OfferedItem, type ProductionFees,
} from "../_shared/storefront-booking.ts";
import { checkFiles, priceBooking, readCreate, readUploaded, type FileInput } from "../_shared/storefront-booking-check.ts";
import { bookingRow, pickLines, type StorefrontItem } from "../_shared/storefront-request.ts";
import { bookingUrl, houseById, logEvent, settleFromPesapal, type House } from "../_shared/storefront-booking-actions.ts";
import { mailerFor, type MailBooking } from "../_shared/storefront-booking-mail.ts";
import { bankReady, publicView, type BookingRow, type PaymentDetails, type PayReady, type SavedFile } from "../_shared/storefront-booking-view.ts";
import { pesapalGetStatus, pesapalIpnId, pesapalSubmitOrder, pesapalTokenFor, storefrontPesapalKeys } from "../_shared/pesapal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "storefront-ads";
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

/** Today in Kenya (UTC+3 all year), the day the buyer's page counts from. */
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

type HouseRow = House & { show_prices: boolean; booking: string; production: ProductionFees };

async function houseBySlug(slug: string): Promise<HouseRow | null> {
  // Letters, digits and hyphens only, so the case-insensitive match below can't be given a wildcard.
  if (!/^[A-Za-z0-9-]{1,80}$/.test(slug)) return null;
  const { data } = await sb.from("agencies")
    .select("id, name, display_name, slug, subdomain, support_email, logo_url, primary_color, storefront_show_prices, storefront_booking, storefront_production, is_active")
    .ilike("slug", slug).eq("is_active", true).maybeSingle();
  if (!data) return null;
  return {
    id: data.id, name: data.display_name || data.name, slug: data.slug, subdomain: data.subdomain ?? null,
    support_email: data.support_email ?? null, logo_url: data.logo_url ?? null, primary_color: data.primary_color ?? null,
    show_prices: Boolean(data.storefront_show_prices), booking: data.storefront_booking ?? "off",
    production: (data.storefront_production ?? {}) as ProductionFees,
  };
}

async function offeredItems(agencyId: string): Promise<OfferedItem[]> {
  const { data } = await sb.from("inventory_items")
    .select("id, title, kind, platform, handle, deliverable_type, follower_count, base_rate_kes, price_unit, options, bookable, price_model, min_spend_kes, ad_format")
    .eq("agency_id", agencyId).eq("is_active", true);
  return (data ?? []).map((i: Record<string, unknown>) => ({
    id: i.id as string, title: i.title as string, kind: i.kind as string, platform: (i.platform as string) ?? null,
    handle: (i.handle as string) ?? null, deliverable_type: (i.deliverable_type as string) ?? null,
    follower_count: (i.follower_count as number) ?? null,
    price_kes: Number(i.base_rate_kes) > 0 ? Number(i.base_rate_kes) : null, price_unit: (i.price_unit as string) ?? null,
    options: (i.options as OfferedItem["options"]) ?? null, bookable: Boolean(i.bookable),
    price_model: i.price_model === "cpm" ? "cpm" : "unit", min_spend_kes: (i.min_spend_kes as number) ?? null,
    ad_format: (i.ad_format as string) ?? null,
  }));
}

async function paymentDetails(agencyId: string): Promise<PaymentDetails | null> {
  const { data } = await sb.from("storefront_payment_details")
    .select("account_name, bank_name, bank_branch, account_number, paybill, paybill_account").eq("agency_id", agencyId).maybeSingle();
  return (data as PaymentDetails | null) ?? null;
}

// Bank transfer is always offered: with the house's account saved the buyer sees it straight away, without it the
// house emails an invoice (the emails and the booking page say which).
const readyFor = (payment: PaymentDetails | null): PayReady => ({
  pesapal: Boolean(storefrontPesapalKeys()), bank: true, bank_details: bankReady(payment),
});

async function bookingByToken(token: unknown): Promise<BookingRow | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const { data } = await sb.from("storefront_bookings").select("*").eq("token", token).maybeSingle();
  return (data as BookingRow | null) ?? null;
}

async function viewOf(row: BookingRow) {
  const [house, payment] = await Promise.all([houseById(sb, row.agency_id), paymentDetails(row.agency_id)]);
  const paths = [...(row.files ?? []), ...(row.final_files ?? []), ...(row.proof?.files ?? [])].map((f) => f.path).filter(Boolean);
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const d of (data ?? []) as { path: string | null; signedUrl: string | null }[]) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  }
  return publicView(row, {
    house: { name: house?.name ?? "", logo_url: house?.logo_url ?? null, primary_color: house?.primary_color ?? null, support_email: house?.support_email ?? null },
    payment, urls, ready: readyFor(payment), today: today(),
  });
}

const mailFor = async (row: BookingRow) => {
  const house = await houseById(sb, row.agency_id);
  if (!house) throw new Error("house not found");
  return mailerFor(sb, row as unknown as MailBooking, house, await paymentDetails(row.agency_id));
};

/** Signed upload links for files, numbered after the booking's existing ones, under the booking's own folder. */
async function uploadLinks(agencyId: string, ref: string, files: FileInput[], startAt: number) {
  const out: { slot: string; path: string; token: string }[] = [];
  for (const [n, f] of files.entries()) {
    const path = `${agencyId}/${ref}/${startAt + n + 1}-${safeFileName(f.name)}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) throw new Error(`upload link: ${error?.message ?? "no token"}`);
    out.push({ slot: f.slot, path, token: data.token });
  }
  return out;
}

const readFiles = (raw: unknown): FileInput[] =>
  (Array.isArray(raw) ? raw : []).slice(0, BOOKING_LIMITS.files).flatMap((f): FileInput[] => {
    const x = (f ?? {}) as Record<string, unknown>;
    if (typeof x.name !== "string" || typeof x.slot !== "string") return [];
    return [{ slot: x.slot as FileInput["slot"], name: x.name.slice(0, 200), type: String(x.type ?? ""), size: Number(x.size) || 0 }];
  });

const neededOf = (row: BookingRow) => Object.keys(row.materials ?? {}) as Material[];

async function guardedUpdate(row: BookingRow, patch: Record<string, unknown>) {
  const { data, error } = await sb.from("storefront_bookings").update(patch).eq("id", row.id).eq("status", row.status).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data as BookingRow | null;
}

// ---------------------------------------------------------------- actions

async function options(body: Record<string, unknown>) {
  const house = typeof body.agency_slug === "string" ? await houseBySlug(body.agency_slug) : null;
  if (!house || !house.show_prices || house.booking === "off") return json({ booking: "off" });
  const ready = readyFor(await paymentDetails(house.id));
  return json({ booking: house.booking, ...ready, production: house.production, earliest: earliestStart(today()) });
}

async function create(body: Record<string, unknown>) {
  const checked = readCreate(body);
  if (checked.ok === false) return checked.spam ? json({ ok: true }) : fail(checked.error);
  const input = checked.value;
  const house = await houseBySlug(input.agency_slug);
  if (!house || !house.show_prices || house.booking === "off") return fail("Online booking isn't open on this storefront.", 403);

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  const [byEmail, byHouse] = await Promise.all([
    sb.from("storefront_bookings").select("id", { count: "exact", head: true }).eq("contact_email", input.buyer.email).gte("created_at", hourAgo),
    sb.from("storefront_bookings").select("id", { count: "exact", head: true }).eq("agency_id", house.id).gte("created_at", tenMinutesAgo),
  ]);
  if ((byEmail.count ?? 0) >= BOOKING_RATE_LIMITS.perEmailPerHour || (byHouse.count ?? 0) >= BOOKING_RATE_LIMITS.perStorefrontPer10Min) {
    return fail("A lot of bookings came in just now. Try again in a few minutes.", 429);
  }

  const [offered, payment] = await Promise.all([offeredItems(house.id), paymentDetails(house.id)]);
  const priced = priceBooking(input, offered, house.production, readyFor(payment), today());
  if (priced.ok === false) return fail(priced.error);
  const v = priced.value;

  const base = {
    agency_id: house.id, status: "awaiting_payment", contact_name: v.buyer.name, contact_email: v.buyer.email,
    contact_phone: v.buyer.phone ?? null, company: v.buyer.company ?? null, kra_pin: v.buyer.kra_pin ?? null, client_name: v.buyer.client ?? null,
    lines: v.lines, materials: v.materials, kit: v.kit, files: [], media_kes: v.totals.media, production_kes: v.totals.production,
    vat_kes: v.totals.vat, total_kes: v.totals.total, start_date: v.start, end_date: v.end, pay_method: v.method,
  };
  let row: BookingRow | null = null;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    const { data, error } = await sb.from("storefront_bookings").insert({ ...base, ref: newRef(), token: newToken() }).select("*").single();
    if (!error) row = data as BookingRow;
    else if (error.code !== "23505") {
      console.error("storefront-booking: insert failed", error.code, error.message);
      return fail("Your booking could not be saved. Try again.", 500);
    }
  }
  if (!row) return fail("Your booking could not be saved. Try again.", 500);

  // Lines that can't be booked online go to the house as a quote request, linked to this booking.
  let quoteNote: string | null = null;
  if (v.quoteLines.length) {
    const picked = pickLines(v.quoteLines, offered as unknown as StorefrontItem[]);
    if (picked.length) {
      const request = {
        agencySlug: house.slug, itemIds: [...new Set(picked.map((p) => p.item.id))], lines: v.quoteLines,
        contactName: v.buyer.name, contactEmail: v.buyer.email, contactPhone: v.buyer.phone ?? null, company: v.buyer.company ?? null,
        budgetKes: null, targetStart: v.start, targetEnd: v.end, message: `Sent with booking ${row.ref}.`, brief: null,
      };
      const { data: req } = await sb.from("inventory_bookings").insert(bookingRow(house.id, request, picked)).select("id").single();
      if (req?.id) {
        await sb.from("storefront_bookings").update({ request_id: req.id }).eq("id", row.id);
        quoteNote = `Also asked for a quote on: ${picked.map((p) => p.item.title).join(", ")}.`;
      }
    }
  }

  const uploads = await uploadLinks(house.id, row.ref, v.files, 0);
  await logEvent(sb, row.id, "buyer", "created", { total: v.totals.total, method: v.method, quote: Boolean(quoteNote) });
  if (v.method === "bank") {
    const mail = mailerFor(sb, row as unknown as MailBooking, house, payment);
    await mail.buyer("created_bank");
    await mail.house("new_booking", quoteNote);
  }
  return json({ token: row.token, ref: row.ref, total: v.totals.total, uploads });
}

async function filesAdded(row: BookingRow, body: Record<string, unknown>) {
  if (row.status === "done" || row.status === "cancelled") return fail("This booking is closed.");
  const files = readUploaded(body.files);
  const folder = `${row.agency_id}/${row.ref}/`;
  const { data: listed } = await sb.storage.from(BUCKET).list(`${row.agency_id}/${row.ref}`, { limit: 100 });
  const present = new Set(((listed ?? []) as { name: string }[]).map((o) => `${folder}${o.name}`));
  const fresh = files.filter((f) => f.path.startsWith(folder) && present.has(f.path) && !(row.files ?? []).some((g) => g.path === f.path));
  const error = checkFiles(fresh, neededOf(row));
  if (error) return fail(error);
  if (!fresh.length) return json(await viewOf(row));
  const saved: SavedFile[] = [...(row.files ?? []), ...fresh.map((f) => ({ slot: f.slot, path: f.path, name: f.name, type: f.type, size: f.size }))];
  const patch: Record<string, unknown> = { files: saved };
  if (row.status === "changes_requested") patch.status = "paid";
  const next = await guardedUpdate(row, patch);
  if (!next) return fail("This booking changed just now. Refresh and try again.", 409);
  await logEvent(sb, row.id, "buyer", "files_added", { count: fresh.length });
  if (next.status === "paid") await (await mailFor(next)).house("files_added");
  return json(await viewOf(next));
}

async function moreUploads(row: BookingRow, body: Record<string, unknown>) {
  if (row.status === "done" || row.status === "cancelled") return fail("This booking is closed.");
  const files = readFiles(body.files);
  if ((row.files ?? []).length + files.length > BOOKING_LIMITS.files) return fail(`A booking takes at most ${BOOKING_LIMITS.files} files.`);
  const error = checkFiles(files, neededOf(row));
  if (error) return fail(error);
  return json({ uploads: await uploadLinks(row.agency_id, row.ref, files, (row.files ?? []).length) });
}

async function pay(row: BookingRow) {
  const keys = storefrontPesapalKeys();
  if (!keys) return fail("Paying by M-Pesa or card isn't set up yet: pay by bank transfer instead.");
  if (row.status !== "awaiting_payment") return fail("This booking is already paid.");
  const house = await houseById(sb, row.agency_id);
  if (!house) return fail("This storefront isn't available.", 404);
  const attempt = (row.pesapal_attempt ?? 0) + 1;
  const token = await pesapalTokenFor(keys);
  const notificationId = await pesapalIpnId(token, `${SUPABASE_URL}/functions/v1/storefront-pesapal-ipn`);
  const [first, ...rest] = row.contact_name.split(/\s+/);
  const order = await pesapalSubmitOrder(token, {
    id: `${row.ref}-${attempt}`, amount: row.total_kes, description: `${house.name} booking ${row.ref}`.slice(0, 100),
    callback_url: bookingUrl(house, row.token),
    notification_id: notificationId, email: row.contact_email, phone: row.contact_phone,
    first_name: first || row.contact_name, last_name: rest.join(" ") || first || row.contact_name,
  });
  const next = await guardedUpdate(row, {
    pay_method: "pesapal", pesapal_attempt: attempt, pesapal_tracking_id: order.order_tracking_id, pesapal_status: "Pending",
  });
  if (!next) return fail("This booking changed just now. Refresh and try again.", 409);
  await logEvent(sb, row.id, "buyer", "payment_started", { attempt });
  return json({ redirect_url: order.redirect_url });
}

async function useBank(row: BookingRow) {
  if (row.status !== "awaiting_payment") return fail("This booking is already paid.");
  const switched = row.pay_method !== "bank";
  const next = switched ? await guardedUpdate(row, { pay_method: "bank" }) : row;
  if (!next) return fail("This booking changed just now. Refresh and try again.", 409);
  if (switched) {
    await logEvent(sb, row.id, "buyer", "pay_by_bank");
    const mail = await mailFor(next);
    await mail.buyer("created_bank");
    await mail.house("new_booking");
  }
  return json(await viewOf(next));
}

async function verify(row: BookingRow) {
  const keys = storefrontPesapalKeys();
  if (row.status === "awaiting_payment" && row.pesapal_tracking_id && keys) {
    const status = await pesapalGetStatus(await pesapalTokenFor(keys), row.pesapal_tracking_id);
    await settleFromPesapal(sb, row, status, await mailFor(row));
    const again = await bookingByToken(row.token);
    if (again) return json(await viewOf(again));
  }
  return json(await viewOf(row));
}

async function claim(row: BookingRow, body: Record<string, unknown>) {
  if (row.status !== "awaiting_payment" || row.pay_method !== "bank") return fail("There's no transfer to tell us about on this booking.");
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!/^[A-Za-z0-9 \-/]{3,40}$/.test(reference)) return fail("Add the transaction code from your bank or M-Pesa message.");
  const next = await guardedUpdate(row, { payment_claimed_at: new Date().toISOString(), payment_claimed_ref: reference });
  if (!next) return fail("This booking changed just now. Refresh and try again.", 409);
  await logEvent(sb, row.id, "buyer", "payment_claimed", { reference });
  await (await mailFor(next)).house("payment_claimed", `Transaction code: ${reference}`);
  return json(await viewOf(next));
}

async function finalDecision(row: BookingRow, body: Record<string, unknown>) {
  if (row.final_state !== "awaiting_buyer") return fail("There's no ad waiting for your answer.");
  const decision = body.decision === "approve" ? "approve" : body.decision === "change" ? "change" : null;
  if (!decision) return fail("Say whether the ad is good to go.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, BOOKING_LIMITS.note) : "";
  if (decision === "change" && !note) return fail("Say what should change.");
  const { data, error } = await sb.from("storefront_bookings")
    .update({ final_state: decision === "approve" ? "approved" : "changes" })
    .eq("id", row.id).eq("final_state", "awaiting_buyer").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fail("This booking changed just now. Refresh and try again.", 409);
  await logEvent(sb, row.id, "buyer", decision === "approve" ? "final_approved" : "final_changes", note ? { note } : {});
  await (await mailFor(data as BookingRow)).house(decision === "approve" ? "final_approved" : "final_changes", note || null);
  return json(await viewOf(data as BookingRow));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("That request could not be read."); }
  try {
    switch (body?.action) {
      case "options": return await options(body);
      case "create": return await create(body);
    }
    const row = await bookingByToken(body?.token);
    if (!row) return fail("This booking link isn't valid.", 404);
    switch (body.action) {
      case "get": return json(await viewOf(row));
      case "files_added": return await filesAdded(row, body);
      case "upload_urls": return await moreUploads(row, body);
      case "pay": return await pay(row);
      case "use_bank": return await useBank(row);
      case "verify": return await verify(row);
      case "claim": return await claim(row, body);
      case "final_decision": return await finalDecision(row, body);
      default: return fail("Unknown action.");
    }
  } catch (e) {
    console.error("storefront-booking:", body?.action, e instanceof Error ? e.message : String(e));
    return fail("Something went wrong on our side. Try again in a moment.", 500);
  }
});
