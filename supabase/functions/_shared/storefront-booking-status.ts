// Where a booking stands, what happens next and who does it, what the house may do, and the emails' wording.
// Pure, shared by the booking functions, the booking page, the house's list and the tests.
import { shortDate, type PayMethod, type PriceModel, type ScheduleKind } from "./storefront-booking.ts";

/** As much of a booked line as its wording needs (a PricedLine, or one read back from a saved booking). */
export type LineLike = {
  option?: string | null; qty: number; unit?: string | null; model?: PriceModel | null; views?: number | null;
  kind?: ScheduleKind | null; start?: string | null; end?: string | null; dates?: string[] | null;
};

const pluralOf = (unit: string, n: number) => (n === 1 || /s$/.test(unit) ? unit : /(?:ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`);
const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
const range = (start: string, end: string) =>
  start === end ? shortDate(start) : sameMonth(start, end) ? `${Number(start.slice(8, 10))} to ${shortDate(end)}` : `${shortDate(start)} to ${shortDate(end)}`;

/** "6–9 AM · 10 spots · 24 to 28 Nov", "About 66,666 views · 24 Nov to 7 Dec", "2 days · 24 Nov, 25 Nov". */
export function lineWhat(l: LineLike): string {
  const parts: string[] = [];
  if (l.option) parts.push(l.option);
  const unit = (l.unit ?? "").trim();
  if (l.model === "cpm") {
    parts.push(`About ${Math.round(Number(l.views) || 0).toLocaleString("en-KE")} ${/listen/i.test(unit) ? "listens" : "views"}`);
  } else if (unit && !/^\d/.test(unit)) {
    parts.push(`${l.qty} ${pluralOf(unit, l.qty)}`);
  } else if (l.qty > 1) {
    parts.push(`× ${l.qty}`);
  }
  const dates = l.dates ?? [];
  if (l.kind === "dates" && dates.length) {
    parts.push(dates.length <= 3 ? dates.map(shortDate).join(", ") : range(dates[0], dates[dates.length - 1]));
  } else if ((l.kind === "spread" || l.kind === "flight") && l.start && l.end) {
    parts.push(range(l.start, l.end));
  } else if (l.start) {
    parts.push(`from ${shortDate(l.start)}`);
  }
  return parts.join(" · ");
}

export type BookingStatus = "awaiting_payment" | "paid" | "changes_requested" | "approved" | "live" | "done" | "cancelled";
/** The house-made ad: none yet, waiting for the buyer's look, approved, or a change asked. */
export type FinalState = "none" | "awaiting_buyer" | "approved" | "changes";

export type BookingState = {
  status: BookingStatus; final_state: FinalState; pay_method: PayMethod; payment_claimed_ref: string | null;
  makes: boolean; materials_ready: boolean; start_date: string; end_date: string | null;
};

type SavedMaterial = { mode?: string | null; script?: string | null; topic?: string | null; notes?: string | null } | null | undefined;
const FILE_MATERIALS = new Set(["audio", "banner", "print"]);

/** Whether the buyer has given everything the booking needs (or left it to the house to make). */
export function materialsReady(materials: Record<string, SavedMaterial>, files: { slot?: string | null }[]): boolean {
  return Object.entries(materials ?? {}).every(([m, v]) => {
    if (!v?.mode || v.mode === "later") return false;
    if (v.mode === "make") return true;
    const hasFile = files.some((f) => f.slot === m);
    if (FILE_MATERIALS.has(m)) return hasFile;
    if (m === "script") return Boolean(v.script?.trim());
    if (m === "interview") return Boolean(v.topic?.trim());
    return hasFile || Boolean(v.notes?.trim());
  });
}

/** A saved booking row, as much of it as the state needs. */
export type BookingRowLike = {
  status: BookingStatus; final_state: FinalState; pay_method: PayMethod; payment_claimed_ref?: string | null;
  materials?: Record<string, SavedMaterial> | null; files?: { slot?: string | null }[] | null; start_date: string; end_date?: string | null;
};

export function stateOf(row: BookingRowLike): BookingState {
  const materials = row.materials ?? {};
  return {
    status: row.status,
    final_state: row.final_state,
    pay_method: row.pay_method,
    payment_claimed_ref: row.payment_claimed_ref ?? null,
    makes: Object.values(materials).some((v) => v?.mode === "make"),
    materials_ready: materialsReady(materials, row.files ?? []),
    start_date: row.start_date,
    end_date: row.end_date ?? null,
  };
}

export type NextStep = { label: string; who: "house" | "buyer" | "none" };

/** What happens next on a booking, and whether the house or the buyer has to do it. */
export function nextStep(b: BookingState, today: string): NextStep {
  switch (b.status) {
    case "cancelled": return { label: "Cancelled", who: "none" };
    case "done": return { label: "Done", who: "none" };
    case "awaiting_payment":
      return b.pay_method === "bank" && b.payment_claimed_ref
        ? { label: "Confirm payment", who: "house" }
        : { label: "Waiting for payment", who: "buyer" };
    case "changes_requested": return { label: "Waiting for changes", who: "buyer" };
    case "paid":
      if (!b.materials_ready) return { label: "Waiting for the ad", who: "buyer" };
      if (b.final_state === "awaiting_buyer") return { label: "Waiting for approval", who: "buyer" };
      if (b.makes && b.final_state !== "approved") return { label: "Make the ad", who: "house" };
      return { label: "Check the ad", who: "house" };
    case "approved":
      return today < b.start_date ? { label: `Starts ${shortDate(b.start_date)}`, who: "none" } : { label: "Mark live", who: "house" };
    case "live":
      if (b.end_date && today > b.end_date) return { label: "Send proof", who: "house" };
      return { label: b.end_date ? `Running until ${shortDate(b.end_date)}` : "Running", who: "none" };
  }
}

export const TIMELINE = ["Booked", "Paid", "Ad ready", "Approved and scheduled", "Live", "Done"] as const;

/** How far along the timeline a booking is; -1 when cancelled. */
export function timelineIndex(b: BookingState): number {
  switch (b.status) {
    case "cancelled": return -1;
    case "awaiting_payment": return 0;
    case "paid":
    case "changes_requested":
      return b.materials_ready && (!b.makes || b.final_state === "approved") ? 2 : 1;
    case "approved": return 3;
    case "live": return 4;
    case "done": return 5;
  }
}

export type HouseAction = "mark_paid" | "request_changes" | "send_final" | "approve" | "mark_live" | "mark_done" | "cancel" | "note";

/** Whether the house may take this step now. */
export function houseCan(b: BookingState, action: HouseAction): boolean {
  switch (action) {
    case "mark_paid": return b.status === "awaiting_payment";
    case "request_changes":
    case "send_final": return b.status === "paid" || b.status === "changes_requested";
    case "approve": return b.status === "paid" && b.materials_ready && (!b.makes || b.final_state === "approved");
    case "mark_live": return b.status === "approved";
    case "mark_done": return b.status === "approved" || b.status === "live";
    case "cancel": return b.status !== "done" && b.status !== "cancelled";
    case "note": return true;
  }
}

/** Whether a signed-in user may see and work a house's booking: super admins, or staff with access to that house. */
export const houseScope = (caller: { isSuperAdmin: boolean }, hasAccess: boolean): boolean => caller.isSuperAdmin || hasAccess;

// ---------------------------------------------------------------- the emails' wording

export type BuyerEvent = "created_bank" | "paid" | "changes_requested" | "final_ready" | "approved" | "live" | "done" | "cancelled";
export type HouseEvent = "new_booking" | "payment_claimed" | "paid" | "files_added" | "final_approved" | "final_changes";
export type CopyData = { house: string; ref: string; total: string; buyer: string; note?: string | null; start?: string | null };
export type Copy = { subject: string; heading: string; body: string; button: string };

const said = (who: string, note?: string | null) => (note?.trim() ? ` ${who} says: "${note.trim()}"` : "");

export function buyerCopy(event: BuyerEvent, d: CopyData): Copy {
  const button = "Open your booking";
  const note = said(d.house, d.note);
  switch (event) {
    case "created_bank": return {
      subject: `Booking ${d.ref}: how to pay ${d.total}`, heading: "Your booking is in", button,
      body: `Pay ${d.total} by PesaLink from your bank app, or by M-Pesa, to the account below, with ${d.ref} as the reason. ${d.house} confirms your booking once the money lands.`,
    };
    case "paid": return {
      subject: `Payment received for booking ${d.ref}`, heading: "Payment received", button,
      body: `${d.house} has your payment of ${d.total} and is checking your ad and times. You'll hear back within a working day.`,
    };
    case "changes_requested": return {
      subject: `${d.house} asks for a change to your ad (${d.ref})`, heading: "A change to your ad", button,
      body: `${d.house} needs a change before your ad can run.${note} Open your booking to send a new version.`,
    };
    case "final_ready": return {
      subject: `Your ad is ready to check (${d.ref})`, heading: "Your ad is ready", button,
      body: `${d.house} has made your ad. Open your booking to approve it or ask for a change.${note}`,
    };
    case "approved": return {
      subject: `Booking ${d.ref} is approved and scheduled`, heading: "Approved and scheduled", button,
      body: `Your ad is approved${d.start ? ` and starts on ${d.start}` : ""}.${note}`,
    };
    case "live": return {
      subject: `Booking ${d.ref} is live`, heading: "You're live", button,
      body: `Your booking with ${d.house} is running now.${note}`,
    };
    case "done": return {
      subject: `Booking ${d.ref} is done: here's the proof`, heading: "Done", button,
      body: `Your booking has finished. The proof is on your booking page.${note}`,
    };
    case "cancelled": return {
      subject: `Booking ${d.ref} is cancelled`, heading: "Booking cancelled", button,
      body: `${d.house} has cancelled booking ${d.ref}.${note}`,
    };
  }
}

