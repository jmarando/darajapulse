import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, ExternalLink, Loader2 } from "lucide-react";

type Invoice = {
  id: string;
  invoice_number: string;
  amount_kes: number;
  status: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  created_at: string;
  paid_at: string | null;
  notes: string | null;
  pesapal_redirect_url: string | null;
  org_kind: "agency" | "brand_org";
  org: {
    name: string;
    legal_name: string | null;
    invoice_address: string | null;
    kra_pin: string | null;
    support_email: string | null;
    logo_url: string | null;
  } | null;
};

const fmtKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "—";

export default function PublicInvoice() {
  const { token } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data } = await supabase.rpc("get_invoice_by_token", { _token: token });
      setInv((data as any) ?? null);
      setLoading(false);
    })();
  }, [token]);

  const payNow = async () => {
    if (!inv) return;
    if (inv.pesapal_redirect_url) {
      window.open(inv.pesapal_redirect_url, "_blank");
      return;
    }
    setPayLoading(true);
    const { data } = await supabase.functions.invoke("pesapal-create-order", {
      body: { invoice_id: inv.id, callback_url: window.location.href },
    });
    setPayLoading(false);
    const url = (data as any)?.redirect_url;
    if (url) window.open(url, "_blank");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading invoice…</div>;
  if (!inv) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Invoice not found.</div>;

  const isPaid = inv.status === "paid";
  const isOverdue = inv.status === "overdue";
  const billTo = inv.org?.legal_name || inv.org?.name || "";

  return (
    <div className="min-h-screen bg-muted/30 py-10 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto bg-white shadow-sm print:shadow-none border print:border-0">
        {/* Toolbar (hidden in print) */}
        <div className="flex items-center justify-between px-8 py-4 border-b print:hidden">
          <div className="text-sm text-muted-foreground">Invoice {inv.invoice_number}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Print / Save PDF
            </Button>
            {!isPaid && (
              <Button size="sm" onClick={payNow} disabled={payLoading}>
                {payLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Pay online (Pesapal)
              </Button>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="px-8 pt-8 flex items-start justify-between">
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight">Daraja Pulse</div>
            <div className="text-xs text-muted-foreground mt-1">
              Lana Bespoke Limited<br />
              billing@darajapulse.com
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold tracking-tight">INVOICE</div>
            <div className="text-sm text-muted-foreground mt-1">{inv.invoice_number}</div>
            <div className="mt-2">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                  isPaid
                    ? "bg-green-100 text-green-800"
                    : isOverdue
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {isPaid ? "Paid" : isOverdue ? "Overdue" : "Due"}
              </span>
            </div>
          </div>
        </div>

        {/* Bill to + meta */}
        <div className="px-8 mt-8 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Bill to</div>
            <div className="text-sm font-medium">{billTo}</div>
            {inv.org?.invoice_address && (
              <div className="text-sm text-muted-foreground whitespace-pre-line">{inv.org.invoice_address}</div>
            )}
            {inv.org?.kra_pin && <div className="text-sm text-muted-foreground">KRA PIN: {inv.org.kra_pin}</div>}
            {inv.org?.support_email && <div className="text-sm text-muted-foreground">{inv.org.support_email}</div>}
          </div>
          <div className="text-sm">
            <div className="grid grid-cols-2 gap-y-1">
              <div className="text-muted-foreground">Issue date</div>
              <div className="text-right">{fmtDate(inv.created_at)}</div>
              <div className="text-muted-foreground">Due date</div>
              <div className="text-right">{fmtDate(inv.due_date)}</div>
              <div className="text-muted-foreground">Terms</div>
              <div className="text-right">Net 14 days</div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-8 mt-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 font-normal">Description</th>
                <th className="text-right py-2 font-normal">Period</th>
                <th className="text-right py-2 font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3">
                  Daraja Pulse platform subscription
                  <div className="text-xs text-muted-foreground">Influencer campaigns, analytics & reporting</div>
                </td>
                <td className="py-3 text-right text-muted-foreground text-xs">
                  {fmtDate(inv.period_start)}<br />– {fmtDate(inv.period_end)}
                </td>
                <td className="py-3 text-right">{fmtKES(inv.amount_kes)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-64 text-sm">
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Subtotal</span><span>{fmtKES(inv.amount_kes)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Tax</span><span>—</span>
              </div>
              <div className="flex justify-between py-2 border-t font-semibold text-base">
                <span>Total due</span><span>{fmtKES(inv.amount_kes)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment instructions */}
        <div className="px-8 mt-10 pb-10">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Payment instructions</div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="border rounded-md p-4 bg-muted/30">
              <div className="font-medium mb-2">Bank transfer</div>
              <div className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
                <div className="text-muted-foreground">Account name</div><div>LANA BESPOKE LIMITED</div>
                <div className="text-muted-foreground">Account no.</div><div>1006114657 (KES)</div>
                <div className="text-muted-foreground">Bank</div><div>NCBA Bank Kenya PLC</div>
                <div className="text-muted-foreground">Branch</div><div>NCBA House Branch</div>
                <div className="text-muted-foreground">Reference</div><div>{inv.invoice_number}</div>
              </div>
            </div>
            <div className="border rounded-md p-4 bg-muted/30 flex flex-col">
              <div className="font-medium mb-2">Pay online</div>
              <p className="text-sm text-muted-foreground mb-3">
                Pay by M-Pesa, card, or bank via our secure Pesapal link. Payment is confirmed automatically.
              </p>
              {!isPaid && (
                <Button className="self-start print:hidden" size="sm" onClick={payNow} disabled={payLoading}>
                  {payLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Pay {fmtKES(inv.amount_kes)}
                </Button>
              )}
              {isPaid && (
                <div className="text-sm text-green-700 font-medium">Paid on {fmtDate(inv.paid_at)}</div>
              )}
              <div className="text-xs text-muted-foreground mt-3 hidden print:block">
                Link: {typeof window !== "undefined" ? window.location.href : ""}
              </div>
            </div>
          </div>

          {inv.notes && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-6 mb-2">Notes</div>
              <div className="text-sm text-muted-foreground whitespace-pre-line">{inv.notes}</div>
            </>
          )}

          <div className="mt-8 text-xs text-muted-foreground border-t pt-4">
            Payment is due within 14 days of the invoice date. Overdue accounts may be suspended after 14 days past
            the due date. Questions? billing@darajapulse.com
          </div>
        </div>
      </div>
    </div>
  );
}
