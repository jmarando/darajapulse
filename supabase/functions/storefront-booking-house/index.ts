// The media house's side of a storefront booking: read it with its files and history, and take each step (confirm a
// transfer, ask for a change, send the finished ad, approve and schedule, mark live and done with proof, cancel, note).
// Signed-in staff of the house, or super admins, only. Design: STOREFRONT_BOOKINGS_DESIGN.md.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller } from "../_shared/auth.ts";
import { BOOKING_LIMITS, FILE_TYPES, safeFileName, shortDate } from "../_shared/storefront-booking.ts";
import { houseCan, houseScope, stateOf, type HouseAction } from "../_shared/storefront-booking-status.ts";
import { houseById, logEvent } from "../_shared/storefront-booking-actions.ts";
import { mailerFor, type MailBooking } from "../_shared/storefront-booking-mail.ts";
import type { BookingRow, SavedFile } from "../_shared/storefront-booking-view.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "storefront-ads";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);
const text = (v: unknown, max = BOOKING_LIMITS.note) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type UploadedFile = { name: string; path: string; type: string; size: number };

async function getView(row: BookingRow) {
  const paths = [...(row.files ?? []), ...(row.final_files ?? []), ...(row.proof?.files ?? [])].map((f) => f.path).filter(Boolean);
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const d of (data ?? []) as { path: string | null; signedUrl: string | null }[]) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  }
  const { data: events } = await sb.from("storefront_booking_events").select("at, actor, kind, detail").eq("booking_id", row.id).order("at");
  return { booking: row, urls, events: events ?? [] };
}

