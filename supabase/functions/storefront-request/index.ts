// Takes a quote request from a media house's public storefront, stores it, and emails the media house and the requester.
// Replaces the page's direct insert into inventory_bookings, whose public rule could not read agencies and refused
// every request ("permission denied for table agencies"). The anon key reaches it; the checks below guard it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendAppEmail } from "../_shared/app-email.ts";
import { CANONICAL_APP_ORIGIN } from "../_shared/app-url.ts";
import { TEMPLATES } from "../_shared/transactional-email-templates/registry.ts";
import {
  bookingRow, checkRequest, emailData, houseRecipients, pickItems, RATE_LIMITS, type StorefrontItem,
} from "../_shared/storefront-request.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// A media house with no contact address and no admins yet (a storefront set up for a pitch) routes to the inbox
// that already takes the website's demo requests.
const PLATFORM_INBOX = TEMPLATES["demo-request"]?.to ?? "justin@glab.africa";

async function adminEmails(agencyId: string): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id")
    .eq("agency_id", agencyId).eq("role", "agency_admin").limit(5);
  const out: string[] = [];
  for (const r of roles ?? []) {
    const { data } = await supabase.auth.admin.getUserById((r as { user_id: string }).user_id);
    if (data?.user?.email) out.push(data.user.email);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "That request could not be read." }, 400); }

  const checked = checkRequest(body ?? {});
  if (!checked.ok) return checked.spam ? json({ ok: true }) : json({ error: checked.error }, 400);
  const r = checked.value;

  const { data: storefront, error: sfError } = await supabase.rpc("get_public_storefront", { _agency_slug: r.agencySlug });
  const agency = (storefront as { agency?: Record<string, string | null> } | null)?.agency;
  if (sfError || !agency?.id) return json({ error: "This storefront isn't available." }, 404);
  const items = pickItems(r.itemIds, ((storefront as { items?: StorefrontItem[] }).items ?? []));
  if (!items.length) return json({ error: "Those items are no longer offered. Refresh the page and pick again." }, 400);

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  const [byEmail, byHouse] = await Promise.all([
    supabase.from("inventory_bookings").select("id", { count: "exact", head: true })
      .eq("contact_email", r.contactEmail).gte("created_at", hourAgo),
    supabase.from("inventory_bookings").select("id", { count: "exact", head: true })
      .eq("agency_id", agency.id).gte("created_at", tenMinutesAgo),
  ]);
  if ((byEmail.count ?? 0) >= RATE_LIMITS.perEmailPerHour || (byHouse.count ?? 0) >= RATE_LIMITS.perStorefrontPer10Min) {
    return json({ error: "A lot of requests came in just now. Try again in a few minutes." }, 429);
  }

  const { data: booking, error } = await supabase.from("inventory_bookings")
    .insert(bookingRow(agency.id, r, items)).select("id").single();
  if (error || !booking) {
    console.error("storefront-request: insert failed", error?.code, error?.message);
    return json({ error: "Your request could not be saved. Try again." }, 500);
  }

  // Emails are best effort: the request is saved and shows in the media house's Requests tab either way.
  const houseName = agency.display_name || agency.name || "the media house";
  const data = emailData(houseName, r, items, `${CANONICAL_APP_ORIGIN}/app/inventory?tab=requests&agency=${encodeURIComponent(agency.slug ?? r.agencySlug)}`);
  const to = houseRecipients(agency.support_email, await adminEmails(agency.id), PLATFORM_INBOX);
  const results = await Promise.allSettled([
    ...to.map((email) => sendAppEmail({
      templateName: "storefront-request", recipientEmail: email, templateData: data,
      idempotencyKey: `storefront-request:${booking.id}:${email}`, replyTo: r.contactEmail,
    })),
    sendAppEmail({
      templateName: "storefront-request-received", recipientEmail: r.contactEmail, templateData: data,
      idempotencyKey: `storefront-request-received:${booking.id}`, replyTo: agency.support_email ?? undefined,
    }),
  ]);
  const failed = results.filter((x) => x.status === "rejected");
  if (failed.length) console.error("storefront-request: emails failed", failed.length, (failed[0] as PromiseRejectedResult).reason?.message);
  return json({ ok: true, booking_id: booking.id, emailed: results.length - failed.length });
});
