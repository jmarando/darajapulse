import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pesapalAuth, pesapalGetStatus } from "../_shared/pesapal.ts";

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

    const { invoice_id } = await req.json();
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
    if (!inv?.pesapal_order_tracking_id) throw new Error("No Pesapal order on this invoice");
    const token = await pesapalAuth();
    const status = await pesapalGetStatus(token, inv.pesapal_order_tracking_id);

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
      });
    }
    return new Response(JSON.stringify(status), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
