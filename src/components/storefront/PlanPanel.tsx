import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ListingCover from "@/components/storefront/ListingCover";
import type { Listing } from "@/lib/storefront";
import { defaultBudget, isCpm, lineKey, MAX_QTY, planTotals, unitOf, unitPrice, unitWord, type PlanLine } from "@/lib/storefrontPlan";
import { cpmViews } from "@/lib/storefrontBooking";
import { kes } from "@/lib/storefrontRequests";

/** What changes a plan's lines, each addressed by its lineKey. */
export type PlanEdits = {
  onQty: (key: string, qty: number) => void;
  onOption: (key: string, option: string) => void;
  onRemove: (key: string) => void;
  /** A CPM line's budget. */
  onBudget: (key: string, budget: number) => void;
};

type LinesProps = { lines: PlanLine[]; byId: Map<string, Listing>; showPrices: boolean; canBook?: boolean } & PlanEdits;

/** The plan's lines: each pick with its choice (changeable), how many, and what it comes to at the shown prices. */
export function PlanLines({ lines, byId, showPrices, canBook = false, onQty, onOption, onRemove, onBudget }: LinesProps) {
  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => {
        const item = byId.get(line.id);
        if (!item) return null;
        const key = lineKey(line.id, line.option);
        const price = unitPrice(item, line.option);
        const unit = unitOf(item, line.option);
        const options = item.options ?? [];
        const what = `${item.title}${line.option ? `, ${line.option}` : ""}`;
        return (
          <li key={key} className="flex gap-3 py-3">
            <ListingCover item={item} className="h-10 w-10 shrink-0 rounded-md" badge={false} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
                  {item.title}
                  {canBook && !item.bookable && (
                    <span className="ml-1.5 rounded bg-secondary px-1.5 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quote</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${what}`}
                  onClick={() => onRemove(key)}
                  className="-mr-1 -mt-0.5 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              {options.length > 1 ? (
                <select
                  aria-label={`Choice for ${item.title}`}
                  value={line.option ?? ""}
                  onChange={(e) => onOption(key, e.target.value)}
                  className="mt-1 h-8 w-full truncate rounded-md border border-input bg-background px-2 text-xs"
                >
                  {options.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}{showPrices && typeof o.price_kes === "number" && o.price_kes > 0 ? ` (${kes(o.price_kes)})` : ""}
                    </option>
                  ))}
                </select>
              ) : (line.option || item.deliverable_type) ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{line.option ?? item.deliverable_type}</div>
              ) : null}
              {isCpm(item) ? (
                <div className="mt-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Budget
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1000}
                      value={line.budget ?? defaultBudget(item)}
                      aria-label={`Budget: ${what}`}
                      onChange={(e) => onBudget(key, Number(e.target.value))}
                      className="h-7 w-24 rounded-md border border-input bg-transparent px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  {price !== null && (
                    <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                      about {cpmViews(line.budget ?? defaultBudget(item), price).toLocaleString("en-KE")} {/listen/i.test(unit ?? "") ? "listens" : "views"}
                    </span>
                  )}
                </div>
              ) : (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center rounded-md border border-input">
                    <button type="button" aria-label={`One fewer: ${what}`} disabled={line.qty <= 1} onClick={() => onQty(key, line.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-l-md hover:bg-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Minus className="h-3 w-3" aria-hidden />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_QTY}
                      value={line.qty}
                      aria-label={`How many: ${what}`}
                      onChange={(e) => onQty(key, Number(e.target.value))}
                      className="h-7 w-11 border-x border-input bg-transparent text-center text-xs tabular-nums [appearance:textfield] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button type="button" aria-label={`One more: ${what}`} disabled={line.qty >= MAX_QTY} onClick={() => onQty(key, line.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-r-md hover:bg-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Plus className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">{unitWord(line.qty, unit)}</span>
                </div>
                {showPrices && (
                  <span className={`whitespace-nowrap text-[13px] tabular-nums ${price === null ? "text-muted-foreground" : "font-medium"}`}>
                    {price === null ? "On request" : kes(price * line.qty)}
                  </span>
                )}
              </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The plan's total at the house's prices and what is left to quote; without prices, what happens next. */
export function PlanTotal({ lines, byId, showPrices, houseName }: { lines: PlanLine[]; byId: Map<string, Listing>; showPrices: boolean; houseName: string }) {
  if (!showPrices) return <p className="text-xs text-muted-foreground">{houseName} replies with prices and dates within a day.</p>;
  const t = planTotals(lines, byId);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Rate-card total</span>
        <span className="text-xl font-semibold tabular-nums">{t.priced ? kes(t.total) : "On request"}</span>
      </div>
      {t.priced > 0 && t.onRequest > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Plus {t.onRequest} item{t.onRequest === 1 ? "" : "s"} priced on request.</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{houseName} confirms the final price and dates.</p>
    </div>
  );
}

/** The plan beside the storefront on wide screens: always in view, so every pick and the total show as they change. */
export function PlanPanel({ lines, byId, showPrices, houseName, accent, onRequest, canBook = false, onBook, ...edits }: LinesProps & {
  houseName: string; accent: string; onRequest: () => void; onBook?: () => void;
}) {
  return (
    <div className="flex max-h-[calc(100vh-2rem)] flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Your plan</h2>
        {lines.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{lines.length} pick{lines.length === 1 ? "" : "s"}</span>}
      </div>
      {lines.length === 0 ? (
        <p className="px-4 py-5 text-sm leading-relaxed text-muted-foreground">
          {canBook
            ? "Nothing picked yet. Tap a price on the rate card or press Add on anything you want, then book and pay online or ask for a quote."
            : "Nothing picked yet. Tap a price on the rate card or press Add on anything you want. Nothing is booked until you send a request."}
        </p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <PlanLines lines={lines} byId={byId} showPrices={showPrices} canBook={canBook} {...edits} />
          </div>
          <div className="space-y-3 border-t border-border p-4">
            <PlanTotal lines={lines} byId={byId} showPrices={showPrices} houseName={houseName} />
            {canBook && onBook ? (
              <div className="space-y-2">
                <Button type="button" className="w-full text-white" style={{ background: accent }} onClick={onBook}>Book now</Button>
                <Button type="button" variant="outline" className="w-full" onClick={onRequest}>Request a quote</Button>
              </div>
            ) : (
              <Button type="button" className="w-full text-white" style={{ background: accent }} onClick={onRequest}>Request a quote</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