export function houseCopy(event: HouseEvent, d: CopyData): Copy {
  const button = "Open the booking";
  const note = said(d.buyer, d.note);
  switch (event) {
    case "new_booking": return {
      subject: `New booking ${d.ref} from ${d.buyer}: ${d.total}`, heading: "A new booking", button,
      body: `${d.buyer} booked ${d.total} and is paying by bank transfer. Confirm it in Bookings once the money lands.`,
    };
    case "payment_claimed": return {
      subject: `${d.buyer} says they've paid booking ${d.ref}`, heading: "Check for a payment", button,
      body: `${d.buyer} says they've sent ${d.total}.${note} Mark it as received in Bookings once you see it.`,
    };
    case "paid": return {
      subject: `Booking ${d.ref} is paid: check the ad`, heading: "Paid", button,
      body: `${d.buyer} paid ${d.total}. Check the ad and the times, then approve and schedule it.`,
    };
    case "files_added": return {
      subject: `New ad files for booking ${d.ref}`, heading: "New files", button,
      body: `${d.buyer} added files to booking ${d.ref}.`,
    };
    case "final_approved": return {
      subject: `${d.buyer} approved the ad for ${d.ref}`, heading: "Ad approved", button,
      body: `${d.buyer} approved the ad you made. You can approve and schedule the booking now.`,
    };
    case "final_changes": return {
      subject: `${d.buyer} asked for a change to the ad for ${d.ref}`, heading: "A change asked", button,
      body: `${d.buyer} wants a change to the ad you made.${note}`,
    };
  }
}
