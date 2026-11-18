import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, Download, Loader2, Printer } from "lucide-react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AdPreview from "@/components/storefront/booking/AdPreview";
import {
  datesBetween, lineWhat, shortDate, spreadSpots, TIMELINE, type LineLike, type Material, type PublicBookingView,
} from "@/lib/storefrontBooking";
import { functionError, uploadAll } from "@/lib/storefrontCheckout";
import { kes } from "@/lib/storefrontRequests";
import type { Listing } from "@/lib/storefront";

type SavedLine = LineLike & { id: string; title: string; total: number; adFormat?: string | null };

const MATERIAL_LABEL: Record<string, string> = {
  audio: "Audio advert", script: "Words read on air", banner: "Banners", print: "Print ad",
  social: "Social post", article: "Sponsored story", interview: "Interview", brief: "Package brief",
};
const FILE_MATERIALS = new Set(["audio", "banner", "print", "social", "article"]);
const dateTime = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A buyer's private booking page: where it stands, how to pay, their ad, the house's finished ad, proof and a receipt. */
export default function PublicBooking() {
  const { token = "" } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<PublicBookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}, fallback = "That didn't work. Try again.") => {
    const { data, error: e } = await supabase.functions.invoke("storefront-booking", { body: { action, token, ...extra } });
    if (e) throw new Error(await functionError(e, fallback));
    return data;
  }, [token]);

  useEffect(() => {
    // Back from Pesapal: ask it for the payment's status, then drop its parameters from the address.
    const returning = new URLSearchParams(search).has("OrderTrackingId");
    call(returning ? "verify" : "get", {}, "This booking link isn't valid.")
      .then((d) => setView(d as PublicBookingView))
      .catch((e: Error) => setError(e.message));
    if (returning) navigate(`/booking/${token}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const act = async (label: string, action: string, extra: Record<string, unknown> = {}, done?: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const d = await call(action, extra);
      if (action === "pay" && (d as { redirect_url?: string })?.redirect_url) {
        window.location.assign((d as { redirect_url: string }).redirect_url);
        return;
      }
      setView(d as PublicBookingView);
      if (done) setNotice(done);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="flex min-h-screen items-center justify-center px-6 text-center text-muted-foreground">{error}</div>;
  if (!view) return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Loading your booking…</div>;

  const accent = view.house.primary_color || "hsl(var(--primary))";
  const lines = view.lines as unknown as SavedLine[];
  const paid = view.timeline >= 1;
  const unpaid = view.status === "awaiting_payment";
  const kit = {
    logoUrl: view.files.find((f) => f.slot === "kit_logo")?.url ?? null,
    photoUrls: view.files.filter((f) => f.slot === "kit_photo").map((f) => f.url),
    headline: String(view.kit.headline ?? ""), message: String(view.kit.message ?? ""), cta: String(view.kit.cta ?? ""), colour: String(view.kit.colour ?? ""),
  };
  const missing = (Object.entries(view.materials) as [Material, { mode?: string }][]).filter(([m, s]) =>
    FILE_MATERIALS.has(m) && (s.mode === "later" || view.status === "changes_requested"));

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <header className="border-b border-border bg-card print:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          {view.house.logo_url && <img src={view.house.logo_url} alt={view.house.name} className="h-10 w-auto max-w-[150px] rounded object-contain" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">Booking with {view.house.name}</div>
            <div className="font-display text-xl font-semibold">{view.ref}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-semibold tabular-nums">{kes(view.totals.total)}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-2xl border border-border bg-card p-4 print:hidden" aria-label="Where it stands">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: accent }}>
              {view.status === "cancelled" ? (view.refunded ? "Cancelled and refunded" : "Cancelled") : view.next.label}
            </span>
            {view.house.support_email && <a className="text-sm text-muted-foreground underline-offset-4 hover:underline" href={`mailto:${view.house.support_email}`}>{view.house.support_email}</a>}
          </div>
          <ol className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TIMELINE.map((label, n) => {
              const reached = view.timeline >= n;
              return (
                <li key={label} data-reached={reached ? "true" : "false"} className="text-center">
                  <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs"
                    style={reached ? { background: accent, borderColor: accent, color: "#fff" } : { borderColor: "hsl(var(--border))" }}>
                    {reached ? <Check className="h-3.5 w-3.5" aria-hidden /> : n + 1}
                  </div>
                  <span className={`mt-1 block text-[11px] leading-tight ${reached ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
                </li>
              );
            })}
          </ol>
          {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
        </section>

        {unpaid && (
          <section className="rounded-2xl border border-border bg-card p-4 print:hidden" aria-labelledby="pay-title">
            <h2 id="pay-title" className="text-lg font-semibold">Pay {kes(view.totals.total)}</h2>
            {view.pesapal_status && /fail|invalid|reversed/i.test(view.pesapal_status) && (
              <p className="mt-1 text-sm text-destructive">Your last payment didn't go through. Try again, or pay by bank.</p>
            )}
            {view.bank && (
              <div className="mt-3 space-y-3">
                <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-muted/60 p-3 text-sm sm:grid-cols-[auto_1fr]">
                  {view.bank.account_number && <>
                    <dt className="text-muted-foreground">Pay to</dt><dd className="font-medium">{view.bank.account_name}</dd>
                    <dt className="text-muted-foreground">Bank</dt><dd>{view.bank.bank_name}{view.bank.bank_branch ? `, ${view.bank.bank_branch}` : ""}</dd>
                    <dt className="text-muted-foreground">Account</dt><dd className="font-mono">{view.bank.account_number}</dd>
                  </>}
                  {view.bank.paybill && <>
                    <dt className="text-muted-foreground">M-Pesa paybill</dt><dd className="font-mono">{view.bank.paybill}</dd>
                    <dt className="text-muted-foreground">Account number</dt><dd className="font-mono">{view.bank.paybill_account}</dd>
                  </>}
                  <dt className="text-muted-foreground">Reason or reference</dt><dd className="font-mono font-semibold">{view.bank.reference}</dd>
                </dl>
                <p className="text-sm text-muted-foreground">Send it by PesaLink from your bank app (it lands within minutes), or by M-Pesa. Put {view.ref} as the reason.</p>
                <ClaimPayment view={view} busy={busy !== null} onClaim={(reference) => act("claim", "claim", { reference }, `Thanks. ${view.house.name} will confirm once the money lands.`)} />
              </div>
            )}
            {view.invoice_pending && (
              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  {view.house.name} will email you an invoice with how to pay, usually within a working day. Pay it by PesaLink from your bank app or by M-Pesa, with {view.ref} as the reason.
                </p>
                <ClaimPayment view={view} busy={busy !== null} onClaim={(reference) => act("claim", "claim", { reference }, `Thanks. ${view.house.name} will confirm once the money lands.`)} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {view.ready.pesapal && (
                <Button type="button" className="text-white" style={{ background: accent }} disabled={busy !== null} onClick={() => act("pay", "pay")}>
                  {busy === "pay" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Pay with M-Pesa or card
                </Button>
              )}
              {view.ready.bank && view.pay_method === "pesapal" && (
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => act("bank", "use_bank")}>Pay by bank instead</Button>
              )}
            </div>
          </section>
        )}

        {view.final_state === "awaiting_buyer" && (
          <section className="rounded-2xl border-2 bg-card p-4 print:hidden" style={{ borderColor: accent }} aria-labelledby="final-title">
            <h2 id="final-title" className="text-lg font-semibold">Your ad is ready to check</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {view.final_files.map((f) => <li key={f.url}><a className="inline-flex items-center gap-1.5 underline underline-offset-4" href={f.url} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" aria-hidden />{f.name}</a></li>)}
            </ul>
            <FinalAnswer busy={busy !== null} accent={accent}
              onApprove={() => act("final", "final_decision", { decision: "approve" }, "Thanks. The ad is approved.")}
              onChange={(note) => act("final", "final_decision", { decision: "change", note }, `Sent to ${view.house.name}.`)} />
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="booked-title">
          <h2 id="booked-title" className="text-lg font-semibold">What you booked</h2>
          <ul className="mt-2 divide-y divide-border">
            {lines.map((l, n) => {
              const item: Listing = { id: l.id, kind: "ad_slot", title: l.title, ad_format: l.adFormat ?? null };
              const schedule = l.kind === "spread" && l.end ? spreadSpots(l.qty, datesBetween(l.start, l.end)) : null;
              return (
                <li key={n} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="text-sm font-medium">{l.title}</div><div className="text-xs text-muted-foreground">{lineWhat(l)}</div></div>
                    <span className="shrink-0 text-sm tabular-nums">{kes(l.total)}</span>
                  </div>
                  {l.adFormat && l.adFormat !== "package" && (
                    <details className="mt-2 print:hidden">
                      <summary className="cursor-pointer text-xs text-muted-foreground">See it in place</summary>
                      <div className="mt-2 max-w-md"><AdPreview item={item} option={l.option ?? null} kit={kit} schedule={schedule} accent={accent} /></div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          {view.schedule_note && <p className="mt-2 rounded-lg bg-muted/60 p-3 text-sm"><b>Schedule:</b> {view.schedule_note}</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 print:hidden" aria-labelledby="ad-title">
          <h2 id="ad-title" className="text-lg font-semibold">Your ad</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(view.materials).map(([m, s]) => (
              <li key={m} className="flex justify-between gap-3">
                <span>{MATERIAL_LABEL[m] ?? m}</span>
                <span className="text-muted-foreground">
                  {s.mode === "make" ? `${view.house.name} makes it` : s.mode === "later" ? `Due by ${shortDate(view.ad_due)}` : "Given"}
                </span>
              </li>
            ))}
          </ul>
          {view.files.filter((f) => !f.slot?.startsWith("kit")).length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {view.files.filter((f) => !f.slot?.startsWith("kit")).map((f) => (
                <li key={f.url}><a className="underline underline-offset-4" href={f.url} target="_blank" rel="noreferrer">{f.name}</a></li>
              ))}
            </ul>
          )}
          {missing.length > 0 && view.status !== "cancelled" && view.status !== "done" && (
            <AddFiles materials={missing.map(([m]) => m)} busy={busy !== null}
              onUpload={async (slot, files) => {
                setBusy("upload");
                setNotice(null);
                try {
                  const asked = files.map((f) => ({ slot, name: f.name, type: f.type, size: f.size }));
                  const { uploads } = (await call("upload_urls", { files: asked })) as { uploads: { slot: string; path: string; token: string }[] };
                  const sent = await uploadAll(supabase, uploads, files);
                  setView((await call("files_added", { files: sent })) as PublicBookingView);
                  setNotice(sent.length === files.length ? "Files added." : "Some files didn't upload. Try those again.");
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(null);
                }
              }} />
          )}
        </section>

        {view.proof && (
          <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="proof-title">
            <h2 id="proof-title" className="text-lg font-semibold">Proof</h2>
            {view.proof.note && <p className="mt-1 text-sm">{view.proof.note}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              {[view.proof.views ? `${view.proof.views.toLocaleString("en-KE")} views delivered` : null, view.proof.spots ? `${view.proof.spots} spots aired` : null].filter(Boolean).join(" · ")}
            </p>
            <ul className="mt-2 space-y-1 text-sm">{view.proof.files.map((f) => <li key={f.url}><a className="underline underline-offset-4" href={f.url} target="_blank" rel="noreferrer">{f.name}</a></li>)}</ul>
          </section>
        )}

        {paid && view.status !== "cancelled" && (
          <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="receipt-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="receipt-title" className="text-lg font-semibold">Receipt</h2>
              <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" aria-hidden /> Print</Button>
            </div>
            <p className="mt-1 text-sm">Paid to {view.paid_to || view.house.name}{view.paid_at ? ` on ${dateTime(view.paid_at)}` : ""}{view.payment_ref ? ` · reference ${view.payment_ref}` : ""}</p>
            <p className="text-sm text-muted-foreground">Booking {view.ref} for {view.buyer.company || view.buyer.name}{view.buyer.client ? `, for ${view.buyer.client}` : ""}</p>
            <dl className="mt-3 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Media</dt><dd className="tabular-nums">{kes(view.totals.media)}</dd></div>
              {view.totals.production > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Making the ad</dt><dd className="tabular-nums">{kes(view.totals.production)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted-foreground">VAT (16%)</dt><dd className="tabular-nums">{kes(view.totals.vat)}</dd></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total paid</dt><dd className="tabular-nums">{kes(view.totals.total)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">{view.house.name} sends the tax invoice separately.</p>
          </section>
        )}
      </main>
    </div>
  );
}

/** "I've paid": the code from the buyer's bank or M-Pesa message, so the house knows what to look for. */
function ClaimPayment({ view, busy, onClaim }: { view: PublicBookingView; busy: boolean; onClaim: (reference: string) => void }) {
  if (view.payment_claimed_ref) {
    return <p className="text-sm">You told us the code {view.payment_claimed_ref}. {view.house.name} confirms your booking once the money lands.</p>;
  }
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      onClaim(String(new FormData(e.currentTarget).get("reference") ?? ""));
    }}>
      <div className="min-w-[200px] flex-1 space-y-1.5">
        <Label htmlFor="claim-ref">Transaction code</Label>
        <Input id="claim-ref" name="reference" placeholder="From your bank or M-Pesa message" />
      </div>
      <Button type="submit" disabled={busy}>Sent it? Tell {view.house.name} I've paid</Button>
    </form>
  );
}

function FinalAnswer({ busy, accent, onApprove, onChange }: { busy: boolean; accent: string; onApprove: () => void; onChange: (note: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  return asking ? (
    <div className="mt-3 space-y-2">
      <Label htmlFor="final-note">What should change?</Label>
      <Textarea id="final-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" disabled={busy || !note.trim()} onClick={() => onChange(note.trim())}>Send</Button>
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>Back</Button>
      </div>
    </div>
  ) : (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" className="text-white" style={{ background: accent }} disabled={busy} onClick={onApprove}>Looks good</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setAsking(true)}>Ask for a change</Button>
    </div>
  );
}

function AddFiles({ materials, busy, onUpload }: { materials: Material[]; busy: boolean; onUpload: (slot: Material, files: File[]) => void }) {
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-muted/60 p-3">
      <p className="text-sm font-medium">Add your files</p>
      {materials.map((m) => (
        <div key={m} className="space-y-1">
          <Label htmlFor={`add-${m}`} className="text-xs">{MATERIAL_LABEL[m] ?? m}</Label>
          <Input id={`add-${m}`} type="file" multiple disabled={busy}
            onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) onUpload(m, files); }} />
        </div>
      ))}
    </div>
  );
}
