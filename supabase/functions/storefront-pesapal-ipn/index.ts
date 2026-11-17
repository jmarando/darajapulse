// Pesapal calls this when a storefront booking's payment changes. It never trusts the call itself: it asks Pesapal for
// the order's status with the storefront's own keys, then marks the booking paid once (storefront-booking-actions.ts).
// Separate from pesapal-ipn, which settles client invoices with the invoice keys. Pesapal sends no login, hence
// verify_jwt = false; an unknown order is answered 200 with matched: false.
import { createClient } from "npm:@supabase/supabase-js@2";
import { pesapalGetStatus, pesapalTokenFor, storefrontPesapalKeys } from "../_shared/pesapal.ts";
import { houseById, settleFromPesapal } from "../_shared/storefront-booking-actions.ts";
import { mailerFor } from "../_shared/storefront-booking-mail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BOOKING_COLUMNS = "id, agency_id, ref, token, status, total_kes, media_kes, production_kes, vat_kes, start_date, lines, contact_name, contact_email, company";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let orderTrackingId = url.searchParams.get("OrderTrackingId");
    let merchantRef = url.searchParams.get("OrderMerchantReference");
    let notificationType = url.searchParams.get("OrderNotificationType");
    if (req.method === "POST") {
      try {
        const body = await req.json();
        orderTrackingId ||= body.OrderTrackingId ?? body.orderTrackingId;
        merchantRef ||= body.OrderMerchantReference ?? body.merchantReference;
        notificationType ||= body.OrderNotificationType ?? body.notificationType;
      } catch { /* a call without a body */ }
    }
    if (!orderTrackingId) return reply({ status: 500, message: "Missing OrderTrackingId" });
    const base = { orderNotificationType: notificationType, orderTrackingId, orderMerchantReference: merchantRef, status: 200 };

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: booking } = await sb.from("storefront_bookings").select(BOOKING_COLUMNS).eq("pesapal_tracking_id", orderTrackingId).maybeSingle();
    if (!booking) return reply({ ...base, matched: false });

    const keys = storefrontPesapalKeys();
    if (!keys) return reply({ status: 500, message: "The storefront's Pesapal keys are not set." });
    const status = await pesapalGetStatus(await pesapalTokenFor(keys), orderTrackingId);
    const house = await houseById(sb, booking.agency_id);
    if (!house) return reply({ ...base, matched: true, result: "no_house" });
    const result = await settleFromPesapal(sb, booking, status, mailerFor(sb, booking, house));
    return reply({ ...base, matched: true, result });
  } catch (e) {
    console.error("storefront-pesapal-ipn", e instanceof Error ? e.message : String(e));
    return reply({ status: 500, message: "The payment could not be checked." });
  }
});
