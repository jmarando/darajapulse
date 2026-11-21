import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { questionKey, type Question } from "@/lib/research";
import { MAX_CUSTOM_QUESTIONS, MEASURES, anchorsValid } from "../../../supabase/functions/_shared/research-templates";

const db = supabase as unknown as SupabaseClient;

/**
 * What the panel is asked. Template measures run with fixed wording and anchors so studies
 * stay comparable; custom questions need anchors a person has read and approved, and are
 * marked untested in results.
 */
export default function QuestionsEditor({ studyId, questions, onChanged }: {
  studyId: string;
  questions: Question[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const custom = questions.filter((q) => q.source === "custom");
  const unusedMeasures = Object.values(MEASURES).filter((m) => !questions.some((q) => q.key === m.key));

  const addCustom = async () => {
    const { error } = await db.from("research_questions").insert({
      study_id: studyId,
      position: questions.length,
      key: questionKey(label, questions.map((q) => q.key)),
      label: label.trim().slice(0, 80),
      kind: "likert",
      prompt: prompt.trim().slice(0, 400),
      anchors: [],
      source: "custom",
    });
    if (error) { toast({ title: "Couldn't add the question", description: error.message, variant: "destructive" }); return; }
    setLabel(""); setPrompt("");
    onChanged();
  };

  const addMeasure = async (key: string) => {
    const m = MEASURES[key];
    const { error } = await db.from("research_questions").insert({
      study_id: studyId, position: questions.length, key: m.key, label: m.label, kind: m.kind, prompt: m.prompt, anchors: m.anchors, source: "template",
    });
    if (error) toast({ title: "Couldn't add it", description: error.message, variant: "destructive" });
    onChanged();
  };

  const remove = async (q: Question) => {
    const { error } = await db.from("research_questions").delete().eq("id", q.id);
    if (error) toast({ title: "Couldn't remove it", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        q.source === "custom"
          ? <CustomQuestion key={q.id} question={q} onChanged={onChanged} onRemove={() => remove(q)} />
          : <TemplateQuestion key={q.id} question={q} onRemove={() => remove(q)} />
      ))}

      {unusedMeasures.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[13px] text-muted-foreground">Add a standard measure:</span>
          {unusedMeasures.map((m) => (
            <Button key={m.key} type="button" variant="outline" size="sm" className="h-8" onClick={() => addMeasure(m.key)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />{m.label}
            </Button>
          ))}
        </div>
      )}

      {custom.length < MAX_CUSTOM_QUESTIONS && (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="mb-2 text-[13px] font-medium">Add your own question</p>
          <div className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)_auto]">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Short name, e.g. Gifting" maxLength={80} className="h-9" aria-label="Question name" />
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Would you buy this as a gift for someone? Why?" maxLength={400} className="h-9" aria-label="Question" />
            <Button type="button" variant="outline" className="h-9" onClick={addCustom} disabled={label.trim().length < 2 || prompt.trim().length < 8}>Add</Button>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">Ask it so people answer in their own words. The AI then drafts five answers from most negative to most positive for you to check; those decide the score.</p>
        </div>
      )}
    </div>
  );
}

function TemplateQuestion({ question, onRemove }: { question: Question; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">{question.label} {question.kind === "open" && <span className="font-normal text-muted-foreground">· open answer, not scored</span>}</p>
          <p className="text-[12.5px] text-muted-foreground">{question.prompt}</p>
        </div>
        {question.kind === "likert" && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setOpen(!open)} aria-expanded={open}>
            Scale <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} aria-label={`Remove ${question.label}`}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && (
        <ol className="mt-2 space-y-0.5 pl-1 text-[12.5px] text-muted-foreground">
          {(question.anchors[0] ?? []).map((a, i) => <li key={i}><span className="mr-2 font-mono">{i + 1}</span>{a}</li>)}
        </ol>
      )}
    </div>
  );
}

function CustomQuestion({ question, onChanged, onRemove }: { question: Question; onChanged: () => void; onRemove: () => void }) {
  const [anchors, setAnchors] = useState<string[]>(question.anchors[0] ?? ["", "", "", "", ""]);
  const [drafting, setDrafting] = useState(false);
  const approved = !!question.anchors_approved_at;
  const valid = anchorsValid(anchors);

  const draft = async () => {
    setDrafting(true);
    const { data: study } = await db.from("research_studies").select("client_id").eq("id", question.study_id).maybeSingle();
    const { data, error } = await supabase.functions.invoke("research-run", {
      body: { action: "draft_anchors", client_id: study?.client_id, question: question.prompt },
    });
    setDrafting(false);
    if (error || data?.error || !Array.isArray(data?.anchors)) {
      toast({ title: "Couldn't draft the scale", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    setAnchors(data.anchors);
    await db.from("research_questions").update({ anchors: [data.anchors], anchors_approved_at: null }).eq("id", question.id);
    onChanged();
  };

  const saveAnchors = async (approve: boolean) => {
    const clean = anchors.map((a) => a.trim());
    const { error } = await db.from("research_questions")
      .update({ anchors: [clean], anchors_approved_at: approve ? new Date().toISOString() : null })
      .eq("id", question.id);
    if (error) toast({ title: "Couldn't save the scale", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">
            {question.label} <Badge variant="outline" className="ml-1 align-middle text-[11px]">Custom · untested</Badge>
          </p>
          <p className="text-[12.5px] text-muted-foreground">{question.prompt}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} aria-label={`Remove ${question.label}`}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 space-y-1.5">
        {anchors.map((a, i) => (
          <label key={i} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-4 font-mono text-muted-foreground">{i + 1}</span>
            <Input
              value={a}
              onChange={(e) => { const next = [...anchors]; next[i] = e.target.value; setAnchors(next); }}
              onBlur={() => { if (anchors.join("|") !== (question.anchors[0] ?? []).join("|")) saveAnchors(false); }}
              placeholder={i === 0 ? "Most negative answer" : i === 2 ? "Neutral or unsure" : i === 4 ? "Most positive answer" : ""}
              className="h-8"
              maxLength={200}
              aria-label={`Scale point ${i + 1}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={draft} disabled={drafting}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />{drafting ? "Drafting…" : anchors.some(Boolean) ? "Redraft scale" : "Draft scale"}
        </Button>
        {approved ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Scale approved</span>
        ) : (
          <Button type="button" size="sm" onClick={() => saveAnchors(true)} disabled={!valid}>Approve scale</Button>
        )}
        {!valid && <span className="text-[12px] text-muted-foreground">Five different statements, 1 most negative to 5 most positive.</span>}
      </div>
    </div>
  );
}
