import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pesapalAuth, pesapalGetStatus } from "../_shared/pesapal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function processOrder(orderTrackingId: string, merchantRef: string | null, notificationType: string | null, raw: any) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = await pesapalAuth();
  const status = await pesapalGetStatus(token, orderTrackingId);
  await supabase.from("pesapal_ipn_log").insert({
    order_tracking_id: orderTrackingId,
    merchant_reference: merchantRef,
    notification_type: notificationType,
    raw,
    status_response: status,
  });

  // status_code: 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED
  const { data: inv } = await supabase.from("invoices").select("*")
    .eq("pesapal_order_tracking_id", orderTrackingId).maybeSingle();
  if (!inv) return { status, matched: false };

  if (status.status_code === 1 && inv.status !== "paid") {
    await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id);
    await supabase.from("payments").insert({
      invoice_id: inv.id,
      org_kind: inv.org_kind,
      org_id: inv.org_id,
      amount_kes: Math.round(status.amount ?? inv.amount_kes),
      method: "pesapal",
      reference: status.merchant_reference ?? inv.pesapal_merchant_reference,
      pesapal_confirmation_code: status.confirmation_code ?? null,
      paid_at: status.created_date ? new Date(status.created_date).toISOString() : new Date().toISOString(),
      notes: `${status.payment_method ?? ""} ${status.payment_account ?? ""}`.trim() || null,
    });
  }
  return { status, matched: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let orderTrackingId = url.searchParams.get("OrderTrackingId");
    let merchantRef = url.searchParams.get("OrderMerchantReference");
    let notificationType = url.searchParams.get("OrderNotificationType");
    let raw: any = Object.fromEntries(url.searchParams);

    if (req.method === "POST") {
      try {
        const body = await req.json();
        raw = { ...raw, body };
        orderTrackingId ||= body.OrderTrackingId ?? body.orderTrackingId;
        merchantRef ||= body.OrderMerchantReference ?? body.merchantReference;
        notificationType ||= body.OrderNotificationType ?? body.notificationType;
      } catch { /* ignore */ }
    }

    if (!orderTrackingId) {
      return new Response(JSON.stringify({ status: 500, message: "Missing OrderTrackingId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await processOrder(orderTrackingId, merchantRef, notificationType, raw);
    return new Response(JSON.stringify({
      orderNotificationType: notificationType,
      orderTrackingId,
      orderMerchantReference: merchantRef,
      status: 200,
      matched: result.matched,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ status: 500, message: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
