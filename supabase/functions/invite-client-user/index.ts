import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CANONICAL_APP_ORIGIN, safeAppUrl, setupUrlFrom } from "../_shared/app-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("agency_admin") && !roleSet.has("account_manager")) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { client_id, email, campaign_ids } = await req.json();
    if (!client_id || !email) return new Response(JSON.stringify({ error: "client_id and email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const campaignIds: string[] = Array.isArray(campaign_ids) ? campaign_ids.filter((x) => typeof x === "string") : [];

    const cleanEmail = String(email).trim().toLowerCase();
    const setupUrl = setupUrlFrom(safeAppUrl(null, "/portal"));

    // Find or invite the auth user
    let userId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find((x: any) => (x.email ?? "").toLowerCase() === cleanEmail);
    if (found) {
      userId = found.id;
    } else {
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: setupUrl,
        data: { access_label: "client workspace member" },
      });
      if (invErr || !invited?.user) {
        return new Response(JSON.stringify({ error: invErr?.message ?? "invite failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = invited.user.id;
    }

    // Assign client_user role (idempotent)
    await admin.from("user_roles").upsert({ user_id: userId, role: "client_user" }, { onConflict: "user_id,role" });

    // Link membership
    const { error: linkErr } = await admin.from("client_members").upsert(
      { client_id, user_id: userId, invited_email: cleanEmail },
      { onConflict: "client_id,user_id" },
    );
    if (linkErr) return new Response(JSON.stringify({ error: linkErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Per-campaign restriction: replace any existing rows for this user × this client's campaigns
    const { data: clientCamps } = await admin.from("campaigns").select("id").eq("client_id", client_id);
    const clientCampIds = (clientCamps ?? []).map((c: any) => c.id);
    if (clientCampIds.length > 0) {
      await admin.from("campaign_members").delete().eq("user_id", userId).in("campaign_id", clientCampIds);
    }
    if (campaignIds.length > 0) {
      const valid = campaignIds.filter((id) => clientCampIds.includes(id));
      if (valid.length > 0) {
        await admin.from("campaign_members").upsert(
          valid.map((cid) => ({ user_id: userId, campaign_id: cid })),
          { onConflict: "campaign_id,user_id" },
        );
      }
    }

    let accessEmailSent = false;
    let accessEmailError: string | null = null;
    if (found) {
      const { data: client } = await admin.from("clients").select("name").eq("id", client_id).maybeSingle();
      const clientName = client?.name || "your client workspace";
      const mailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader || `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({
          templateName: "workspace-access",
          recipientEmail: cleanEmail,
          idempotencyKey: `client-access-${client_id}-${userId}`,
          templateData: {
            org_name: clientName,
            access_label: "client workspace member",
            sign_in_url: `${CANONICAL_APP_ORIGIN}/auth?next=%2Fportal`,
          },
        }),
      });
      if (mailRes.ok) accessEmailSent = true;
      else accessEmailError = `${mailRes.status}: ${await mailRes.text()}`;
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId, existed: !!found, scoped_campaigns: campaignIds.length, access_email_sent: accessEmailSent, access_email_error: accessEmailError }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
