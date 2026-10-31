// Listening alert emails: after each sweep, emails a brand's alert list when a negative post about the brand is
// spreading (the same Watch and Act the morning view shows), once per post per level. The decisions are in
// _shared/listening-alerts.ts; this reads the data, sends through the app's mail and keeps the log.
//
// Callers
//   - the hourly job (x-job-key "listening-alerts", minute 40): every brand whose rule is on
//   - agency staff ("Send me a test", body { client_id, test: true }): one sample email to the signed-in person
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendAppEmail } from "../_shared/app-email.ts";
import { denied, requireCaller } from "../_shared/auth.ts";
import { type AlertEmail, newAlerts, platformName } from "../_shared/listening-alerts.ts";
import { type BriefMention, type BriefTopic, morningView, views } from "../_shared/listening-brief.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const LOCK = "listening-alerts";
const SITE = "https://darajapulse.com";
const DAY = 86_400_000;
/** The morning view needs 8 days to judge a spike; one more keeps the edge in. */
const READ_DAYS = 9;
const PAGE = 1_000;
const MAX_PAGES = 6;
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Rule = { client_id: string; recipients: string[]; clients: { name: string } | null };

function alertData(email: AlertEmail, brandName: string, clientId: string, test = false) {
  return {
    test,
    subject: email.subject,
    brand_name: brandName,
    level: email.level,
    headline: email.headline,
    open_url: `${SITE}/app/listening?brand=${clientId}`,
    items: email.items.map((i) =>
      i.post
        ? { kind: "post", title: i.post.title?.trim() || "A post", platform: platformName(i.post.source), views: views(i.post.views), at: i.post.at, url: i.post.url }
        : { kind: "spike", text: `${i.spike!.now} negative posts in the last day, against about ${Math.max(1, Math.round(i.spike!.usual))} a day last week.` }
    ),
  };
}

/** The same email twice must not send twice, so a retry carries the same key. */
async function idempotencyKey(clientId: string, email: AlertEmail, to: string): Promise<string> {
  const bytes = new TextEncoder().encode([clientId, to, ...email.items.map((i) => i.key)].join("|"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** A brand's posts since a time, a page at a time (the API stops at 1,000 rows). */
async function readMentions(clientId: string, since: number): Promise<BriefMention[]> {
  const rows: BriefMention[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("listening_mentions")
      .select("id, topic_id, source, url, title, reach, published_at, found_at, sentiment, theme")
      .eq("client_id", clientId)
      .gte("found_at", new Date(since).toISOString())
      .order("found_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as BriefMention[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

async function sendTest(clientId: string, userId: string) {
  const { data: who } = await supabase.auth.admin.getUserById(userId);
  const to = who?.user?.email;
  if (!to) return { error: "Your account has no email address to send a test to." };
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
  const brandName = client?.name ?? "your brand";
  const sample: AlertEmail = {
    level: "watch",
    subject: `Test: a negative post about ${brandName} has 12k views`,
    headline: `A negative post about ${brandName} is picking up: 12k views.`,
    items: [{ key: "test", level: "watch", post: { title: "A sample post", source: "tiktok", views: 12_000, url: SITE, at: new Date().toISOString() } }],
  };
  await sendAppEmail({ templateName: "listening-alert", recipientEmail: to, templateData: alertData(sample, brandName, clientId, true) });
  return { sent: true };
}

async function runBrand(rule: Rule, now: number): Promise<{ emails: number; notes: string[] }> {
  const brandName = rule.clients?.name ?? "your brand";
  const recipients = [...new Set((rule.recipients ?? []).map((r) => r.trim().toLowerCase()).filter((r) => EMAIL_OK.test(r)))];
  if (!recipients.length) return { emails: 0, notes: [] };

  const { data: topics, error: topicErr } = await supabase
    .from("listening_topics").select("id, kind, label, active").eq("client_id", rule.client_id);
  if (topicErr) throw topicErr;
  const since = now - READ_DAYS * DAY;
  const mentions = await readMentions(rule.client_id, since);
  const view = morningView({ brandName, topics: (topics ?? []) as BriefTopic[], mentions, now, loadedFrom: since });

  const { data: logged, error: logErr } = await supabase
    .from("listening_alert_log").select("key").eq("client_id", rule.client_id)
    .gte("sent_at", new Date(now - 30 * DAY).toISOString());
  if (logErr) throw logErr;
  const email = newAlerts({ view, brandName, sent: new Set((logged ?? []).map((r: { key: string }) => r.key)), now });
  if (!email) return { emails: 0, notes: [] };

  const notes: string[] = [];
  let handled = 0;
  let delivered = 0;
  for (const to of recipients) {
    try {
      const out = await sendAppEmail({
        templateName: "listening-alert",
        recipientEmail: to,
        templateData: alertData(email, brandName, rule.client_id),
        idempotencyKey: await idempotencyKey(rule.client_id, email, to),
      });
      handled++;
      if (out.success) delivered++;
    } catch (e) {
      notes.push(`${brandName}: an alert email did not send (${String((e as Error).message ?? e).slice(0, 120)}).`);
    }
  }
  // Written only once every recipient has been dealt with, so a failed send is tried again next hour.
  if (handled === recipients.length) {
    const { error } = await supabase
      .from("listening_alert_log")
      .upsert(
        email.items.map((i) => ({ client_id: rule.client_id, key: i.key, level: i.level, recipients: delivered })),
        { onConflict: "client_id,key", ignoreDuplicates: true },
      );
    if (error) notes.push(`${brandName}: could not record what was sent (${error.message}).`);
  }
  return { emails: delivered, notes };
}

async function runAll(now: number) {
  const { data: rules, error } = await supabase
    .from("listening_alert_rules")
    .select("client_id, recipients, clients(name)")
    .eq("enabled", true);
  if (error) throw error;
  const result = { ran: true, brands: 0, emails: 0, notes: [] as string[] };
  for (const rule of (rules ?? []) as unknown as Rule[]) {
    try {
      const out = await runBrand(rule, now);
      result.brands++;
      result.emails += out.emails;
      result.notes.push(...out.notes);
    } catch (e) {
      result.notes.push(`${rule.clients?.name ?? rule.client_id}: ${String((e as Error).message ?? e).slice(0, 160)}`);
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "listening-alerts" });
  if (caller instanceof Response) return caller;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const clientId: string | null = typeof body?.client_id === "string" ? body.client_id : null;

    // A signed-in person may only ask for a test of a brand they can read; real sends are for the job.
    if (caller.kind === "user") {
      if (!clientId || body?.test !== true) return denied(403, "Ask for a test of a brand you can read.");
      const { data: ok } = await supabase.rpc("can_access_listening", { _user_id: caller.userId, _client_id: clientId });
      if (ok !== true) return denied(403, "You don't have access to this brand.");
      return json(await sendTest(clientId, caller.userId));
    }

    const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 170 });
    if (lockErr) throw lockErr;
    if (!locked) return json({ ran: false, note: "Another run is still going." });
    try {
      return json(await runAll(Date.now()));
    } finally {
      await supabase.rpc("release_job_lock", { _name: LOCK });
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
