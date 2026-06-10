import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pesapalAuth, PESAPAL_BASE } from "../_shared/pesapal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!roles?.some((r: any) => r.role === "super_admin"))
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const { invoice_id, callback_url } = await req.json();
    const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
    if (error || !inv) throw new Error("invoice not found");

    // Look up org details
    const table = inv.org_kind === "agency" ? "agencies" : "brand_orgs";
    const { data: org } = await supabase.from(table).select("name, support_email").eq("id", inv.org_id).single();

    const ipnId = Deno.env.get("PESAPAL_IPN_ID");
    if (!ipnId) throw new Error("PESAPAL_IPN_ID not configured — run pesapal-register-ipn first and save the returned ipn_id as a secret");

    const merchantRef = inv.pesapal_merchant_reference ?? `INV-${inv.id.slice(0, 8)}-${Date.now()}`;
    const token = await pesapalAuth();
    const payload = {
      id: merchantRef,
      currency: "KES",
      amount: inv.amount_kes,
      description: `Invoice ${inv.id.slice(0, 8)} · ${org?.name ?? ""}`.slice(0, 100),
      callback_url: callback_url ?? `${new URL(req.url).origin}/app/admin/billing`,
      notification_id: ipnId,
      billing_address: { email_address: org?.support_email ?? "billing@example.com" },
    };
    const r = await fetch(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.order_tracking_id) throw new Error(`Pesapal order failed: ${JSON.stringify(j)}`);

    await supabase.from("invoices").update({
      pesapal_order_tracking_id: j.order_tracking_id,
      pesapal_merchant_reference: merchantRef,
      pesapal_redirect_url: j.redirect_url,
      status: inv.status === "draft" ? "sent" : inv.status,
    }).eq("id", inv.id);

    return new Response(JSON.stringify({ redirect_url: j.redirect_url, order_tracking_id: j.order_tracking_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
