import { useEffect, useState, type FormEvent } from "react";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getPayoutCard, savePayoutDetails, type PayoutCard, type PayoutCardPayout } from "@/lib/payouts/api";
import { validateDetailsInput, type DetailsInput } from "@/lib/payouts/details";
import { daysLeft, dueDate, formatNairobiDate, invoiceDeadline } from "../../../supabase/functions/_shared/payout-rules";

/** One plain sentence on where the creator's finalised payment stands. */
function payoutStatusLine(p: PayoutCardPayout, now = new Date()): string {
  switch (p.invoice_status) {
    case "raised": {
      if (p.invoice_route === "creator" || !p.invoice_raised_at) return "We're checking the invoice you sent.";
      const deadline = invoiceDeadline(p.invoice_raised_at);
      const left = daysLeft(deadline, now);
      return `Approve your invoice on *222# by ${formatNairobiDate(deadline)} (${left} day${left === 1 ? "" : "s"} left).`;
    }
    case "approved": {
      const due = dueDate({ invoiceApprovedAt: p.invoice_decided_at, reportApprovedAt: p.report_approved_at, paymentTermsDays: p.payment_terms_days });
      return due ? `Invoice approved. Payment due ${formatNairobiDate(due)}.` : "Invoice approved. Payment due date to be confirmed.";
    }
    case "declined":
    case "expired":
      return "Your invoice wasn't approved. We'll raise it again, so watch for KRA's text.";
    default:
      return `Your figure is final: KES ${Math.round(Number(p.gross_kes)).toLocaleString("en-GB")}. We'll raise your eTIMS invoice next.`;
  }
}

const CONSENT = "I agree that the company paying me raises my eTIMS invoice through KRA, and that I will approve it on *222#.";
const blank: DetailsInput = {
  mpesaNumber: "", mpesaNumberConfirm: "", mpesaName: "", kraPin: "", legalName: "", idNumber: "", vatRegistered: false, biiConsent: false,
};
type TextKey = "mpesaNumber" | "mpesaNumberConfirm" | "mpesaName" | "kraPin" | "legalName" | "idNumber";

/** The creator's own payout details on /b/:token, shown once their agreement is signed. */
export default function GetPaidCard({ token }: { token: string }) {
  const [card, setCard] = useState<PayoutCard | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DetailsInput>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof DetailsInput, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    // Until the card loads (or if it can't), the page simply goes without it.
    getPayoutCard(token).then((c) => { if (active) setCard(c); }).catch(() => {});
    return () => { active = false; };
  }, [token]);

  if (!card?.contract_signed) return null;
  const details = card.details;
  const set = <K extends keyof DetailsInput>(key: K, value: DetailsInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const startEditing = () => {
    setForm({ ...blank, mpesaName: details?.mpesa_name ?? "", legalName: details?.legal_name ?? "",
      vatRegistered: details?.vat_registered ?? false, biiConsent: details?.bii_consent ?? false });
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const result = validateDetailsInput(form);
    if (result.ok === false) { setErrors(result.errors); return; }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      setCard(await savePayoutDetails(token, result.value));
      setEditing(false);
      setForm(blank);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: TextKey, label: string, extra: { placeholder?: string; inputMode?: "tel" | "numeric" | "text" } = {}) => (
    <div>
      <Label htmlFor={`get-paid-${key}`}>{label}</Label>
      <Input id={`get-paid-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} autoComplete="off" className="mt-1.5" {...extra} />
      {errors[key] && <p className="text-xs text-destructive mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <Card className="p-6 mt-6">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Payment</div>
      <h3 className="font-display text-xl mt-1">Get paid</h3>
      {card.payout && <p className="mt-2 text-sm font-medium">{payoutStatusLine(card.payout)}</p>}

      {details && !editing ? (
        <div className="mt-4 space-y-2 text-sm">
          <p>We'll pay you on M-Pesa: <span className="font-medium tabular-nums">{details.mpesa_number_masked}</span> <span className="text-muted-foreground">({details.mpesa_name})</span></p>
          <p className="text-muted-foreground">
            KRA PIN <span className="text-foreground tabular-nums">{details.kra_pin_masked}</span> · ID <span className="text-foreground tabular-nums">{details.id_number_masked}</span> · Name on ID: <span className="text-foreground">{details.legal_name}</span>
          </p>
          <p className="text-muted-foreground">
            {details.vat_registered ? "You'll send us your own eTIMS invoice." : "We'll raise your eTIMS invoice through KRA. When KRA texts you, approve it on *222#."}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={startEditing}>Update details</Button>
        </div>
      ) : (
        <form onSubmit={save} className="mt-3 space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">Tell us where to send your payment. You only need to do this once.</p>
          <p className="text-sm text-muted-foreground">KRA needs your name as on your ID and your ID number to raise your eTIMS invoice.</p>
          {details && <p className="text-xs text-muted-foreground">For your security, type your number, KRA PIN and ID number again.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("mpesaNumber", "M-Pesa (Safaricom) number", { placeholder: "0712 345 678", inputMode: "tel" })}
            {field("mpesaNumberConfirm", "Type the number again", { placeholder: "0712 345 678", inputMode: "tel" })}
            {field("mpesaName", "Name registered on this M-Pesa line")}
            {field("kraPin", "KRA PIN", { placeholder: "A123456789Z" })}
            {field("legalName", "Full name as on your ID")}
            {field("idNumber", "ID number", { inputMode: "numeric" })}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="get-paid-vat" checked={form.vatRegistered} onCheckedChange={(v) => set("vatRegistered", v === true)} />
            <Label htmlFor="get-paid-vat" className="font-normal">I'm registered for VAT</Label>
          </div>
          {form.vatRegistered ? (
            <p className="text-sm text-muted-foreground">You'll send us your own eTIMS invoice.</p>
          ) : (
            <div>
              <div className="flex items-start gap-2">
                <Checkbox id="get-paid-consent" className="mt-0.5" checked={form.biiConsent} onCheckedChange={(v) => set("biiConsent", v === true)} />
                <Label htmlFor="get-paid-consent" className="font-normal leading-snug">{CONSENT}</Label>
              </div>
              {errors.biiConsent && <p className="text-xs text-destructive mt-1">{errors.biiConsent}</p>}
            </div>
          )}
          {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>Save details</Button>
            {details && <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}
