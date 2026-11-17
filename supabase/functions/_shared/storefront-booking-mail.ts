// A booking's emails, through the app's mailer. Kept apart from storefront-booking-actions.ts because app-email pulls in
// the React email templates, which only Deno loads; the actions take the Mailer this builds.
import { sendAppEmail } from "./app-email.ts";
import { CANONICAL_APP_ORIGIN } from "./app-url.ts";
import { TEMPLATES } from "./transactional-email-templates/registry.ts";
import { shortDate } from "./storefront-booking.ts";
import { buyerCopy, houseCopy, lineWhat, type BuyerEvent, type HouseEvent, type LineLike } from "./storefront-booking-status.ts";
import { bookingUrl, houseRecipientsFor, type Db, type House, type Mailer } from "./storefront-booking-actions.ts";

// A house with no contact address and no admins yet routes to the inbox that already takes demo requests.
const PLATFORM_INBOX = TEMPLATES["demo-request"]?.to ?? "justin@glab.africa";

export type MailBooking = {
  id: string; ref: string; token: string; contact_name: string; contact_email: string; company?: string | null;
  media_kes: number; production_kes: number; vat_kes: number; total_kes: number; start_date: string;
  lines: (LineLike & { title: string; total: number })[];
};

export type BankDetails = {
  account_name: string | null; bank_name: string | null; bank_branch: string | null; account_number: string | null;
  paybill: string | null; paybill_account: string | null;
};

const kes = (n: number) => `KES ${Math.round(Number(n) || 0).toLocaleString("en-KE")}`;

// Events that can happen more than once on a booking get a fresh key each time; the rest are sent once.
const REPEATS = new Set<string>(["created_bank", "changes_requested", "final_ready", "payment_claimed", "files_added", "final_changes"]);

/** The emails for one booking: the buyer's at their address, the house's to its contact address or admins. */
export function mailerFor(sb: Db, booking: MailBooking, house: House, bank: BankDetails | null = null): Mailer {
  const base = (copy: unknown) => ({
    copy,
    house: { name: house.name, logo_url: house.logo_url, primary_color: house.primary_color },
    ref: booking.ref,
    lines: (booking.lines ?? []).map((l) => ({ title: l.title, what: lineWhat(l), amount: kes(l.total) })),
    totals: { media: kes(booking.media_kes), production: booking.production_kes ? kes(booking.production_kes) : null, vat: kes(booking.vat_kes), total: kes(booking.total_kes) },
  });
  const copyData = (note?: string | null) => ({
    house: house.name, ref: booking.ref, total: kes(booking.total_kes), buyer: booking.company || booking.contact_name,
    note: note ?? null, start: booking.start_date ? shortDate(booking.start_date) : null,
  });
  const send = async (templateName: string, to: string, event: string, templateData: Record<string, unknown>) => {
    const key = `storefront-booking:${event}:${booking.id}:${to}${REPEATS.has(event) ? `:${Date.now()}` : ""}`;
    try {
      await sendAppEmail({ templateName, recipientEmail: to, templateData, idempotencyKey: key });
    } catch (e) {
      console.error("storefront booking email not sent", templateName, event, e instanceof Error ? e.message : String(e));
    }
  };
  return {
    async buyer(event: BuyerEvent, note?: string | null) {
      const data = {
        ...base(buyerCopy(event, copyData(note))),
        url: bookingUrl(house, booking.token),
        bank: event === "created_bank" && bank ? { ...bank, reference: booking.ref } : null,
      };
      await send("storefront-booking-buyer", booking.contact_email, event, data);
    },
    async house(event: HouseEvent, note?: string | null) {
      const data = {
        ...base(houseCopy(event, copyData(note))),
        url: `${CANONICAL_APP_ORIGIN}/app/inventory?tab=requests&agency=${encodeURIComponent(house.slug)}`,
        bank: null,
      };
      for (const to of await houseRecipientsFor(sb, house, PLATFORM_INBOX)) await send("storefront-booking-house", to, event, data);
    },
  };
}
