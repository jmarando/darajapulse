import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Copy, FlaskConical, Plus, Square, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/dash/PageHeader";
import { Panel } from "@/components/dash/Panel";
import {
  STUDY_STATUS_LABEL, loadResponses, removeUnused,
  type Allowance, type Question, type RespondentRow, type ResponseRow, type Stimulus, type Study,
} from "@/lib/research";
import { defaultPanel } from "../../../supabase/functions/_shared/research-panel";
import { MEASURES, TEMPLATES, type TemplateKey } from "../../../supabase/functions/_shared/research-templates";
import StudyEditor from "./StudyEditor";
import StudyResults from "./StudyResults";

type Brand = { id: string; name: string; country?: string | null };

// The research tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;
const NIL = "00000000-0000-0000-0000-000000000000";

/** A new draft: the brand's country panel and the template's standard questions. */
async function createStudy(brand: Brand, title: string, template: TemplateKey): Promise<string> {
  const { data, error } = await db.from("research_studies")
    .insert({ client_id: brand.id, title, template, panel: defaultPanel(brand.country) })
    .select("id").single();
  if (error) throw error;
  const rows = TEMPLATES[template].measures.map((key, position) => {
    const m = MEASURES[key];
    return { study_id: data.id, position, key: m.key, label: m.label, kind: m.kind, prompt: m.prompt, anchors: m.anchors, source: "template" };
  });
  const q = await db.from("research_questions").insert(rows);
  if (q.error) throw q.error;
  return data.id as string;
}

/** A finished study copied into a new draft with the same audience, options and questions. */
async function duplicateStudy(study: Study, stimuli: Stimulus[], questions: Question[]): Promise<string> {
  const { data, error } = await db.from("research_studies")
    .insert({ client_id: study.client_id, title: `${study.title} (copy)`.slice(0, 160), template: study.template, panel: study.panel, video_mode: study.video_mode })
    .select("id").single();
  if (error) throw error;
  if (stimuli.length) {
    const s = await db.from("research_stimuli").insert(stimuli.map((x) => ({
      study_id: data.id, position: x.position, label: x.label, kind: x.kind, body: x.body, price: x.price, media_path: x.media_path, frame_paths: x.frame_paths,
    })));
    if (s.error) throw s.error;
  }
  if (questions.length) {
    const q = await db.from("research_questions").insert(questions.map((x) => ({
      study_id: data.id, position: x.position, key: x.key, label: x.label, kind: x.kind, prompt: x.prompt, anchors: x.anchors, source: x.source,
      anchors_approved_at: x.anchors_approved_at,
    })));
    if (q.error) throw q.error;
  }
  return data.id as string;
}

/**
 * Consumer research for one brand: synthetic panels drawn to an audience react to concepts,
 * prices, ads and videos, scored with semantic similarity rating. Agency staff work on any of
 * their brands; brands signed directly run their own from the portal. Each brand spends from a
 * monthly allowance that super admins set.
 */
