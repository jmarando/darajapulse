import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Panel } from "@/components/dash/Panel";
import { toast } from "@/hooks/use-toast";
import { draftProblems, type Allowance, type Question, type Stimulus, type Study } from "@/lib/research";
import { cleanPanel, type PanelSpec } from "../../../supabase/functions/_shared/research-panel";
import { MAX_FULL_WATCH_PANEL, studyCost, type VideoMode } from "../../../supabase/functions/_shared/research-run";
import { TEMPLATES } from "../../../supabase/functions/_shared/research-templates";
import AudienceEditor from "./AudienceEditor";
import StimuliEditor from "./StimuliEditor";
import QuestionsEditor from "./QuestionsEditor";

const db = supabase as unknown as SupabaseClient;

export default function StudyEditor({ study, stimuli, questions, allowance, onChanged, onStarted }: {
  study: Study;
  stimuli: Stimulus[];
  questions: Question[];
  allowance: Allowance | null;
  onChanged: () => void;
  onStarted: () => void;
}) {
  const [title, setTitle] = useState(study.title);
  const [panel, setPanel] = useState<PanelSpec>(() => cleanPanel(study.panel));
  const [mode, setMode] = useState<VideoMode>(study.video_mode);
  const [starting, setStarting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The panel saves itself a moment after the last change.
  const changePanel = (next: PanelSpec) => {
    setPanel(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await db.from("research_studies").update({ panel: next, updated_at: new Date().toISOString() }).eq("id", study.id);
      if (error) toast({ title: "Couldn't save the audience", description: error.message, variant: "destructive" });
    }, 600);
  };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const hasVideo = stimuli.some((s) => s.kind === "video");
  const effectiveMode: VideoMode = mode === "full" && panel.size <= MAX_FULL_WATCH_PANEL ? "full" : "summary";
  const cost = studyCost({ respondents: panel.size, stimuli, videoMode: effectiveMode });
  const left = allowance ? Math.max(0, allowance.monthly_units - allowance.used) : null;
  const problems = draftProblems(stimuli, questions);
  const overBudget = left !== null && cost > left;

  const saveMode = async (next: VideoMode) => {
    setMode(next);
    await db.from("research_studies").update({ video_mode: next }).eq("id", study.id);
  };

  const run = async () => {
    setStarting(true);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      await db.from("research_studies").update({ panel }).eq("id", study.id);
    }
    const { data, error } = await supabase.functions.invoke("research-run", { body: { action: "start", study_id: study.id } });
    setStarting(false);
    if (error || data?.error) {
      toast({ title: "The study didn't start", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Study started", description: `${data.units} units used. Results fill in over the next few minutes.` });
    // Start work now rather than at the next minute; the page follows progress either way.
    supabase.functions.invoke("research-run", { body: { action: "process", study_id: study.id } });
    onStarted();
  };

  return (
    <div className="space-y-5">
      <Panel title="Study">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              if (!title.trim() || title === study.title) return;
              await db.from("research_studies").update({ title: title.trim().slice(0, 160) }).eq("id", study.id);
              onChanged();
            }}
            className="h-10 max-w-md text-[15px] font-medium"
            aria-label="Study name"
            maxLength={160}
          />
          <span className="text-[13px] text-muted-foreground">{TEMPLATES[study.template].label}: {TEMPLATES[study.template].description}</span>
        </div>
      </Panel>

      <Panel title="Who you're asking" subtitle="A synthetic panel drawn to these shares. The same people judge every option.">
        <AudienceEditor clientId={study.client_id} panel={panel} onChange={changePanel} />
      </Panel>

      <Panel title="What you're testing" subtitle="Written concepts, packs or ads as images, or videos. Each is shown to every respondent on its own.">
        <StimuliEditor clientId={study.client_id} studyId={study.id} stimuli={stimuli} template={study.template} onChanged={onChanged} />
      </Panel>

      <Panel title="What you're asking" subtitle="People answer in their own words; each answer is scored 1–5 by how close it reads to the scale's statements.">
        <QuestionsEditor studyId={study.id} questions={questions} onChanged={onChanged} />
      </Panel>

      {hasVideo && (
        <Panel title="How the panel sees videos">
          <RadioGroup value={effectiveMode} onValueChange={(v) => saveMode(v as VideoMode)} className="space-y-2">
            <label className="flex items-start gap-3 text-[13px]">
              <RadioGroupItem value="summary" className="mt-0.5" />
              <span><span className="font-medium">Watched once, described to everyone</span> (1 unit per person). The AI watches each video once and writes a neutral scene-by-scene account; respondents react to that plus key frames. Fast and cheap; tone and energy can come through flatter than on screen.</span>
            </label>
            <label className={`flex items-start gap-3 text-[13px] ${panel.size > MAX_FULL_WATCH_PANEL ? "opacity-50" : ""}`}>
              <RadioGroupItem value="full" className="mt-0.5" disabled={panel.size > MAX_FULL_WATCH_PANEL} />
              <span><span className="font-medium">Everyone watches it whole</span> (5 units per person, panels up to {MAX_FULL_WATCH_PANEL}). Closer to the real thing, slower and dearer. Falls back to the description if the AI can't take the video.</span>
            </label>
          </RadioGroup>
        </Panel>
      )}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-[13px]">
            <p><span className="font-medium">{cost.toLocaleString()} units</span> for {panel.size} people × {stimuli.length || 0} option{stimuli.length === 1 ? "" : "s"}{hasVideo ? " (plus 10 per video for its description)" : ""}.</p>
            {left !== null && (
              <p className={overBudget ? "text-destructive" : "text-muted-foreground"}>
                {left.toLocaleString()} of {allowance!.monthly_units.toLocaleString()} left this month.{overBudget ? " Use a smaller panel or fewer options, or ask Pulse to raise the allowance." : ""}
              </p>
            )}
            {problems.length > 0 && <ul className="mt-1 list-disc pl-5 text-muted-foreground">{problems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
          <Button onClick={run} disabled={starting || problems.length > 0 || overBudget}>
            <Play className="mr-2 h-4 w-4" aria-hidden />{starting ? "Starting…" : "Run study"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
