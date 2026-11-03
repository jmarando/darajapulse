import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Edge functions run on Deno and migrations on the live database, neither of which can run here. Their decisions live
// in pure modules with their own tests; these pin the wiring that matters most: who may call, who may read, and that
// nothing spends or sends without passing its checks.
const supabase = resolve(__dirname, "../../supabase");
const read = (path: string) => (existsSync(resolve(supabase, path)) ? readFileSync(resolve(supabase, path), "utf8") : "");

describe("the brand channel tables: who can read and write", () => {
  const sql = read("migrations/20261106090000_brand_channels.sql");
  const tables = ["brand_channels", "brand_channel_days", "brand_posts", "brand_post_metrics", "brand_pull_credits"];

  it("turns row security on for every table and keeps anon out", () => {
    for (const table of tables) expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    expect(sql).toMatch(/REVOKE ALL ON public\.brand_channels, public\.brand_channel_days, public\.brand_posts, public\.brand_post_metrics, public\.brand_pull_credits FROM anon, authenticated;/);
  });

  it("lets a signed-in person add only a brand, a platform and a handle, so nobody can set source or status", () => {
    expect(sql).toContain("GRANT INSERT (client_id, platform, handle) ON public.brand_channels TO authenticated;");
    expect(sql).toContain("GRANT SELECT, DELETE ON public.brand_channels TO authenticated;");
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*brand_channels TO authenticated/);
  });

  it("writes daily lines, posts and readings through the service role only", () => {
    expect(sql).toContain("GRANT SELECT ON public.brand_channel_days, public.brand_posts, public.brand_post_metrics TO authenticated;");
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*brand_(channel_days|posts|post_metrics) TO authenticated/);
  });

  it("gives portal users reading and agency staff changing", () => {
    const view = sql.slice(sql.indexOf("FUNCTION public.can_view_brand_channels"), sql.indexOf("FUNCTION public.can_manage_brand_channels"));
    expect(view).toContain("public.user_has_client_access(_user_id, _client_id)");
    const manage = sql.slice(sql.indexOf("FUNCTION public.can_manage_brand_channels"));
    expect(manage.slice(0, manage.indexOf("$function$;"))).not.toContain("user_has_client_access");
    expect(sql).toMatch(/"Brand channels: read"[\s\S]*USING \(public\.can_view_brand_channels\(auth\.uid\(\), client_id\)\)/);
    expect(sql).toMatch(/"Brand channels: add"[\s\S]*WITH CHECK \(public\.can_manage_brand_channels\(auth\.uid\(\), client_id\)\)/);
    expect(sql).toMatch(/"Brand channels: remove"[\s\S]*USING \(public\.can_manage_brand_channels\(auth\.uid\(\), client_id\)\)/);
  });

  it("has a job key and a run every 15 minutes through the night's window", () => {
    expect(sql).toContain("INSERT INTO public.internal_job_keys(name) VALUES ('brand-channels-sync') ON CONFLICT (name) DO NOTHING;");
    expect(sql).toContain("cron.schedule('brand-channels-sync-nightly', '*/15 1-2 * * *'");
    expect(sql).toContain("invoke_job_function('brand-channels-sync'");
  });

  it("says how to roll it back", () => {
    expect(sql).toMatch(/To roll back:[\s\S]*cron\.unschedule\('brand-channels-sync-nightly'\)/);
  });
});

describe("the report rows", () => {
  const sql = read("migrations/20261106090000_brand_channels.sql");
  const fn = sql.slice(sql.indexOf("FUNCTION public.get_brand_report_rows"));

  it("checks access before reading anything", () => {
    expect(fn.indexOf("can_view_brand_channels(auth.uid(), _client_id)")).toBeGreaterThan(-1);
    expect(fn.indexOf("can_view_brand_channels(auth.uid(), _client_id)")).toBeLessThan(fn.indexOf("brand_report_doc(_client_id"));
  });

  it("cuts periods in Nairobi time, and refuses a period over a year", () => {
    expect(sql).toContain("AT TIME ZONE 'Africa/Nairobi'");
    expect(fn).toMatch(/_to - _from > 366/);
  });

  it("keeps the internal document away from signed-in people and visitors", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.brand_report_doc(uuid, date, date) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.brand_report_doc(uuid, date, date) TO service_role;");
  });

  it("leaves staff notes and who connected what out of the document, since visitors get the same one", () => {
    const doc = sql.slice(sql.indexOf("FUNCTION public.brand_report_doc"), sql.indexOf("FUNCTION public.get_brand_report_rows"));
    for (const secret of ["status_note", "connected_by", "created_by"]) expect(doc).not.toContain(secret);
  });
});
