import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// listening-alerts runs on Deno, which cannot run here, so its decisions live in _shared/listening-alerts.ts
// (tested in listeningAlerts.test.ts) and these tests pin the wiring that matters most: who may call it, whose
// mail goes where, and that a failed send is tried again instead of being forgotten.
const supabase = resolve(__dirname, "../../supabase");
const read = (path: string) => readFileSync(resolve(supabase, path), "utf8");

describe("listening-alerts: who may call", () => {
  const fn = read("functions/listening-alerts/index.ts");

  it("checks the caller with the job key as the first thing its handler does", () => {
    expect(fn).toContain('requireCaller(req, { job: "listening-alerts" })');
    expect(fn).toMatch(
      /Deno\.serve\(async \(req\) => \{\s*if \(req\.method === "OPTIONS"\)[^\n]*\n\s*const caller = await requireCaller\(/,
    );
    expect(fn.indexOf("requireCaller(")).toBeLessThan(fn.indexOf("req.json()"));
  });

  it("lets a signed-in person do nothing but ask for a test of a brand they can read", () => {
    expect(fn).toMatch(/caller\.kind === "user"[\s\S]*body\?\.test !== true[\s\S]*can_access_listening/);
  });

  it("sends a test only to the signed-in person's own address, never to the saved recipients", () => {
    const test = fn.slice(fn.indexOf("async function sendTest"), fn.indexOf("async function runBrand"));
    expect(test).toMatch(/getUserById\(userId\)/);
    expect(test).toContain("recipientEmail: to");
    expect(test).not.toContain("recipients");
  });
});

describe("listening-alerts: whose mail goes where", () => {
  const fn = read("functions/listening-alerts/index.ts");

  it("works through brands whose rule is on, and skips a brand with no valid recipient", () => {
    expect(fn).toMatch(/listening_alert_rules[\s\S]*\.eq\("enabled", true\)/);
    expect(fn).toContain("EMAIL_OK.test(");
    expect(fn).toMatch(/if \(!recipients\.length\) return/);
  });

  it("reads a brand's keywords, posts and sent log by that brand's id only", () => {
    const brand = fn.slice(fn.indexOf("async function runBrand"));
    expect(brand).toMatch(/listening_topics[\s\S]*\.eq\("client_id", rule\.client_id\)/);
    expect(brand).toMatch(/listening_alert_log[\s\S]*\.eq\("client_id", rule\.client_id\)/);
    expect(fn).toMatch(/listening_mentions[\s\S]*\.eq\("client_id", clientId\)/);
  });

  it("sends through the app's mail with the listening-alert template", () => {
    expect(fn).toContain('from "../_shared/app-email.ts"');
    expect(fn).toContain('templateName: "listening-alert"');
  });

  it("writes the log only once every recipient was handled, so a failed send is tried again", () => {
    expect(fn).toMatch(/handled === recipients\.length[\s\S]*from\("listening_alert_log"\)\s*\.upsert/);
  });

  it("takes the job lock for a run over every brand, and gives it back", () => {
    expect(fn).toContain('rpc("take_job_lock"');
    expect(fn).toMatch(/finally \{\s*await supabase\.rpc\("release_job_lock"/);
  });
});

describe("the alert tables: who can read and write", () => {
  const sql = read("migrations/20261105090000_listening_alerts.sql");

  it("turns row security on for both tables and keeps anon out, and the log is the service role's alone", () => {
    expect(sql).toContain("ALTER TABLE public.listening_alert_rules ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.listening_alert_log ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.listening_alert_rules FROM anon;");
    expect(sql).toContain("REVOKE ALL ON public.listening_alert_log FROM anon, authenticated;");
  });

  it("starts every brand off, with nobody on the list and at most 10 addresses", () => {
    expect(sql).toMatch(/enabled\s+boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/recipients\s+text\[\] NOT NULL DEFAULT '\{\}'/);
    expect(sql).toMatch(/cardinality\(recipients\) <= 10/);
  });

  it("lets whoever can read a brand's Listening read its rule, and only agency staff change it", () => {
    expect(sql).toMatch(/"Listening alerts: read"[\s\S]*USING \(public\.can_access_listening\(auth\.uid\(\), client_id\)\)/);
    const staff = sql.slice(sql.indexOf("FUNCTION public.can_edit_listening_alerts"), sql.indexOf("$function$;"));
    expect(staff).toMatch(/'agency_admin', 'account_manager'/);
    expect(staff).not.toMatch(/user_has_client_access/);
    expect(sql).toMatch(/"Listening alerts: add"[\s\S]*WITH CHECK \(public\.can_edit_listening_alerts\(auth\.uid\(\), client_id\)\)/);
    expect(sql).toMatch(/"Listening alerts: edit"[\s\S]*USING \(public\.can_edit_listening_alerts[\s\S]*WITH CHECK \(public\.can_edit_listening_alerts/);
    expect(sql).toMatch(/"Listening alerts: remove"[\s\S]*USING \(public\.can_edit_listening_alerts/);
  });

  it("keeps one log row per brand and alert, so nothing is emailed twice", () => {
    expect(sql).toMatch(/UNIQUE \(client_id, key\)/);
  });

  it("has a job key and an hourly job at minute 40, after the sweep at minute 25", () => {
    expect(sql).toContain("INSERT INTO public.internal_job_keys(name) VALUES ('listening-alerts') ON CONFLICT (name) DO NOTHING;");
    expect(sql).toContain("cron.schedule('listening-alerts-hourly', '40 * * * *'");
    expect(sql).toContain("invoke_job_function('listening-alerts'");
  });

  it("says how to roll it back", () => {
    expect(sql).toMatch(/To roll back:[\s\S]*cron\.unschedule\('listening-alerts-hourly'\)/);
  });
});

describe("listening-alerts: registered", () => {
  it("is a function that checks its own caller, not the platform's JWT check", () => {
    expect(read("config.toml")).toMatch(/\[functions\.listening-alerts\]\s+verify_jwt = false/);
  });

  it("has its template in the registry", () => {
    const registry = read("functions/_shared/transactional-email-templates/registry.ts");
    expect(registry).toContain("import { template as listeningAlert } from './listening-alert.tsx'");
    expect(registry).toContain("'listening-alert': listeningAlert");
  });
});
