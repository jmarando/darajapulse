// The media house's list: bookings and quote requests as one plain list, what each needs next and from whom, and the
// tiles above it.
import { nextStep, stateOf, type BookingRow, type NextStep } from "@/lib/storefrontBooking";
import { savedEstimate } from "@/lib/storefrontPlan";
import type { RequestStage, StorefrontRequest } from "@/lib/storefrontRequests";

export type ListRow = {
  id: string; type: "booking" | "request"; who: string; sub: string | null; what: string; amount: number | null;
  created_at: string; next: NextStep; phone: string | null; email: string; done: boolean; abandoned: boolean; ref: string | null;
};

const REQUEST_NEXT: Record<RequestStage, NextStep> = {
  new: { label: "Reply with a quote", who: "house" },
  reviewing: { label: "Checking", who: "house" },
  quoted: { label: "Waiting on the client", who: "buyer" },
  won: { label: "Won", who: "none" },
  lost: { label: "Lost", who: "none" },
};

const DAY_MS = 86_400_000;
const itemsText = (titles: (string | undefined)[]) =>
  `${titles.length} item${titles.length === 1 ? "" : "s"}${titles[0] ? `: ${titles[0]}` : ""}`;
const rank = (r: ListRow) => (r.done ? 2 : r.next.who === "house" ? 0 : 1);

/** Bookings and requests together: what the house must do first, then the newest. */
export function listRows(bookings: BookingRow[], requests: StorefrontRequest[], today: string, now: number = Date.now()): ListRow[] {
  const rows: ListRow[] = [
    ...bookings.map((b): ListRow => ({
      id: b.id, type: "booking", who: b.company || b.contact_name, sub: b.company ? b.contact_name : null,
      what: itemsText((b.lines ?? []).map((l) => (l as { title?: string }).title)), amount: b.total_kes, created_at: b.created_at,
      next: nextStep(stateOf(b), today), phone: b.contact_phone, email: b.contact_email, ref: b.ref,
      done: b.status === "done" || b.status === "cancelled",
      abandoned: b.status === "awaiting_payment" && b.pay_method === "pesapal" && now - Date.parse(b.created_at) > DAY_MS,
    })),
    ...requests.map((r): ListRow => ({
      id: r.id, type: "request", who: r.company || r.contact_name, sub: r.company ? r.contact_name : null,
      what: itemsText((r.items ?? []).map((i) => i.title)), amount: r.budget_kes ?? savedEstimate(r.items ?? [])?.total ?? null,
      created_at: r.created_at, next: REQUEST_NEXT[r.status] ?? REQUEST_NEXT.new, phone: r.contact_phone, email: r.contact_email,
      ref: null, done: r.status === "won" || r.status === "lost", abandoned: false,
    })),
  ];
  return rows.sort((a, b) => rank(a) - rank(b) || Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** The tiles: waiting on the house, waiting on buyers, running now, and what's been paid this month. */
export function tiles(rows: ListRow[], bookings: BookingRow[], today: string) {
  const month = today.slice(0, 7);
  return {
    todo: rows.filter((r) => !r.done && !r.abandoned && r.next.who === "house").length,
    waiting: rows.filter((r) => !r.done && !r.abandoned && r.next.who === "buyer").length,
    live: bookings.filter((b) => b.status === "live").length,
    paidThisMonth: bookings
      .filter((b) => b.paid_at && b.paid_at.slice(0, 7) === month && b.status !== "cancelled")
      .reduce((sum, b) => sum + b.total_kes, 0),
  };
}
