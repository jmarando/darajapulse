import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import WhenStep from "@/components/storefront/booking/WhenStep";
import AdStep from "@/components/storefront/booking/AdStep";
import DetailsStep from "@/components/storefront/booking/DetailsStep";
import PayStep from "@/components/storefront/booking/PayStep";
import { payMethods, type Material, type PayMethod, type ProductionFees } from "@/lib/storefrontBooking";
import {
  buildCreateBody, checkoutTotals, emptyBuyer, emptyKit, functionError, initialSchedule, localToday, uploadAll,
  type BuyerState, type CheckoutLine, type KitState, type MaterialState,
} from "@/lib/storefrontCheckout";
import type { PlanLine } from "@/lib/storefrontPlan";
import { kes } from "@/lib/storefrontRequests";
import type { Listing } from "@/lib/storefront";

const STEPS = ["When should it run?", "Your ad", "Your details", "Pay"] as const;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Booking online, over the storefront: when it runs, the ad, who's booking, and paying. Prices come from the same code
 * the server charges with; the server recomputes them all. Pesapal sends the buyer to its own page; a bank transfer
 * goes straight to the booking page with the account details, or word that the house emails an invoice.
 */
export default function Checkout({ open, onClose, agencySlug, houseName, accent, lines, byId, production, today = localToday() }: {
  open: boolean; onClose: () => void; agencySlug: string; houseName: string; accent: string;
  lines: PlanLine[]; byId: Map<string, Listing>; production: ProductionFees; today?: string;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [sched, setSched] = useState<CheckoutLine[]>([]);
  const [materials, setMaterials] = useState<Partial<Record<Material, MaterialState>>>({});
  const [kit, setKit] = useState<KitState>(emptyKit);
  const [buyer, setBuyer] = useState<BuyerState>(emptyBuyer);
  const [ready, setReady] = useState<{ pesapal: boolean; bank: boolean; bank_details: boolean } | null>(null);
  const [fees, setFees] = useState<ProductionFees>(production);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");

  // Each opening starts from the plan as it is now, dated from today.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSched(initialSchedule(lines, byId, today));
    setError(null);
    supabase.functions.invoke("storefront-booking", { body: { action: "options", agency_slug: agencySlug } }).then(({ data }) => {
      const d = (data ?? {}) as { pesapal?: boolean; bank?: boolean; bank_details?: boolean; production?: ProductionFees };
      // An older function only says "bank" when the account is saved.
      setReady({ pesapal: Boolean(d.pesapal), bank: Boolean(d.bank), bank_details: d.bank_details ?? Boolean(d.bank) });
      if (d.production) setFees(d.production);
    });
    // Only on opening: later plan edits happen inside the checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const makes = useMemo(
    () => (Object.entries(materials) as [Material, MaterialState][]).filter(([, s]) => s.mode === "make").map(([m]) => m),
    [materials],
  );
  const { priced, errors, totals, needed } = useMemo(() => checkoutTotals(sched, byId, makes, fees, today), [sched, byId, makes, fees, today]);
  const quoteLines = useMemo(() => lines.filter((l) => !byId.get(l.id)?.bookable), [lines, byId]);
  const methods = useMemo(() => (ready ? payMethods(totals.total, ready) : []), [ready, totals.total]);
  useEffect(() => {
    if (methods.length && !methods.some((m) => m.method === method)) setMethod(methods[0].method);
  }, [methods, method]);

  const blocked = step === 0 ? Object.keys(errors).length > 0 || priced.length === 0
    : step === 2 ? !buyer.name.trim() || !EMAIL_RE.test(buyer.email.trim())
    : false;

  const submit = async () => {
    if (sendingRef.current || !method || !agreed) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const { body, files } = buildCreateBody({
        agencySlug, lines: sched, quoteLines, needed, materials, kit, method, website,
        buyer: { ...buyer, client: buyer.client.trim() },
      });
      const { data, error: createError } = await supabase.functions.invoke("storefront-booking", { body: { action: "create", ...body } });
      if (createError) throw new Error(await functionError(createError, "Your booking couldn't be saved. Try again."));
      const created = data as { token: string; ref: string; total: number; uploads: { slot: string; path: string; token: string }[] };
      if (!created?.token) throw new Error("Your booking couldn't be saved. Try again.");
      const uploaded = await uploadAll(supabase, created.uploads ?? [], files);
      if (uploaded.length) {
        await supabase.functions.invoke("storefront-booking", { body: { action: "files_added", token: created.token, files: uploaded } });
      }
      if (method === "pesapal") {
        const { data: paid } = await supabase.functions.invoke("storefront-booking", { body: { action: "pay", token: created.token } });
        const redirect = (paid as { redirect_url?: string } | null)?.redirect_url;
        if (redirect) {
          window.location.assign(redirect);
          return;
        }
      }
      navigate(`/booking/${created.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (!open) return null;
  const bankDetails = ready?.bank_details ?? true;
  const payLabel = method === "pesapal" ? `Pay ${kes(totals.total)}` : bankDetails ? "Book and get bank details" : "Book now";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={`Book with ${houseName}`}>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">Book online</div>
            <div className="truncate font-semibold">{houseName}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ol className="mx-auto flex max-w-3xl gap-1 px-4 pb-3 sm:px-6" aria-label="Steps">
          {STEPS.map((title, n) => (
            <li key={title} className="flex-1" aria-current={n === step ? "step" : undefined}>
              <div className="h-1 rounded-full" style={{ background: n <= step ? accent : "hsl(var(--muted))" }} />
              <div className={`mt-1 hidden truncate text-[11px] sm:block ${n === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{title}</div>
            </li>
          ))}
        </ol>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <h2 className="font-display text-2xl font-semibold">{STEPS[step]}</h2>
          {step === 0 && <WhenStep lines={sched} byId={byId} errors={errors} priced={priced} today={today} accent={accent} houseName={houseName} quoteLines={quoteLines} onChange={setSched} />}
          {step === 1 && <AdStep needed={needed} priced={priced} byId={byId} materials={materials} onMaterials={setMaterials} kit={kit} onKit={setKit} fees={fees} accent={accent} houseName={houseName} />}
          {step === 2 && <DetailsStep buyer={buyer} onChange={setBuyer} />}
          {step === 3 && (
            <PayStep priced={priced} totals={totals} quoteLines={quoteLines} byId={byId} houseName={houseName} accent={accent}
              methods={methods} method={method} onMethod={setMethod} bankDetails={bankDetails} agreed={agreed} onAgreed={setAgreed} error={error} />
          )}
          {/* Hidden from people; bots fill it in. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0">
            <label htmlFor="bk-website">Website</label>
            <input id="bk-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Total with VAT</div>
            <div className="text-lg font-semibold tabular-nums">{kes(totals.total)}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            {step > 0 && <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={sending}>Back</Button>}
            {step < 3 ? (
              <Button type="button" className="text-white" style={{ background: accent }} disabled={blocked} onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button type="button" className="text-white" style={{ background: accent }} disabled={sending || !agreed || !method} onClick={submit}>
                {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Booking…</> : payLabel}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
