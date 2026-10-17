// Caller checks for edge functions.
//
// verify_jwt only proves a request carries *some* project key, and the public
// anon key shipped in the web app passes it. Any function that spends credits,
// sends email or touches other tenants' data must check its caller itself:
//   - a scheduled job, presenting its key from internal_job_keys in x-job-key
//   - another edge function, presenting the service role key
//   - a signed-in user holding one of the allowed roles
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const STAFF_ROLES = ["agency_admin", "account_manager", "super_admin"];
export const SUPER_ADMIN = ["super_admin"];

export type Caller =
  | { kind: "job" }
  | { kind: "service" }
  | { kind: "user"; userId: string; roles: string[]; isSuperAdmin: boolean };

export interface CallerOptions {
  /** internal_job_keys name a scheduled job may present in x-job-key. */
  job?: string;
  /** Roles a signed-in user needs (any of). Defaults to agency staff. */
  roles?: string[];
}

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const denied = (status: 401 | 403, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Constant-time comparison, so a secret can't be recovered byte by byte. */
export function secretsMatch(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const bearerToken = (req: Request) =>
  (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

async function jobKeyMatches(req: Request, job: string): Promise<boolean> {
  const given = req.headers.get("x-job-key") ?? "";
  if (!given) return false;
  const { data } = await admin().from("internal_job_keys").select("key").eq("name", job).maybeSingle();
  return secretsMatch(given, data?.key ?? "");
}

/** Identifies the caller, or returns the 401/403 response to send back. */
export async function requireCaller(req: Request, opts: CallerOptions = {}): Promise<Caller | Response> {
  if (opts.job && (await jobKeyMatches(req, opts.job))) return { kind: "job" };
  const token = bearerToken(req);
  if (secretsMatch(token, SERVICE_KEY)) return { kind: "service" };
  if (!token) return denied(401, "Sign in required");

  const db = admin();
  const { data } = await db.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return denied(401, "Sign in required");
  const { data: rows } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = (rows ?? []).map((r: { role: string }) => r.role);
  const allowed = opts.roles ?? STAFF_ROLES;
  if (!roles.some((r) => allowed.includes(r))) return denied(403, "You don't have permission to do this.");
  return { kind: "user", userId, roles, isSuperAdmin: roles.includes("super_admin") };
}

/** Jobs and internal calls always pass; users must be staff of the campaign's agency or a super admin. */
export async function canManageCampaign(caller: Caller, campaignId: string): Promise<boolean> {
  if (caller.kind !== "user" || caller.isSuperAdmin) return true;
  const { data } = await admin().rpc("agency_staff_on_campaign", { _user_id: caller.userId, _campaign_id: campaignId });
  return data === true;
}

/** Jobs and internal calls always pass; users must be staff of the contest's agency or a super admin. */
export async function canManageContest(caller: Caller, contestId: string): Promise<boolean> {
  if (caller.kind !== "user" || caller.isSuperAdmin) return true;
  const { data } = await admin().rpc("agency_staff_on_contest", { _user_id: caller.userId, _contest_id: contestId });
  return data === true;
}

/** Super admins only, plus jobs and internal calls (for unscoped, all-tenant runs). */
export const isPlatformCaller = (caller: Caller) => caller.kind !== "user" || caller.isSuperAdmin;
