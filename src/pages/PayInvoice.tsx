import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function PayInvoice() {
  const { token } = useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data } = await supabase.rpc("get_invoice_by_token", { _token: token });
      const inv = data as any;
      if (!inv) { setError("Invoice not found."); return; }
      if (inv.status === "paid") { window.location.replace(`/invoice/${token}`); return; }
      if (inv.pesapal_redirect_url) {
        window.location.replace(inv.pesapal_redirect_url);
        return;
      }
      setError("No payment link available yet. Please open the invoice.");
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center text-center px-6">
      {error ? (
        <div className="max-w-sm">
          <div className="text-sm text-muted-foreground mb-3">{error}</div>
          <Link to={`/invoice/${token}`} className="text-sm underline">View invoice</Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Redirecting to secure Pesapal checkout…
        </div>
      )}
    </div>
  );
}