/** Files the house uploaded through its signed links: inside the booking's folder, present, of a type and size we take. */
async function houseFiles(row: BookingRow, raw: unknown): Promise<UploadedFile[] | string> {
  const folder = `${row.agency_id}/${row.ref}/`;
  const files = (Array.isArray(raw) ? raw : []).slice(0, BOOKING_LIMITS.files).map((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    return { name: text(x.name, 200), path: String(x.path ?? ""), type: String(x.type ?? ""), size: Number(x.size) || 0 };
  });
  const { data: listed } = await sb.storage.from(BUCKET).list(`${row.agency_id}/${row.ref}`, { limit: 100 });
  const present = new Set(((listed ?? []) as { name: string }[]).map((o) => `${folder}${o.name}`));
  for (const f of files) {
    if (!f.name || !f.path.startsWith(folder) || !present.has(f.path)) return "A file didn't finish uploading. Try again.";
    if (!FILE_TYPES.includes(f.type)) return `"${f.name}" isn't a file type we take.`;
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("That request could not be read."); }
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;
  if (!id) return fail("Which booking?");
  const { data: found } = await sb.from("storefront_bookings").select("*").eq("id", id).maybeSingle();
  const row = found as BookingRow | null;
  if (!row) return fail("That booking doesn't exist.", 404);

  // Staff of this house, or a super admin. Jobs and internal calls pass, as requireCaller lets them in.
  if (caller.kind === "user") {
    const { data: access } = await sb.rpc("user_has_agency_access", { _user_id: caller.userId, _agency_id: row.agency_id });
    if (!houseScope(caller, access === true)) return fail("You don't have access to this booking.", 403);
  }
  const userId = caller.kind === "user" ? caller.userId : null;

  try {
    const action = String(body.action ?? "");
    if (action === "get") return json(await getView(row));

    if (action === "upload_urls") {
      const purpose = body.purpose === "proof" ? "proof" : "final";
      const files = (Array.isArray(body.files) ? body.files : []).slice(0, BOOKING_LIMITS.files) as Record<string, unknown>[];
      const uploads: { name: string; path: string; token: string }[] = [];
      for (const [n, f] of files.entries()) {
        const name = text(f.name, 200);
        if (!name || !FILE_TYPES.includes(String(f.type ?? ""))) return fail(`"${name || "That file"}" isn't a file type we take.`);
        if (!(Number(f.size) > 0) || Number(f.size) > BOOKING_LIMITS.fileBytes) return fail(`"${name}" is over 25 MB.`);
        const path = `${row.agency_id}/${row.ref}/house-${purpose}-${Date.now()}-${n + 1}-${safeFileName(name)}`;
        const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error || !data?.token) throw new Error(`upload link: ${error?.message ?? "no token"}`);
        uploads.push({ name, path, token: data.token });
      }
      return json({ uploads });
    }

    const act = action as HouseAction;
    if (!["mark_paid", "request_changes", "send_final", "approve", "mark_live", "mark_done", "cancel", "note"].includes(act)) {
      return fail("Unknown action.");
    }
    if (!houseCan(stateOf(row), act)) return fail("That step doesn't fit where this booking is now. Refresh and look again.", 409);

    const patch: Record<string, unknown> = {};
    let buyerEvent: Parameters<ReturnType<typeof mailerFor>["buyer"]>[0] | null = null;
    let note: string | null = null;
    switch (act) {
      case "mark_paid": {
        const reference = text(body.reference, 60);
        if (!reference) return fail("Add the bank's reference for the payment.");
        Object.assign(patch, { status: "paid", paid_at: new Date().toISOString(), payment_ref: reference });
        buyerEvent = "paid";
        break;
      }
      case "request_changes":
        note = text(body.note);
        if (!note) return fail("Say what needs to change.");
        Object.assign(patch, { status: "changes_requested" });
        buyerEvent = "changes_requested";
        break;
      case "send_final": {
        const files = await houseFiles(row, body.files);
        if (typeof files === "string") return fail(files);
        if (!files.length) return fail("Add the finished ad first.");
        const saved: SavedFile[] = files.map((f) => ({ path: f.path, name: f.name, type: f.type, size: f.size }));
        note = text(body.note) || null;
        Object.assign(patch, { final_files: saved, final_state: "awaiting_buyer" });
        buyerEvent = "final_ready";
        break;
      }
      case "approve":
        note = text(body.note) || null;
        Object.assign(patch, { status: "approved", schedule_note: note });
        buyerEvent = "approved";
        break;
      case "mark_live":
        note = text(body.note) || null;
        Object.assign(patch, { status: "live" });
        buyerEvent = "live";
        break;
      case "mark_done": {
        const files = body.files ? await houseFiles(row, body.files) : [];
        if (typeof files === "string") return fail(files);
        note = text(body.note) || null;
        const views = Number(body.views) > 0 ? Math.round(Number(body.views)) : null;
        const spots = Number(body.spots) > 0 ? Math.round(Number(body.spots)) : null;
        Object.assign(patch, {
          status: "done",
          proof: { note, views, spots, files: files.map((f) => ({ path: f.path, name: f.name, type: f.type, size: f.size })) },
        });
        buyerEvent = "done";
        break;
      }
      case "cancel": {
        note = text(body.reason);
        if (!note) return fail("Say why the booking is cancelled.");
        const refunded = body.refunded === true;
        Object.assign(patch, { status: "cancelled", refunded, refund_ref: refunded ? text(body.refund_ref, 60) || null : null });
        buyerEvent = "cancelled";
        break;
      }
      case "note": {
        const line = text(body.text);
        if (!line) return fail("Write the note first.");
        const stamp = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
        Object.assign(patch, { internal_notes: [row.internal_notes, `${shortDate(stamp)}: ${line}`].filter(Boolean).join("\n") });
        break;
      }
    }

    const { data: updated, error } = await sb.from("storefront_bookings").update(patch)
      .eq("id", row.id).eq("status", row.status).eq("final_state", row.final_state).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return fail("This booking changed just now. Refresh and look again.", 409);
    const next = updated as BookingRow;
    await logEvent(sb, row.id, "house", act, act === "note" ? {} : { note, reference: patch.payment_ref ?? null, refunded: patch.refunded ?? null }, userId);

    if (buyerEvent) {
      const house = await houseById(sb, row.agency_id);
      if (house) await mailerFor(sb, next as unknown as MailBooking, house).buyer(buyerEvent, note);
    }
    return json(await getView(next));
  } catch (e) {
    console.error("storefront-booking-house:", body.action, e instanceof Error ? e.message : String(e));
    return fail("Something went wrong on our side. Try again in a moment.", 500);
  }
});
