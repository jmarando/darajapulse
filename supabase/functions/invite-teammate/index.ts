import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Role = "agency_admin" | "account_manager";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin.from("user_roles").select("role, agency_id").eq("user_id", u.user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("agency_admin")) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerAgencyId: string | null = (roles ?? []).find((r: any) => r.agency_id)?.agency_id ?? null;

    const { email, role, title, redirect_to } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const newRole: Role = role === "agency_admin" ? "agency_admin" : "account_manager";
    const cleanTitle = typeof title === "string" && title.length ? title : null;
    if (!cleanEmail) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const appUrl = redirect_to || `${new URL(req.url).origin}/app`;
    const setupUrl = String(appUrl).replace(/\/app\/?$/, "/reset-password");

    let userId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find((x: any) => (x.email ?? "").toLowerCase() === cleanEmail);
    if (found) {
      userId = found.id;
    } else {
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: setupUrl,
      });
      if (invErr || !invited?.user) {
        return new Response(JSON.stringify({ error: invErr?.message ?? "invite failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = invited.user.id;
    }

    await admin.from("profiles").upsert({ id: userId!, email: cleanEmail, ...(cleanTitle ? { title: cleanTitle } : {}) }, { onConflict: "id" });
    await admin.from("user_roles").upsert({ user_id: userId, role: newRole, agency_id: callerAgencyId }, { onConflict: "user_id,role" });
    // Backfill agency_id on any existing row that's missing it
    if (callerAgencyId) {
      await admin.from("user_roles").update({ agency_id: callerAgencyId }).eq("user_id", userId).eq("role", newRole).is("agency_id", null);
    }

    // For existing users, inviteUserByEmail wasn't called → send a recovery link
    // so they can (re)set a password and learn about their new workspace access.
    let welcomeSent = false;
    let welcomeError: string | null = null;
    if (found) {
      let signInUrl = setupUrl;
      try {
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: cleanEmail,
          options: { redirectTo: setupUrl },
        });
        if (linkData?.properties?.action_link) signInUrl = linkData.properties.action_link;
      } catch (_) { /* fall back */ }

      // Resolve caller's agency name for the welcome email
      let orgName = "your team";
      if (callerAgencyId) {
        const { data: ag } = await admin.from("agencies").select("name").eq("id", callerAgencyId).maybeSingle();
        if ((ag as any)?.name) orgName = (ag as any).name;
      }

      const mailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader || `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({
          templateName: "org-admin-welcome",
          recipientEmail: cleanEmail,
          idempotencyKey: `teammate-welcome-${callerAgencyId ?? "na"}-${userId}-${Date.now()}`,
          templateData: { org_name: orgName, org_kind: "agency", sign_in_url: signInUrl, app_url: appUrl },
        }),
      });
      if (!mailRes.ok) welcomeError = `${mailRes.status}: ${await mailRes.text()}`;
      else welcomeSent = true;
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId, existed: !!found, role: newRole, welcome_sent: welcomeSent, welcome_error: welcomeError }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
