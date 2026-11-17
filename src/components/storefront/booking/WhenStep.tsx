import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdPreview from "@/components/storefront/booking/AdPreview";
import {
  cpmViews, datesBetween, earliestStart, effectiveCpm, scheduleKind, shortDate, spreadSpots, TARGETS,
  type PricedLine, type Target,
} from "@/lib/storefrontBooking";
import type { CheckoutLine } from "@/lib/storefrontCheckout";
import { isCpm, unitOf, unitPrice, unitWord, type PlanLine } from "@/lib/storefrontPlan";
import { kes } from "@/lib/storefrontRequests";
import type { Listing } from "@/lib/storefront";

const toDate = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayCount = (start?: string | null, end?: string | null) => (start && end && end >= start ? datesBetween(start, end).length : 0);

/** Step 1: when each line runs, and for budget lines how much and to whom. Starts filled, so most buyers just check it. */
export default function WhenStep({ lines, byId, errors, priced, today, accent, houseName, quoteLines, onChange }: {
  lines: CheckoutLine[]; byId: Map<string, Listing>; errors: Record<string, string>; priced: PricedLine[]; today: string;
  accent: string; houseName: string; quoteLines: PlanLine[]; onChange: (lines: CheckoutLine[]) => void;
}) {
  const earliest = earliestStart(today);
  const set = (key: string, patch: Partial<CheckoutLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-muted-foreground">
        The earliest start is {shortDate(earliest)}, so {houseName} can check your ad and fit your times.
      </p>
      {lines.map((l) => {
        const item = byId.get(l.id);
        if (!item) return null;
        const p = priced.find((x) => x.id === l.id && x.option === (item.options?.length ? l.option : null));
        const kind = scheduleKind(unitOf(item, l.option), isCpm(item) ? "cpm" : "unit");
        const listens = /listen/i.test(unitOf(item, l.option) ?? "");
        const base = unitPrice(item, l.option) ?? 0;
        const days = dayCount(l.start, l.end);
        return (
          <section key={l.key} className="rounded-xl border border-border bg-card p-4" aria-label={item.title}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold leading-snug">{item.title}</h3>
                {l.option && <p className="text-xs text-muted-foreground">{l.option}</p>}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{p ? kes(p.total) : "—"}</span>
            </div>

            {kind === "flight" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`budget-${l.key}`}>Budget (KES)</Label>
                  <Input id={`budget-${l.key}`} type="number" inputMode="numeric" min={0} step={1000} value={l.budget ?? ""}
                    aria-label={`Budget: ${item.title}`} onChange={(e) => set(l.key, { budget: Number(e.target.value) })} />
                  {item.min_spend_kes ? <p className="text-xs text-muted-foreground">Minimum {kes(item.min_spend_kes)}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`target-${l.key}`}>Show it to</Label>
                  <select id={`target-${l.key}`} value={l.target ?? "kenya"} onChange={(e) => set(l.key, { target: e.target.value as Target })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}{t.key === "kenya" ? "" : " (+20%)"}</option>)}
                  </select>
                </div>
                <DateField id={`start-${l.key}`} label="Start" value={l.start} min={earliest} onChange={(v) => set(l.key, { start: v })} />
                <DateField id={`end-${l.key}`} label="End" value={l.end} min={l.start ?? earliest} onChange={(v) => set(l.key, { end: v })} />
                {p?.views ? (
                  <p className="text-sm sm:col-span-2">
                    About <b>{p.views.toLocaleString("en-KE")}</b> {listens ? "listens" : "views"}
                    {days ? <>, about {Math.round(p.views / days).toLocaleString("en-KE")} a day</> : null}
                    <span className="text-muted-foreground"> at {kes(effectiveCpm(base, l.target ?? "kenya"))} per 1,000</span>
                  </p>
                ) : l.budget ? (
                  <p className="text-sm text-muted-foreground sm:col-span-2">About {cpmViews(l.budget, effectiveCpm(base, l.target ?? "kenya")).toLocaleString("en-KE")} {listens ? "listens" : "views"}</p>
                ) : null}
              </div>
            )}

            {kind === "spread" && (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`qty-${l.key}`}>How many {unitWord(2, unitOf(item, l.option)) || "times"}</Label>
                    <Input id={`qty-${l.key}`} type="number" inputMode="numeric" min={1} max={999} value={l.qty}
                      aria-label={`How many: ${item.title}`}
                      onChange={(e) => set(l.key, { qty: Math.min(999, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                  </div>
                  <DateField id={`start-${l.key}`} label="First day" value={l.start} min={earliest} onChange={(v) => set(l.key, { start: v })} />
                  <DateField id={`end-${l.key}`} label="Last day" value={l.end} min={l.start ?? earliest} onChange={(v) => set(l.key, { end: v })} />
                </div>
                {days > 0 && (
                  <AdPreview item={item} option={l.option} accent={accent} schedule={spreadSpots(l.qty, datesBetween(l.start!, l.end!))} />
                )}
              </div>
            )}

            {kind === "dates" && (
              <div className="mt-3">
                <p className="text-sm">Pick the days{l.dates?.length ? `: ${l.dates.length} ${unitWord(l.dates.length, unitOf(item, l.option))}` : ""}</p>
                <Calendar mode="multiple" className="mt-1 w-fit rounded-md border border-border"
                  selected={(l.dates ?? []).map(toDate)} disabled={{ before: toDate(earliest) }} defaultMonth={toDate(l.dates?.[0] ?? earliest)}
                  onSelect={(ds) => set(l.key, { dates: (ds ?? []).map(toIso).sort() })} />
              </div>
            )}

            {kind === "start" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DateField id={`start-${l.key}`} label="Start" value={l.start} min={earliest} onChange={(v) => set(l.key, { start: v })} />
                <p className="self-end pb-2 text-sm text-muted-foreground">{l.qty > 1 ? `${l.qty} × ${unitOf(item, l.option) ?? "booking"}` : unitOf(item, l.option) ?? ""}</p>
              </div>
            )}

            {errors[l.key] && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{errors[l.key]}</p>}
          </section>
        );
      })}
      {quoteLines.length > 0 && (
        <p className="rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">
          {quoteLines.map((q) => byId.get(q.id)?.title).filter(Boolean).join(", ")}: these go to {houseName} as a quote request with your booking, and they reply with a price within a day.
        </p>
      )}
    </div>
  );
}

function DateField({ id, label, value, min, onChange }: { id: string; label: string; value?: string | null; min: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" min={min} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
