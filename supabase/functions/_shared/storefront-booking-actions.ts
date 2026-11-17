// Steps the booking functions share: the house's details and links, the booking's history, who the house's emails go
// to, and settling a Pesapal payment. The functions pass in the service-role client and a Mailer (from
// storefront-booking-mail.ts); this module sends no email itself, so the tests can run it.
import { pesapalPaid } from "./storefront-booking.ts";
import { houseRecipients } from "./storefront-request.ts";
import type { BuyerEvent, HouseEvent } from "./storefront-booking-status.ts";

/** The service-role client in the functions, a stand-in in the tests. supabase-js's builder types don't reach here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

export type House = {
  id: string; name: string; slug: string; subdomain: string | null; support_email: string | null;
  logo_url: string | null; primary_color: string | null;
};

const HOUSE_COLUMNS = "id, name, display_name, slug, subdomain, support_email, logo_url, primary_color";

/** A media house as the booking emails and pages name it. */
export async function houseById(sb: Db, id: string): Promise<House | null> {
  const { data } = await sb.from("agencies").select(HOUSE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id, name: data.display_name || data.name, slug: data.slug, subdomain: data.subdomain ?? null,
    support_email: data.support_email ?? null, logo_url: data.logo_url ?? null, primary_color: data.primary_color ?? null,
  };
}

/** The booking's private page, on the house's own address when it has one. */
export function bookingUrl(house: Pick<House, "subdomain">, token: string): string {
  const sub = (house.subdomain ?? "").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(sub) ? `https://${sub}.darajapulse.com/booking/${token}` : `https://darajapulse.com/booking/${token}`;
}

/** One step in the booking's history. Best effort: a missing history line never stops the step itself. */
export async function logEvent(
  sb: Db, bookingId: string, actor: "buyer" | "house" | "system", kind: string, detail: Record<string, unknown> = {}, userId: string | null = null,
): Promise<void> {
  const { error } = await sb.from("storefront_booking_events").insert({ booking_id: bookingId, actor, actor_user: userId, kind, detail });
  if (error) console.error("storefront booking: history not saved", kind, error.message);
}

/** Where the house's booking emails go: its contact address, else its admins, else the fallback inbox. */
export async function houseRecipientsFor(sb: Db, house: House, fallback: string): Promise<string[]> {
  if (house.support_email) return houseRecipients(house.support_email, [], fallback);
  const { data: roles } = await sb.from("user_roles").select("user_id").eq("agency_id", house.id).eq("role", "agency_admin").limit(5);
  const emails: string[] = [];
  for (const r of (roles ?? []) as { user_id: string }[]) {
    const { data } = await sb.auth.admin.getUserById(r.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return houseRecipients(null, emails, fallback);
}

/** Sends a booking's emails to the buyer or the house; best effort. */
export type Mailer = {
  buyer(event: BuyerEvent, note?: string | null): Promise<void>;
  house(event: HouseEvent, note?: string | null): Promise<void>;
};

export type PesapalStatus = {
  status_code?: number; amount?: number; currency?: string; confirmation_code?: string | null;
  payment_method?: string | null; payment_status_description?: string | null;
};

const STATUS_WORDS: Record<number, string> = { 0: "Invalid", 1: "Completed", 2: "Failed", 3: "Reversed" };

/**
 * Marks a booking paid when Pesapal's own status says so (completed, KES, the full amount), once: the update only moves
 * a booking that is still awaiting payment, so the callback and the buyer's return can't both settle it.
 */
export async function settleFromPesapal(
  sb: Db, booking: { id: string; status: string; total_kes: number }, status: PesapalStatus, mail: Mailer,
): Promise<"paid" | "already" | "not_paid"> {
  if (booking.status !== "awaiting_payment") return "already";
  const result = pesapalPaid(status, booking.total_kes);
  const described = status.payment_status_description
    ?? (typeof status.status_code === "number" ? STATUS_WORDS[status.status_code] ?? null : null);
  if (!result.paid) {
    if (described) {
      await sb.from("storefront_bookings").update({ pesapal_status: described })
        .eq("id", booking.id).eq("status", "awaiting_payment").select("id");
    }
    return "not_paid";
  }
  const { data, error } = await sb.from("storefront_bookings")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_ref: result.ref, pesapal_status: described ?? "Completed" })
    .eq("id", booking.id).eq("status", "awaiting_payment").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return "already";
  await logEvent(sb, booking.id, "system", "paid", { method: "pesapal", ref: result.ref, via: result.method });
  await mail.buyer("paid");
  await mail.house("paid");
  return "paid";
}
