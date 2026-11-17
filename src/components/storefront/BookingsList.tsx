import { useMemo, useState } from "react";
import { Inbox, Mail, MessageCircle, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import BookingPanel from "@/components/storefront/BookingPanel";
import { RequestPanel } from "@/components/storefront/RequestsBoard";
import type { BookingRow } from "@/lib/storefrontBooking";
import { listRows, tiles, type ListRow } from "@/lib/storefrontBookings";
import { ago, kes, whatsappUrl, type StorefrontRequest } from "@/lib/storefrontRequests";

const FILTERS = ["All", "Bookings", "Quote requests", "Done", "Not paid"] as const;
type Filter = typeof FILTERS[number];

const PILL: Record<ListRow["next"]["who"], string> = {
  house: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  buyer: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  none: "bg-secondary text-muted-foreground",
};

/** Bookings and quote requests as one plain list whose rows open; what the house must do first. */
export default function BookingsList({ bookings, requests, today, onChanged }: {
  bookings: BookingRow[]; requests: StorefrontRequest[]; today: string; onChanged: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [open, setOpen] = useState<{ type: ListRow["type"]; id: string } | null>(null);
  const rows = useMemo(() => listRows(bookings, requests, today), [bookings, requests, today]);
  const t = tiles(rows, bookings, today);
  const shown = rows.filter((r) => {
    switch (filter) {
      case "Bookings": return r.type === "booking" && !r.done && !r.abandoned;
      case "Quote requests": return r.type === "request" && !r.done;
      case "Done": return r.done;
      case "Not paid": return r.abandoned;
      default: return !r.done && !r.abandoned;
    }
  });

  if (!rows.length) {
    return (
      <Card className="p-16 text-center text-muted-foreground">
        <Inbox className="mx-auto h-10 w-10 opacity-50" aria-hidden />
        <p className="mt-3">No bookings or requests yet. Share your storefront link to get the first one.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "To do", value: String(t.todo) },
          { label: "Waiting on the buyer", value: String(t.waiting) },
          { label: "Live now", value: String(t.live) },
          { label: "Paid this month", value: t.paidThisMonth ? kes(t.paidThisMonth) : "—" },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="text-[12px] text-muted-foreground">{x.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{x.value}</div>
          </div>
        ))}
      </div>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === f ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing here.</p>}
        <ul className="divide-y divide-border">
          {shown.map((r) => {
            const wa = whatsappUrl(r.phone);
            return (
              <li key={`${r.type}-${r.id}`} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setOpen({ type: r.type, id: r.id })}
                  className="grid min-w-0 flex-1 gap-x-4 gap-y-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{r.who}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[r.sub, r.type === "booking" ? r.ref : "Quote request"].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{r.what}</span>
                  <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[r.next.who]}`}>{r.next.label}</span>
                  <span className="text-right text-xs tabular-nums">
                    <span className="block font-medium">{r.amount ? kes(r.amount) : "—"}</span>
                    <span className="block text-muted-foreground">{ago(r.created_at)}</span>
                  </span>
                </button>
                <span className="hidden shrink-0 gap-1 sm:flex">
                  {r.phone && <a href={`tel:${r.phone.replace(/\s/g, "")}`} aria-label={`Call ${r.who}`} className="rounded-full border border-border p-2 hover:bg-secondary"><Phone className="h-3.5 w-3.5" aria-hidden /></a>}
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${r.who}`} className="rounded-full border border-border p-2 hover:bg-secondary"><MessageCircle className="h-3.5 w-3.5" aria-hidden /></a>}
                  <a href={`mailto:${r.email}`} aria-label={`Email ${r.who}`} className="rounded-full border border-border p-2 hover:bg-secondary"><Mail className="h-3.5 w-3.5" aria-hidden /></a>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <BookingPanel id={open?.type === "booking" ? open.id : null} today={today} onClose={() => setOpen(null)} onChanged={onChanged} />
      <RequestPanel request={open?.type === "request" ? requests.find((r) => r.id === open.id) ?? null : null} onClose={() => setOpen(null)} onChanged={onChanged} />
    </div>
  );
}
