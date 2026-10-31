// What the groundwork-* functions share: the caller check, the agency they work in, the answer and the
// link lookup. groundwork-link.ts holds the checks and row shapes (pure, tested); this part needs Deno
// and the database.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCaller, SUPER_ADMIN } from "./auth.ts";
import { agencyProblem } from "./groundwork-link.ts";

export const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false },
});

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const NOT_LINKED = "No Pulse campaign is linked to this Groundwork campaign.";

/**
 * The start of every groundwork-* call. Groundwork presents the groundwork job key in x-job-key (a super
 * admin's login passes too). The call then works in one agency, the one GROUNDWORK_AGENCY_SLUG names,
 * and fails with a plain 503 when there is none: it never falls back to another agency.
 */
export async function openGroundworkCall(req: Request): Promise<Response | { body: unknown; agencyId: string }> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Send a POST." }, 405);
  const caller = await requireCaller(req, { job: "groundwork", roles: SUPER_ADMIN });
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => null);
  const slug = Deno.env.get("GROUNDWORK_AGENCY_SLUG")?.trim();
  const { data: agency } = slug
    ? await admin.from("agencies").select("id, is_active, is_suspended").eq("slug", slug).maybeSingle()
    : { data: null };
  const problem = agencyProblem(slug, agency);
  if (problem) return json({ error: problem }, 503);
  return { body, agencyId: agency!.id as string };
}

/** The Pulse campaign linked to a Groundwork campaign, in this agency only; null when there is none. */
export async function linkedCampaign(groundworkCampaignId: string, agencyId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("groundwork_links")
    .select("campaign_id")
    .eq("groundwork_campaign_id", groundworkCampaignId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.campaign_id as string | undefined) ?? null;
}

/** Every row of a query, a page at a time. PostgREST stops at 1,000, and a short answer would drop payouts without a word. */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
