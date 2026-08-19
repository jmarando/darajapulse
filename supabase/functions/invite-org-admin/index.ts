import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CANONICAL_APP_ORIGIN, setupUrlFrom } from "../_shared/app-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    if (!token) return json({ error: "unauthorized" }, 401);
    // Verify the JWT locally (getUser() fails when the session row was revoked
    // even though the access token is still valid/unexpired).
    let userId: string | null = null;
    const { data: claimsData } = await admin.auth.getClaims(token);
    userId = (claimsData as any)?.claims?.sub ?? null;
    if (!userId) {
      const { data: u } = await admin.auth.getUser(token);
      userId = u?.user?.id ?? null;
    }
    if (!userId) return json({ error: "unauthorized", detail: "invalid or expired session" }, 401);
    const u = { user: { id: userId } };
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("agency_admin") && !roleSet.has("super_admin")) {
      return json({ error: "forbidden" }, 403);
    }

    const body = await req.json();
    const { kind, org_id } = body;
    // Accept single email or list; also accept explicit role
    const rawEmails: string[] = Array.isArray(body.emails)
      ? body.emails
      : (body.email ? [body.email] : []);
    const emails = Array.from(new Set(
      rawEmails.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e))
    ));
    if (!emails.length || !org_id || (kind !== "agency" && kind !== "brand_org")) {
      return json({ error: "kind, org_id, and at least one valid email required" }, 400);
    }
    // Role: if not provided, default to full admin for the org kind
    const requestedRole: string | undefined = body.role;
    const validAgencyRoles = new Set(["agency_admin", "account_manager"]);
    const validBrandRoles = new Set(["brand_owner", "brand_viewer"]);
    if (requestedRole) {
      if (kind === "agency" && !validAgencyRoles.has(requestedRole)) return json({ error: "invalid role for agency" }, 400);
      if (kind === "brand_org" && !validBrandRoles.has(requestedRole)) return json({ error: "invalid role for brand_org" }, 400);
    }

    const appUrl = `${CANONICAL_APP_ORIGIN}/app`;
    const setupUrl = setupUrlFrom(appUrl);

    const table = kind === "agency" ? "agencies" : "brand_orgs";
    const { data: org } = await admin.from(table).select("name").eq("id", org_id).maybeSingle();
    const orgName = (org as any)?.name ?? (kind === "agency" ? "your agency" : "your brand");

    const { data: existing } = await admin.auth.admin.listUsers();
    const results: any[] = [];

    for (const cleanEmail of emails) {
      let userId: string | null = null;
      let existed = false;
      const found = existing?.users?.find((x: any) => (x.email ?? "").toLowerCase() === cleanEmail);
      if (found) {
        userId = found.id;
        existed = true;
      } else {
        const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
          redirectTo: setupUrl,
          data: { org_name: orgName, access_label: requestedRole || (kind === "agency" ? "agency admin" : "brand owner") },
        });
        if (invErr || !invited?.user) { results.push({ email: cleanEmail, error: invErr?.message ?? "invite failed" }); continue; }
        userId = invited.user.id;
      }

      await admin.from("profiles").upsert({ id: userId!, email: cleanEmail }, { onConflict: "id" });

      if (kind === "agency") {
        const rolesToGrant = requestedRole ? [requestedRole] : ["agency_admin", "account_manager"];
        // Only prune stray rows for the default full-admin path
        if (!requestedRole) {
          await admin.from("user_roles").delete()
            .eq("user_id", userId)
            .in("role", ["agency_admin", "account_manager"])
            .neq("agency_id", org_id);
        }
        const rows = rolesToGrant.map((role) => ({ user_id: userId, role, agency_id: org_id }));
        const { error: roleErr } = await admin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
        if (roleErr) { results.push({ email: cleanEmail, error: roleErr.message }); continue; }
      } else {
        const role = requestedRole || "brand_owner";
        const { error: roleErr } = await admin
          .from("user_roles")
          .upsert({ user_id: userId, role, brand_org_id: org_id }, { onConflict: "user_id,role" });
        if (roleErr) { results.push({ email: cleanEmail, error: roleErr.message }); continue; }
      }

      // Existing users keep their current password and receive a normal sign-in link.
      let welcomeSent = false;
      let welcomeError: string | null = null;
      if (existed) {
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
            idempotencyKey: `workspace-access-${org_id}-${userId}-${requestedRole || kind}`,
            templateData: { org_name: orgName, access_label: requestedRole || (kind === "agency" ? "agency admin" : "brand owner"), sign_in_url: `${CANONICAL_APP_ORIGIN}/auth` },
          }),
        });
        if (!mailRes.ok) welcomeError = `${mailRes.status}: ${await mailRes.text()}`;
        else welcomeSent = true;
      }

      results.push({ email: cleanEmail, user_id: userId, existed, invited: !existed, welcome_sent: welcomeSent, welcome_error: welcomeError });
    }

    return json({ ok: true, results });
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
