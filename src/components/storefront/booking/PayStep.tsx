import { lineWhat, type PayMethod, type PricedLine, type Totals } from "@/lib/storefrontBooking";
import { kes } from "@/lib/storefrontRequests";
import type { Listing } from "@/lib/storefront";
import type { PlanLine } from "@/lib/storefrontPlan";

const METHOD_LABEL: Record<PayMethod, { title: string; text: string }> = {
  pesapal: { title: "M-Pesa or card", text: "Pay now on Pesapal's secure page; your booking is confirmed straight away." },
  bank: { title: "PesaLink or M-Pesa paybill", text: "We show you the account and your booking number; send it from your bank app or M-Pesa." },
};

/** Step 4: the summary, the promise, and how to pay. The Pay button sits in the bar below. */
export default function PayStep({ priced, totals, quoteLines, byId, houseName, accent, methods, method, onMethod, agreed, onAgreed, error }: {
  priced: PricedLine[]; totals: Totals; quoteLines: PlanLine[]; byId: Map<string, Listing>; houseName: string; accent: string;
  methods: { method: PayMethod; note: string | null }[]; method: PayMethod | null; onMethod: (m: PayMethod) => void;
  agreed: boolean; onAgreed: (v: boolean) => void; error: string | null;
}) {
  return (
    <div className="mt-4 space-y-5">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {priced.map((p) => (
          <li key={`${p.id}-${p.option}`} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{p.title}</div>
              <div className="text-xs text-muted-foreground">{lineWhat(p)}</div>
            </div>
            <span className="shrink-0 text-sm tabular-nums">{kes(p.total)}</span>
          </li>
        ))}
      </ul>
      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Media</dt><dd className="tabular-nums">{kes(totals.media)}</dd></div>
        {totals.production > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Making the ad</dt><dd className="tabular-nums">{kes(totals.production)}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted-foreground">VAT (16%)</dt><dd className="tabular-nums">{kes(totals.vat)}</dd></div>
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{kes(totals.total)}</dd></div>
      </dl>
      {quoteLines.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Sent as a quote request: {quoteLines.map((q) => byId.get(q.id)?.title).filter(Boolean).join(", ")}.
        </p>
      )}

      <fieldset className="space-y-2" aria-label="How to pay">
        <legend className="text-sm font-semibold">How to pay</legend>
        {methods.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This booking can't be paid online. Go back and send it as a quote request instead, and {houseName} will invoice you.
          </p>
        )}
        {methods.map(({ method: m, note }) => (
          <label key={m} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${method === m ? "" : "border-border"}`} style={method === m ? { borderColor: accent } : undefined}>
            <input type="radio" name="pay-method" checked={method === m} onChange={() => onMethod(m)} className="mt-1" style={{ accentColor: accent }} />
            <span>
              <span className="block text-sm font-medium">{METHOD_LABEL[m].title}</span>
              <span className="block text-xs text-muted-foreground">{METHOD_LABEL[m].text}</span>
              {note && <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">{note}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => onAgreed(e.target.checked)} style={{ accentColor: accent }} />
        <span>{houseName} checks every ad before it runs. If they can't run your booking, you get your money back.</span>
      </label>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
