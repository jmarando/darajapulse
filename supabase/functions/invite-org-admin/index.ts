import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("agency_admin") && !roleSet.has("super_admin")) {
      return json({ error: "forbidden" }, 403);
    }

    const { kind, org_id, email, redirect_to } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (!cleanEmail || !org_id || (kind !== "agency" && kind !== "brand_org")) {
      return json({ error: "kind, org_id, and email required" }, 400);
    }
    const appUrl = redirect_to || "https://darajapulse.com/app";
    // New invites land on /reset-password so the user sets a password they can
    // re-use to sign in later. Existing users get a magic-link to /app.
    const setupUrl = appUrl.replace(/\/app\/?$/, "/reset-password");

    const table = kind === "agency" ? "agencies" : "brand_orgs";
    const { data: org } = await admin.from(table).select("name").eq("id", org_id).maybeSingle();
    const orgName = (org as any)?.name ?? (kind === "agency" ? "your agency" : "your brand");

    // Find or invite the auth user
    let userId: string | null = null;
    let existed = false;
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find((x: any) => (x.email ?? "").toLowerCase() === cleanEmail);
    if (found) {
      userId = found.id;
      existed = true;
    } else {
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: setupUrl,
        data: { org_name: orgName, org_kind: kind },
      });
      if (invErr || !invited?.user) return json({ error: invErr?.message ?? "invite failed" }, 500);
      userId = invited.user.id;
    }

    await admin.from("profiles").upsert({ id: userId!, email: cleanEmail }, { onConflict: "id" });

    if (kind === "agency") {
      // Grant agency_admin + account_manager, both scoped to this agency.
      // Also remove any stray rows on OTHER agencies so the user is strictly
      // scoped to a single agency for these roles.
      await admin.from("user_roles").delete()
        .eq("user_id", userId)
        .in("role", ["agency_admin", "account_manager"])
        .neq("agency_id", org_id);
      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert(
          [
            { user_id: userId, role: "agency_admin", agency_id: org_id },
            { user_id: userId, role: "account_manager", agency_id: org_id },
          ],
          { onConflict: "user_id,role" }
        );
      if (roleErr) return json({ error: roleErr.message }, 500);
    } else {
      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert({ user_id: userId, role: "brand_owner", brand_org_id: org_id }, { onConflict: "user_id,role" });
      if (roleErr) return json({ error: roleErr.message }, 500);
    }

    // For existing users: inviteUserByEmail wasn't called, so send a welcome
    // email with a password-recovery URL pointing at /reset-password so the
    // user explicitly (re)sets a password for this new org context. This
    // mirrors the fresh-invite flow and avoids silent magic-link sign-in
    // into a workspace they didn't know they had access to.
    let welcomeSent = false;
    let welcomeError: string | null = null;
    if (existed) {
      let signInUrl = setupUrl;
      try {
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: cleanEmail,
          options: { redirectTo: setupUrl },
        });
        if (linkData?.properties?.action_link) signInUrl = linkData.properties.action_link;
      } catch (_) { /* fall back to app url */ }

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
          idempotencyKey: `org-admin-welcome-${org_id}-${userId}-${Date.now()}`,
          templateData: { org_name: orgName, org_kind: kind, sign_in_url: signInUrl, app_url: appUrl },
        }),
      });
      if (!mailRes.ok) welcomeError = `${mailRes.status}: ${await mailRes.text()}`;
      else welcomeSent = true;
    }

    return json({ ok: true, user_id: userId, existed, invited: !existed, welcome_sent: welcomeSent, welcome_error: welcomeError });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
