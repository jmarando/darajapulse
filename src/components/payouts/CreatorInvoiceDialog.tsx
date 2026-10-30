import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { recordCreatorInvoice } from "@/lib/payouts/staffApi";

/**
 * A creator issued their own eTIMS invoice: VAT-registered creators, or anyone who already sent one. Staff record its
 * number and, if they have it, the file; it then waits for staff to check it with KRA's invoice checker.
 */
export default function CreatorInvoiceDialog({ open, onOpenChange, payoutId, agencyId, creatorName, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payoutId: string;
  agencyId: string;
  creatorName: string;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumber("");
    setFile(null);
    setError(null);
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!number.trim()) { setError("Enter the eTIMS invoice number"); return; }
    setError(null);
    setSaving(true);
    try {
      await recordCreatorInvoice(payoutId, agencyId, file, number.trim());
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the invoice. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Their own eTIMS invoice</DialogTitle>
            <DialogDescription>
              {creatorName} issued this invoice themselves. Check it with KRA's invoice checker on iTax, then mark it approved.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-4">
            <div>
              <Label htmlFor="creator-invoice-number">eTIMS invoice number</Label>
              <Input id="creator-invoice-number" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="creator-invoice-file">Invoice file (PDF or photo, optional)</Label>
              <Input id="creator-invoice-file" type="file" accept="application/pdf,image/png,image/jpeg" className="mt-1.5"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>Save invoice</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
