import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The groundwork-* functions run on Deno, which cannot run here, so their logic lives in
// _shared/groundwork-link.ts (tested elsewhere) and these tests pin the wiring that matters most:
// who may call, which agency they work in, and that the new tables stay behind the service role.
const supabase = resolve(__dirname, "../../supabase");
const read = (path: string) => readFileSync(resolve(supabase, path), "utf8");

const FUNCTIONS = ["groundwork-brief", "groundwork-report", "groundwork-prospect"];

describe("the groundwork-* functions: who may call", () => {
  const call = read("functions/_shared/groundwork-call.ts");

  it("checks the caller with the groundwork job key, or a super admin, before it reads the body or the database", () => {
    expect(call).toContain('requireCaller(req, { job: "groundwork", roles: SUPER_ADMIN })');
    expect(call.indexOf("requireCaller(")).toBeLessThan(call.indexOf("req.json()"));
    expect(call.indexOf("requireCaller(")).toBeLessThan(call.indexOf(".from("));
  });

  it("works in the agency named by GROUNDWORK_AGENCY_SLUG and never falls back to another", () => {
    expect(call).toContain('Deno.env.get("GROUNDWORK_AGENCY_SLUG")');
    expect(call).toContain("agencyProblem(");
    expect(call).not.toMatch(/is_default/);
  });

  it("looks a link up in the agency only", () => {
    expect(call).toMatch(/groundwork_links[\s\S]*\.eq\("agency_id", agencyId\)/);
  });

  it.each(FUNCTIONS)("%s opens every call through that check as the first thing its handler does", (name) => {
    const src = read(`functions/${name}/index.ts`);
    expect(src).toContain('from "../_shared/groundwork-call.ts"');
    expect(src).toMatch(
      /Deno\.serve\(async \(req\) => \{\s*const call = await openGroundworkCall\(req\);\s*if \(call instanceof Response\) return call;/,
    );
    expect(src.slice(src.indexOf("Deno.serve"))).not.toContain("req.json()");
  });

  it.each(FUNCTIONS)("%s has a verify_jwt = false entry in config.toml, as the other checked functions do", (name) => {
    expect(read("config.toml")).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s*\\n\\s*verify_jwt = false`));
  });

  it.each(["groundwork-report", "groundwork-prospect"])("%s answers 404 when the campaign has no link", (name) => {
    const src = read(`functions/${name}/index.ts`);
    expect(src).toContain("linkedCampaign(");
    expect(src).toMatch(/NOT_LINKED[\s\S]{0,40}404|404[\s\S]{0,40}NOT_LINKED/);
  });

  it("never reads the job key, and logs no request", () => {
    for (const path of [...FUNCTIONS.map((n) => `functions/${n}/index.ts`), "functions/_shared/groundwork-call.ts"]) {
      const src = read(path);
      expect(src, path).not.toContain("internal_job_keys");
      expect(src, path).not.toContain("console.log");
    }
  });
});

describe("discovery-match", () => {
  const src = read("functions/discovery-match/index.ts");

  it("takes its off-topic rule from the brief, so only a political campaign keeps political creators", () => {
    expect(src).toContain("offTopicRule(isPolitical(brief))");
    expect(src).not.toContain("do NOT include a political/news creator for a food brief");
  });
});

describe("the migration", () => {
  const sql = read("migrations/20261103090000_groundwork_link.sql");

  it("makes the job key row, leaving the key to the table's own default", () => {
    expect(sql).toContain("INSERT INTO public.internal_job_keys(name) VALUES ('groundwork') ON CONFLICT (name) DO NOTHING;");
  });

  it("leaves every campaign that exists non-political", () => {
    expect(sql).toContain("political boolean NOT NULL DEFAULT false");
  });

  it.each(["groundwork_links", "groundwork_prospects"])("keeps %s to the service role", (table) => {
    expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toContain(`REVOKE ALL ON public.${table} FROM anon, authenticated;`);
    expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role;`);
    expect(sql).not.toMatch(new RegExp(`CREATE POLICY[^;]*${table}`));
  });

  it("holds a prospect to the four status words Groundwork keeps", () => {
    expect(sql).toContain("CHECK (status IN ('approached', 'invited', 'on_roster', 'declined'))");
  });
});
