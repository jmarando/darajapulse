import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  canChangeRoute, daysLeft, dueDate, formatNairobiDate, invoiceDeadline, nairobiDay, type InvoiceRoute, type InvoiceStatus,
} from "../../../supabase/functions/_shared/payout-rules";

/** The invoice columns of a payouts row. */
export interface PayoutInvoiceRow {
  id: string;
  gross_kes: number | string;
  created_at: string;
  report_approved_at: string | null;
  invoice_route: InvoiceRoute | null;
  invoice_status: InvoiceStatus;
  invoice_number: string | null;
  invoice_raised_at: string | null;
  invoice_decided_at: string | null;
}

const kes = (value: number) => `KES ${Math.round(value).toLocaleString()}`;

/** Where one creator's eTIMS invoice stands, and what staff can record next. */
export default function InvoiceControls({ payout, liveGrossKes, paymentTermsDays, busy, onApprove, onDecide, onUploadOwn, onReportApprovedChange }: {
  payout: PayoutInvoiceRow;
  liveGrossKes: number;
  paymentTermsDays: number | null;
  busy: boolean;
  onApprove: () => void;
  onDecide: (status: "declined" | "expired") => void;
  onUploadOwn: () => void;
  onReportApprovedChange: (day: string) => void;
}) {
  const status = payout.invoice_status;
  const invoicedGross = Number(payout.gross_kes);
  const reportApprovedAt = payout.report_approved_at ?? payout.created_at;
  const due = dueDate({
    invoiceApprovedAt: status === "approved" ? payout.invoice_decided_at : null,
    reportApprovedAt,
    paymentTermsDays,
  });
  const left = status === "raised" && payout.invoice_route === "bii" && payout.invoice_raised_at
    ? daysLeft(invoiceDeadline(payout.invoice_raised_at))
    : null;
  const moved = (status === "raised" || status === "approved") && Math.round(liveGrossKes) !== Math.round(invoicedGross);

  return (
    <div className="space-y-1.5 text-xs">
      {status === "not_raised" && <div className="text-muted-foreground">No invoice yet</div>}
      {status === "raised" && payout.invoice_route === "bii" && (
        <div>
          <Badge variant="outline" className="text-highlight border-highlight/40">Raised</Badge>
          {payout.invoice_raised_at && <span className="ml-1.5 text-muted-foreground">{formatNairobiDate(payout.invoice_raised_at)}</span>}
          {left !== null && <div className={left === 0 ? "text-destructive mt-1" : "text-muted-foreground mt-1"}>{left === 0 ? "Approval window closed" : `${left} day${left === 1 ? "" : "s"} left`}</div>}
        </div>
      )}
      {status === "raised" && payout.invoice_route === "creator" && (
        <div><Badge variant="outline" className="text-highlight border-highlight/40">To check</Badge> <span className="text-muted-foreground">their invoice {payout.invoice_number}</span></div>
      )}
      {status === "approved" && (
        <div>
          <Badge variant="outline" className="text-success border-success/40">Approved</Badge>
          <span className="ml-1.5 tabular-nums">{payout.invoice_number}</span>
          {payout.invoice_decided_at && <span className="ml-1.5 text-muted-foreground">{formatNairobiDate(payout.invoice_decided_at)}</span>}
        </div>
      )}
      {(status === "declined" || status === "expired") && (
        <div>
          <Badge variant="outline" className="text-destructive border-destructive/40">{status === "declined" ? "Declined" : "Expired"}</Badge>
          {payout.invoice_decided_at && <span className="ml-1.5 text-muted-foreground">{formatNairobiDate(payout.invoice_decided_at)}</span>}
          <div className="text-muted-foreground mt-1">Raise it again once the problem is fixed.</div>
        </div>
      )}

      {status === "raised" && (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={onApprove}>Mark approved</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onDecide("declined")}>Declined</Button>
          {payout.invoice_route === "bii" && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onDecide("expired")}>Expired</Button>}
        </div>
      )}
      {canChangeRoute({ invoiceStatus: status }) && (
        <Button size="sm" variant="link" className="h-auto p-0 text-xs" disabled={busy} onClick={onUploadOwn}>Upload their invoice</Button>
      )}

      <label className="flex items-center gap-1.5 text-muted-foreground">
        Report approved
        <input
          type="date"
          aria-label="Report approved"
          className="rounded border border-input bg-background px-1 py-0.5 text-xs text-foreground"
          value={nairobiDay(reportApprovedAt)}
          disabled={busy}
          onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onReportApprovedChange(e.target.value); }}
        />
      </label>
      {due && <div className="font-medium">{`Due ${formatNairobiDate(due)}`}</div>}
      {moved && (
        <div className="text-highlight">{`Figures changed since the invoice was raised (live ${kes(liveGrossKes)}, invoiced ${kes(invoicedGross)})`}</div>
      )}
    </div>
  );
}

/** Staff record KRA's approval of an invoice, with the eTIMS invoice number it carries. */
export function ApproveInvoiceDialog({ open, onOpenChange, creatorName, initialNumber, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorName: string;
  initialNumber: string;
  onSave: (invoiceNumber: string) => Promise<void>;
}) {
  const [number, setNumber] = useState(initialNumber);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumber(initialNumber);
    setError(null);
  }, [open, initialNumber]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!number.trim()) { setError("Enter the eTIMS invoice number"); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave(number.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the approval. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Invoice approved</DialogTitle>
            <DialogDescription>{creatorName}'s eTIMS invoice. Copy the number from the approved invoice in eCitizen.</DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Label htmlFor="approve-invoice-number">eTIMS invoice number</Label>
            <Input id="approve-invoice-number" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" className="mt-1.5" />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>Save approval</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
