import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveStaffPayoutDetails } from "@/lib/payouts/staffApi";
import { validateDetailsInput, type DetailsInput } from "@/lib/payouts/details";
import type { DetailsLike } from "../../../supabase/functions/_shared/payout-rules";

type TextKey = "mpesaNumber" | "mpesaName" | "kraPin" | "legalName" | "idNumber";

const formFor = (d: DetailsLike | undefined): DetailsInput => ({
  mpesaNumber: d?.mpesaNumber ?? "",
  mpesaNumberConfirm: d?.mpesaNumber ?? "",
  mpesaName: d?.mpesaName ?? "",
  kraPin: d?.kraPin ?? "",
  legalName: d?.legalName ?? "",
  idNumber: d?.idNumber ?? "",
  vatRegistered: d?.vatRegistered ?? false,
  biiConsent: d?.biiConsentAt != null,
});

/** Staff enter or correct a creator's payout details, for creators who send them on WhatsApp. */
export default function PayoutDetailsDialog({ open, onOpenChange, agencyId, influencerId, creatorName, existing, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  influencerId: string;
  creatorName: string;
  existing?: DetailsLike;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DetailsInput>(() => formFor(existing));
  const [errors, setErrors] = useState<Partial<Record<keyof DetailsInput, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFor(existing));
    setErrors({});
    setSaveError(null);
  }, [open, existing]);

  const set = <K extends keyof DetailsInput>(key: K, value: DetailsInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = validateDetailsInput({ ...form, mpesaNumberConfirm: form.mpesaNumber });
    if (result.ok === false) { setErrors(result.errors); return; }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      await saveStaffPayoutDetails(agencyId, influencerId, result.value, existing?.biiConsentAt ?? null);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save these details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: TextKey, label: string, inputMode?: "tel" | "numeric") => (
    <div>
      <Label htmlFor={`payout-${key}`}>{label}</Label>
      <Input id={`payout-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} autoComplete="off" inputMode={inputMode} className="mt-1.5" />
      {errors[key] && <p className="text-xs text-destructive mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payout details: {creatorName}</DialogTitle>
          <DialogDescription>Used to pay them and to raise their eTIMS invoice. The creator can confirm or correct them on their own page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("mpesaNumber", "M-Pesa (Safaricom) number", "tel")}
            {field("mpesaName", "Name registered on this M-Pesa line")}
            {field("kraPin", "KRA PIN")}
            {field("legalName", "Full name as on their ID")}
            {field("idNumber", "ID number", "numeric")}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="payout-vat" checked={form.vatRegistered} onCheckedChange={(v) => set("vatRegistered", v === true)} />
            <Label htmlFor="payout-vat" className="font-normal">VAT-registered</Label>
          </div>
          {form.vatRegistered ? (
            <p className="text-sm text-muted-foreground">They send their own eTIMS invoice.</p>
          ) : (
            <div>
              <div className="flex items-start gap-2">
                <Checkbox id="payout-consent" className="mt-0.5" checked={form.biiConsent} onCheckedChange={(v) => set("biiConsent", v === true)} />
                <Label htmlFor="payout-consent" className="font-normal leading-snug">The creator agreed to have their eTIMS invoice raised through KRA (for example on WhatsApp)</Label>
              </div>
              {errors.biiConsent && <p className="text-xs text-destructive mt-1">{errors.biiConsent}</p>}
            </div>
          )}
          {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>Save details</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
