// The monthly organic email: last month's headline numbers and most viewed post, with the share link, to each brand that
// has it switched on. The report's maths is _shared/organic-report.ts, so the email can't disagree with the page.
//
// Callers
//   - the monthly job (x-job-key "send-brand-report", hourly from 05:00 to 10:00 UTC on the 1st): every brand not yet sent
//   - agency staff ("Send me a test", body { client_id, test: true }): one email to the signed-in person
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendAppEmail } from "../_shared/app-email.ts";
import { denied, requireCaller } from "../_shared/auth.ts";
import { buildOrganicReport, lastFullMonth, monthlyEmailData, type ReportDoc } from "../_shared/organic-report.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const LOCK = "send-brand-report";
const SITE = "https://darajapulse.com";
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Month = ReturnType<typeof lastFullMonth>;
type Setting = { client_id: string; recipients: string[] };

/** The brand's one live share link, made if there is none. */
async function shareToken(clientId: string): Promise<string> {
  const live = () => supabase.from("brand_report_links").select("token").eq("client_id", clientId).eq("is_active", true).maybeSingle();
  const found = await live();
  if (found.error) throw found.error;
  if (found.data) return found.data.token as string;
  const { data, error } = await supabase.from("brand_report_links").insert({ client_id: clientId }).select("token").single();
  if (!error) return data.token as string;
  const again = await live();
  if (again.error || !again.data) throw again.error ?? error;
  return again.data.token as string;
}

async function emailFor(clientId: string, month: Month, now: number) {
  const { data: doc, error } = await supabase.rpc("brand_report_doc", { _client_id: clientId, _from: month.from, _to: month.to });
  if (error) throw error;
  const report = buildOrganicReport(doc as ReportDoc, now);
  return monthlyEmailData(report, { brandName: (doc as ReportDoc).client.name, monthLabel: month.label });
}

const shareUrl = async (clientId: string, month: Month) => `${SITE}/o/${await shareToken(clientId)}?from=${month.from}&to=${month.to}`;

/** The same email twice must not send twice, so a retry carries the same key. */
async function idempotencyKey(clientId: string, month: Month, to: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(["brand-report", clientId, month.from, to].join("|")));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

async function sendTest(clientId: string, userId: string, month: Month, now: number) {
  const { data: who } = await supabase.auth.admin.getUserById(userId);
  const to = who?.user?.email;
  if (!to) return { sent: false, error: "Your account has no email address to send a test to." };
  const data = await emailFor(clientId, month, now);
  if (data.skip) return { sent: false, error: `There's nothing to send yet: no numbers for ${month.label}.` };
  const out = await sendAppEmail({ templateName: "brand-organic-report", recipientEmail: to, templateData: { ...data, share_url: await shareUrl(clientId, month), test: true } });
  return out.success ? { sent: true } : { sent: false, error: "Your address is on the do-not-send list." };
}

async function sendBrand(setting: Setting, month: Month, now: number): Promise<{ emails: number; notes: string[] }> {
  const recipients = [...new Set((setting.recipients ?? []).map((r) => r.trim().toLowerCase()).filter((r) => EMAIL_OK.test(r)))];
  if (!recipients.length) return { emails: 0, notes: [] };
  const data = await emailFor(setting.client_id, month, now);
  if (data.skip) return { emails: 0, notes: [] };
  const url = await shareUrl(setting.client_id, month);

  const notes: string[] = [];
  let handled = 0;
  let delivered = 0;
  for (const to of recipients) {
    try {
      const out = await sendAppEmail({
        templateName: "brand-organic-report",
        recipientEmail: to,
        templateData: { ...data, share_url: url },
        idempotencyKey: await idempotencyKey(setting.client_id, month, to),
      });
      handled++;
      if (out.success) delivered++;
    } catch (e) {
      notes.push(`${data.brand_name}: an email did not send (${String((e as Error).message ?? e).slice(0, 120)}).`);
    }
  }
  // Written only once every recipient has been dealt with, so a failed send is tried again next hour.
  if (handled === recipients.length) {
    const { error } = await supabase.from("brand_report_sends").upsert({ client_id: setting.client_id, month: month.from, recipients: delivered }, { onConflict: "client_id,month", ignoreDuplicates: true });
    if (error) notes.push(`${data.brand_name}: could not record the send (${error.message}).`);
  }
  return { emails: delivered, notes };
}

async function runAll(month: Month, now: number) {
  const { data: settings, error } = await supabase.from("brand_report_settings").select("client_id, recipients").eq("monthly_email", true);
  if (error) throw error;
  const { data: sent, error: sentError } = await supabase.from("brand_report_sends").select("client_id").eq("month", month.from);
  if (sentError) throw sentError;
  const done = new Set((sent ?? []).map((r: { client_id: string }) => r.client_id));
  const result = { ran: true, brands: 0, emails: 0, notes: [] as string[] };
  for (const setting of (settings ?? []) as Setting[]) {
    if (done.has(setting.client_id)) continue;
    try {
      const out = await sendBrand(setting, month, now);
      result.brands++;
      result.emails += out.emails;
      result.notes.push(...out.notes);
    } catch (e) {
      result.notes.push(`${setting.client_id}: ${String((e as Error).message ?? e).slice(0, 160)}`);
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "send-brand-report" });
  if (caller instanceof Response) return caller;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const now = Date.now();
    const month = lastFullMonth(now);

    if (caller.kind === "user") {
      const clientId = typeof body?.client_id === "string" ? body.client_id : null;
      if (!clientId || body?.test !== true) return denied(403, "Ask for a test of a brand you manage.");
      const { data: allowed } = await supabase.rpc("can_manage_brand_channels", { _user_id: caller.userId, _client_id: clientId });
      if (allowed !== true) return denied(403, "You don't have access to this brand.");
      return json(await sendTest(clientId, caller.userId, month, now));
    }

    const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 170 });
    if (lockErr) throw lockErr;
    if (!locked) return json({ ran: false, note: "Another run is still going." });
    try {
      return json(await runAll(month, now));
    } finally {
      await supabase.rpc("release_job_lock", { _name: LOCK });
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
