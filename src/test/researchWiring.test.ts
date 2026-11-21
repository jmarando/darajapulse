import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// research-run runs on Deno, which can't run here, so its decisions live in the _shared research modules (tested in
// researchSsr, researchPanel and researchRun) and these tests pin the wiring that matters most: who may call it, that a
// study is charged once and given back what it didn't use, and that users can't write what only the job may.
const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const fn = read("supabase/functions/research-run/index.ts");
const sql = read("supabase/migrations/20261121090000_consumer_research.sql");

describe("research-run: who may call", () => {
  it("checks the caller with its job key as the first thing its handler does", () => {
    expect(fn).toContain('requireCaller(req, { job: "research-run", anySignedIn: true })');
    expect(fn).toMatch(/Deno\.serve\(async \(req\) => \{\s*if \(req\.method === "OPTIONS"\)[^\n]*\n\s*try \{\s*const caller = await requireCaller\(/);
    expect(fn.indexOf("requireCaller(")).toBeLessThan(fn.indexOf("req.json()"));
  });

  it("checks a signed-in person can reach the brand, read from the study itself, before any action", () => {
    const handler = fn.slice(fn.indexOf("Deno.serve("));
    expect(handler).toMatch(/from\("research_studies"\)\.select\("client_id"\)\.eq\("id", studyId\)/);
    expect(handler.indexOf('rpc("can_access_research"')).toBeLessThan(handler.indexOf('action === "start"'));
  });

  it("is reached without Supabase's JWT gate, since the job and the function check callers themselves", () => {
    expect(read("supabase/config.toml")).toMatch(/\[functions\.research-run\]\s*\n\s*verify_jwt = false/);
  });
});

describe("research-run: charging", () => {
  const start = fn.slice(fn.indexOf("async function start("), fn.indexOf("async function cancel("));

  it("claims the draft before taking units, so two clicks can't charge twice", () => {
    expect(start.indexOf('.eq("status", "draft")')).toBeLessThan(start.indexOf('rpc("take_research_units"'));
  });

  it("puts the study back to draft when the allowance won't cover it, and gives units back if queuing fails", () => {
    expect(start).toMatch(/if \(!month\) \{\s*return back\(/);
    expect(start).toMatch(/catch \(e\) \{\s*await supabase\.rpc\("give_back_research_units"/);
  });

  it("runs template questions with the library's wording and anchors, and needs custom anchors approved", () => {
    expect(start).toContain("q.prompt = m.prompt; q.anchors = m.anchors;");
    expect(start).toContain("if (!q.anchors_approved_at)");
  });

  it("gives back units for answers that failed and for a cancelled study's unfinished work", () => {
    expect(fn).toMatch(/async function finishStudy[\s\S]*give_back_research_units/);
    expect(fn).toMatch(/async function cancel[\s\S]*in\("status", \["pending", "failed"\]\)[\s\S]*give_back_research_units/);
  });

  it("stops on a 402 or 429 from the gateway instead of burning retries", () => {
    expect(fn).toMatch(/if \(e instanceof GatewayPause\) \{\s*paused = e;/);
  });
});

describe("migration", () => {
  it("lets users write only what a draft is made of", () => {
    expect(sql).toContain("GRANT UPDATE (title, template, panel, video_mode, updated_at) ON public.research_studies TO authenticated;");
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE) \([^)]*(status|units_charged|summary)[^)]*\) ON public\.research_studies TO authenticated/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE) \([^)]*(account|anchor_embeddings)[^)]*\) ON public\.research_(stimuli|questions) TO authenticated/);
    expect(sql).toContain('CREATE POLICY "Research studies: edit draft" ON public.research_studies FOR UPDATE TO authenticated\n  USING (public.can_access_research(auth.uid(), client_id) AND status = \'draft\')');
  });

  it("keeps answers read-only for users and allowance changes to super admins", () => {
    expect(sql).toContain("GRANT SELECT ON public.research_respondents, public.research_responses TO authenticated;");
    expect(sql).toMatch(/"Research allowances: change"[\s\S]*is_super_admin\(auth\.uid\(\)\)/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.take_research_units\(uuid, integer\) FROM PUBLIC, anon, authenticated;/);
  });

  it("runs the job every minute through invoke_job_function with its own key", () => {
    expect(sql).toContain("INSERT INTO public.internal_job_keys(name) VALUES ('research-run')");
    expect(sql).toContain("cron.schedule('research-run-minutely', '* * * * *',\n  $$SELECT public.invoke_job_function('research-run', '{}'::jsonb)$$)");
  });

  it("keeps media private and under the brand's folder", () => {
    expect(sql).toMatch(/VALUES \('research-media', 'research-media', false,/);
    expect(sql).toContain("public.can_access_research(auth.uid(), public.research_media_client(name))");
  });
});

describe("navigation", () => {
  it("opens Research from the agency app and the brand portal", () => {
    expect(read("src/App.tsx")).toContain('<Route path="research" element={<Research />} />');
    expect(read("src/App.tsx")).toContain('<Route path="research" element={<PortalResearch />} />');
    expect(read("src/components/AppShell.tsx")).toContain('{ to: "/app/research", icon: FlaskConical, label: "Research" }');
    expect(read("src/components/PortalShell.tsx")).toContain('{ to: "/portal/research", icon: FlaskConical, label: "Research" }');
  });
});