export default function ResearchPage({ portal = false }: { portal?: boolean }) {
  const { user, isSuperAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [creating, setCreating] = useState(false);
  const clientId = params.get("brand") ?? brands?.[0]?.id ?? null;
  const brand = brands?.find((b) => b.id === clientId) ?? null;
  const studyId = params.get("study");

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: key !== "study" });
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (portal) {
        const { data } = await supabase.from("client_members").select("client_id, clients(id, name, country)").eq("user_id", user.id);
        const list = ((data ?? []) as { clients: Brand | null }[]).map((r) => r.clients).filter((c): c is Brand => !!c);
        setBrands(list.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const { data } = await supabase.from("clients").select("id, name, country").order("name");
        setBrands((data ?? []) as Brand[]);
      }
    })();
  }, [user, portal]);

  const loadList = useCallback(async () => {
    if (!clientId) return;
    const [s, a] = await Promise.all([
      db.from("research_studies").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      db.rpc("research_allowance", { _client_id: clientId }),
    ]);
    if (s.error) toast({ title: "Couldn't load studies", description: s.error.message, variant: "destructive" });
    setStudies((s.data ?? []) as Study[]);
    setAllowance((a.data as Allowance | null) ?? null);
  }, [clientId]);

  useEffect(() => { setStudies(null); loadList(); }, [loadList]);

  if (brands && brands.length === 0) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:p-8">
        <PageHeader title="Consumer research" subtitle="Test concepts, prices, ads and videos on a synthetic consumer panel." />
        <Panel>
          <p className="text-sm text-muted-foreground">
            {portal ? "Your account isn't linked to a brand yet. Ask Pulse to invite you." : "Add a client first. Studies run per client brand; add a prospect as a client to test ideas for a pitch."}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:p-8">
      <PageHeader
        title="Consumer research"
        crumbs={studyId ? [{ label: "Consumer research", to: `?brand=${clientId ?? ""}` }, { label: studies?.find((s) => s.id === studyId)?.title ?? "Study" }] : undefined}
        subtitle={brand ? `Test concepts, prices, ads and videos for ${brand.name} on a synthetic panel of ${brand.country === "Uganda" ? "Ugandan" : "Kenyan"} consumers.` : "Test concepts, prices, ads and videos on a synthetic consumer panel."}
        actions={
          <>
            {brands && brands.length > 1 && !studyId && (
              <Select value={clientId ?? undefined} onValueChange={(v) => setParam("brand", v)}>
                <SelectTrigger className="h-9 w-[220px]" aria-label="Brand"><SelectValue placeholder="Pick a brand" /></SelectTrigger>
                <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {!studyId && brand && (
              <Button size="sm" className="h-9" onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" aria-hidden />New study</Button>
            )}
          </>
        }
      />

      {studyId ? (
        <StudyView
          key={studyId}
          studyId={studyId}
          allowance={allowance}
          onBack={() => { setParam("study", null); loadList(); }}
          onOpen={(id) => setParam("study", id)}
          onListChanged={loadList}
        />
      ) : (
        <div className="space-y-5">
          {allowance && <AllowanceBar clientId={clientId!} allowance={allowance} editable={isSuperAdmin && !portal} onChanged={loadList} />}
          {!studies ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : studies.length === 0 ? (
            <Panel>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <FlaskConical className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="max-w-md text-[14px]">Put two to five concepts, packs, prices, ads or videos in front of a synthetic panel of your audience and see which wins, and why.</p>
                <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" aria-hidden />New study</Button>
              </div>
            </Panel>
          ) : (
            <Panel title="Studies">
              <ul className="divide-y divide-border/50">
                {studies.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setParam("study", s.id)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/30">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{s.title}</span>
                        <span className="text-[12.5px] text-muted-foreground">
                          {TEMPLATES[s.template]?.label} · {s.panel?.size ?? "–"} people · {new Date(s.created_at).toLocaleDateString()}
                          {s.units_charged ? ` · ${s.units_charged - s.units_refunded} units` : ""}
                        </span>
                      </span>
                      <StatusBadge status={s.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <NewStudyDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (title, template) => {
          if (!brand) return;
          try {
            const id = await createStudy(brand, title, template);
            setCreating(false);
            setParam("study", id);
          } catch (e) {
            toast({ title: "Couldn't create the study", description: (e as Error).message, variant: "destructive" });
          }
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: Study["status"] }) {
  const tone = status === "done" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : status === "running" ? "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
    : status === "failed" ? "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
    : "bg-muted text-muted-foreground";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] ${tone}`}>{STUDY_STATUS_LABEL[status]}</span>;
}

function AllowanceBar({ clientId, allowance, editable, onChanged }: { clientId: string; allowance: Allowance; editable: boolean; onChanged: () => void }) {
  const [value, setValue] = useState(String(allowance.monthly_units));
  const used = Math.min(allowance.used, allowance.monthly_units);
  const share = allowance.monthly_units ? used / allowance.monthly_units : 1;
  const save = async () => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0) return;
    const { error } = await db.from("research_allowances").upsert({ client_id: clientId, monthly_units: n, updated_at: new Date().toISOString() });
    if (error) toast({ title: "Couldn't save the allowance", description: error.message, variant: "destructive" });
    else { toast({ title: "Allowance saved" }); onChanged(); }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border/70 px-4 py-3">
      <div className="min-w-[220px] flex-1">
        <p className="text-[13px]"><span className="font-medium">{allowance.used.toLocaleString()}</span> of {allowance.monthly_units.toLocaleString()} units used this month</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full ${share > 0.9 ? "bg-rose-500" : "bg-foreground/70"}`} style={{ width: `${share * 100}%` }} />
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">One unit is one person reacting to one option. Unused units don't roll over; units for answers that couldn't be collected come back.</p>
      </div>
      {editable && (
        <div className="flex items-center gap-2">
          <label htmlFor="allowance" className="text-[12.5px] text-muted-foreground">Monthly units</label>
          <Input id="allowance" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-[110px]" />
          <Button variant="outline" size="sm" className="h-9" onClick={save} disabled={value === String(allowance.monthly_units)}>Save</Button>
        </div>
      )}
    </div>
  );
}

function NewStudyDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (title: string, t: TemplateKey) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("concept");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New study</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="study-title" className="mb-1 block text-[13px] font-medium">Name</label>
            <Input id="study-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Toothpaste pack concepts, Nov" maxLength={160} />
          </div>
          <div className="space-y-2" role="radiogroup" aria-label="Kind of study">
            {(Object.values(TEMPLATES)).map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={template === t.key}
                onClick={() => setTemplate(t.key)}
                className={`w-full rounded-xl border p-3 text-left text-[13px] ${template === t.key ? "border-foreground" : "border-border/70 hover:bg-muted/30"}`}
              >
                <span className="block font-medium">{t.label}</span>
                <span className="text-muted-foreground">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => { setBusy(true); await onCreate(title.trim() || "Untitled study", template); setBusy(false); setTitle(""); }}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One study: its editor while it's a draft, its results after; follows a running study until it's done. */
function StudyView({ studyId, allowance, onBack, onOpen, onListChanged }: {
  studyId: string;
  allowance: Allowance | null;
  onBack: () => void;
  onOpen: (id: string) => void;
  onListChanged: () => void;
}) {
  const [study, setStudy] = useState<Study | null>(null);
  const [stimuli, setStimuli] = useState<Stimulus[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [respondents, setRespondents] = useState<RespondentRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const [s, st, q] = await Promise.all([
      db.from("research_studies").select("*").eq("id", studyId).maybeSingle(),
      db.from("research_stimuli").select("*").eq("study_id", studyId).order("position"),
      db.from("research_questions").select("id, study_id, position, key, label, kind, prompt, anchors, source, anchors_approved_at").eq("study_id", studyId).order("position"),
    ]);
    if (!s.data) { setMissing(true); return; }
    setStudy(s.data as Study);
    setStimuli((st.data ?? []) as Stimulus[]);
    setQuestions((q.data ?? []) as Question[]);
    if (s.data.status !== "draft") {
      const [r, resp] = await Promise.all([
        db.from("research_respondents").select("id, idx, profile").eq("study_id", studyId).order("idx").range(0, 999),
        loadResponses(db, studyId),
      ]);
      setRespondents((r.data ?? []) as RespondentRow[]);
      setResponses(resp);
    }
  }, [studyId]);

  useEffect(() => { load(); }, [load]);

  // While it runs, look again every few seconds; a failed look keeps what was shown.
  useEffect(() => {
    if (study?.status !== "running") return;
    const t = setInterval(() => { load().catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [study?.status, load]);

  if (missing) return <Panel><p className="text-sm text-muted-foreground">This study doesn't exist or you can't see it.</p></Panel>;
  if (!study) return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-[20px]" />)}</div>;

  const cancel = async () => {
    const { data, error } = await supabase.functions.invoke("research-run", { body: { action: "cancel", study_id: study.id } });
    if (error || data?.error) toast({ title: "Couldn't cancel", description: data?.error ?? error?.message, variant: "destructive" });
    else toast({ title: "Study cancelled", description: `${data.units_returned} units given back.` });
    load(); onListChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${study.title}"? Its answers go too.`)) return;
    const paths = stimuli.flatMap((s) => [s.media_path, ...(s.frame_paths ?? [])]).filter(Boolean) as string[];
    const { error } = await db.from("research_studies").delete().eq("id", study.id);
    if (error) { toast({ title: "Couldn't delete it", description: error.message, variant: "destructive" }); return; }
    if (paths.length) await removeUnused(db, paths, NIL);
    onBack();
  };

  const duplicate = async () => {
    try {
      onOpen(await duplicateStudy(study, stimuli, questions));
      onListChanged();
    } catch (e) {
      toast({ title: "Couldn't copy the study", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />All studies</Button>
        <StatusBadge status={study.status} />
        {study.status !== "draft" && (
          <span className="text-[12.5px] text-muted-foreground">
            {study.panel?.size} people · {study.units_charged - study.units_refunded} units{study.video_mode === "full" ? " · videos watched whole" : ""}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {study.status === "running" && <Button variant="outline" size="sm" onClick={cancel}><Square className="mr-1.5 h-3.5 w-3.5" aria-hidden />Cancel</Button>}
          {study.status !== "draft" && <Button variant="outline" size="sm" onClick={duplicate}><Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />Copy as new draft</Button>}
          {study.status !== "running" && <Button variant="ghost" size="sm" onClick={remove}><Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />Delete</Button>}
        </div>
      </div>
      {study.status === "draft" ? (
        <StudyEditor
          study={study}
          stimuli={stimuli}
          questions={questions}
          allowance={allowance}
          onChanged={load}
          onStarted={() => { load(); onListChanged(); }}
        />
      ) : (
        <>
          {questions.some((q) => q.source === "custom") && (
            <p className="text-[12.5px] text-muted-foreground"><Badge variant="outline" className="mr-1 text-[10.5px]">Untested</Badge> marks your own questions: their scales were drafted for this study and haven't been checked against real answers.</p>
          )}
          <StudyResults study={study} stimuli={stimuli} questions={questions} respondents={respondents} responses={responses} />
        </>
      )}
    </div>
  );
}
