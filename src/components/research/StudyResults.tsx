import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/dash/Panel";
import { downloadFile } from "@/lib/downloadFile";
import {
  fmtPct, fmtScore, progressOf, quotesFor, scoresFor, segmentTable,
  type Question, type RespondentRow, type ResponseRow, type Stimulus, type Study,
} from "@/lib/research";
import { SEGMENTS, type Respondent } from "../../../supabase/functions/_shared/research-panel";

const POINT_COLORS = ["#d9485f", "#f08c6c", "#c9c4bb", "#6fb3a8", "#2f8f83"];

export default function StudyResults({ study, stimuli, questions, respondents, responses }: {
  study: Study;
  stimuli: Stimulus[];
  questions: Question[];
  respondents: RespondentRow[];
  responses: ResponseRow[];
}) {
  const likert = questions.filter((q) => q.kind === "likert");
  const open = questions.filter((q) => q.kind === "open");
  const [qKey, setQKey] = useState(likert[0]?.key ?? "");
  const [segment, setSegment] = useState<keyof Respondent>("age_band");
  const [quoteStim, setQuoteStim] = useState(stimuli[0]?.id ?? "");
  const [quoteQ, setQuoteQ] = useState(questions[0]?.key ?? "");
  const [order, setOrder] = useState<"high" | "low">("high");

  const progress = progressOf(responses);
  const question = likert.find((q) => q.key === qKey) ?? likert[0];
  const board = useMemo(() => likert.map((q) => ({ q, scores: scoresFor(q.key, stimuli, responses) })), [likert, stimuli, responses]);
  const ranked = question ? board.find((b) => b.q.key === question.key)?.scores ?? [] : [];
  const seg = useMemo(() => (question ? segmentTable(question.key, segment, stimuli, responses, respondents) : null), [question, segment, stimuli, responses, respondents]);
  const quotes = useMemo(() => quotesFor(quoteQ, quoteStim, responses, respondents, order).slice(0, 40), [quoteQ, quoteStim, responses, respondents, order]);
  const segments = SEGMENTS.filter((s) => s.key !== "attitude" || respondents.some((r) => r.profile?.attitude));

  const exportCsv = () => {
    const who = new Map(respondents.map((r) => [r.id, r.profile]));
    const label = new Map(stimuli.map((s) => [s.id, s.label]));
    const head = ["respondent", "age", "gender", "region", "setting", "income", "language", "mindset", "option",
      ...questions.flatMap((q) => (q.kind === "likert" ? [`${q.label} score`, `${q.label} answer`] : [`${q.label} answer`]))];
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = responses.filter((r) => r.status === "done").map((r) => {
      const p = who.get(r.respondent_id);
      return [p?.name, p?.age, p?.gender, p?.region, p?.setting, p?.income, p?.language, p?.attitude, label.get(r.stimulus_id),
        ...questions.flatMap((q) => {
          const a = r.answers?.[q.key];
          return q.kind === "likert" ? [a?.score?.toFixed(2), a?.text] : [a?.text];
        })].map(cell).join(",");
    });
    const url = URL.createObjectURL(new Blob([[head.map(cell).join(","), ...lines].join("\n")], { type: "text/csv" }));
    downloadFile(url, `${study.title.replace(/[^\w-]+/g, "-")}-answers.csv`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="space-y-5">
      {study.status === "running" && (
        <Panel title="Collecting answers" subtitle={`${progress.done} of ${progress.total} answers in${progress.failed ? ` · ${progress.failed} couldn't be collected` : ""}. This page updates itself.`}>
          <Progress value={Math.round(progress.share * 100)} aria-label="Progress" />
          {study.error && <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-400">{study.error}</p>}
        </Panel>
      )}
      {study.status !== "running" && study.error && (
        <p className="rounded-xl border border-border/70 bg-muted/30 px-4 py-2 text-[13px] text-muted-foreground">{study.error}</p>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          These are synthetic respondents: AI personas drawn to your audience, who answer in their own words, scored 1–5 by semantic similarity to fixed statements.
          In published tests on real product concepts this ranked concepts close to how real panels did, which makes it good for comparing options and finding what holds people back.
          It hasn't been checked against Kenyan or Ugandan panels yet, and it doesn't predict sales. Confirm big decisions with real people.
        </p>
      </div>

      {study.summary && (
        <Panel title="What the panel said">
          <p className="mb-4 text-[14px] leading-relaxed">{study.summary.verdict}</p>
          {study.summary.changes.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-[13px] font-medium">Changes most likely to help</p>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px]">{study.summary.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {study.summary.stimuli.map((s, i) => (
              <div key={`${s.label}-${i}`} className="rounded-xl border border-border/70 p-3 text-[13px]">
                <p className="mb-2 font-medium">{s.label}</p>
                {s.likes.length > 0 && <><p className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">Liked</p><ul className="mb-2 list-disc pl-5">{s.likes.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
                {s.barriers.length > 0 && <><p className="text-[12px] font-medium text-rose-700 dark:text-rose-400">Held back by</p><ul className="mb-2 list-disc pl-5">{s.barriers.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
                {s.quotes.map((x, j) => <p key={j} className="mt-1 italic text-muted-foreground">“{x}”</p>)}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        title="Scores"
        subtitle="Mean on 1–5, with the share expected to answer 4 or 5. The best option on each question is marked."
        action={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!progress.done}><Download className="mr-2 h-4 w-4" aria-hidden />Answers CSV</Button>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-border/70 text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Question</th>
                {stimuli.map((s) => <th key={s.id} className="px-3 py-2 font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {board.map(({ q, scores }) => {
                const best = scores[0]?.mean ?? null;
                return (
                  <tr key={q.key} className="border-b border-border/40">
                    <td className="py-2 pr-3">
                      {q.label}
                      {q.source === "custom" && <Badge variant="outline" className="ml-2 text-[10.5px]">Untested</Badge>}
                    </td>
                    {stimuli.map((s) => {
                      const row = scores.find((x) => x.stimulus.id === s.id);
                      const isBest = best !== null && row?.mean === best && stimuli.length > 1;
                      return (
                        <td key={s.id} className={`px-3 py-2 tabular-nums ${isBest ? "font-semibold" : ""}`}>
                          {fmtScore(row?.mean)} <span className="text-muted-foreground">· {fmtPct(row?.agg?.top2)}</span>
                          {isBest && <span className="ml-1 text-emerald-700 dark:text-emerald-400" aria-label="Best">★</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {question && (
        <Panel
          title="How answers spread"
          subtitle="The panel's predicted share answering each point, from 1 (red) to 5 (green), with the 95% range of the mean."
          action={
            <Select value={question.key} onValueChange={setQKey}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Question"><SelectValue /></SelectTrigger>
              <SelectContent>{likert.map((q) => <SelectItem key={q.key} value={q.key}>{q.label}</SelectItem>)}</SelectContent>
            </Select>
          }
        >
          <div className="space-y-3">
            {ranked.map(({ stimulus, agg }) => (
              <div key={stimulus.id}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium">{stimulus.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmtScore(agg?.mean)}{agg?.ci95 ? ` (${fmtScore(agg.ci95[0])}–${fmtScore(agg.ci95[1])})` : ""} · n={agg?.n ?? 0}
                  </span>
                </div>
                <div className="flex h-5 overflow-hidden rounded-md bg-muted" role="img" aria-label={agg ? `Answers 1 to 5: ${agg.pmf.map((p) => fmtPct(p)).join(", ")}` : "No answers yet"}>
                  {agg?.pmf.map((p, i) => (
                    <div key={i} style={{ width: `${p * 100}%`, background: POINT_COLORS[i] }} title={`${i + 1}: ${fmtPct(p)}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {question && seg && seg.values.length > 0 && (
        <Panel
          title="By segment"
          subtitle={`Mean ${question.label.toLowerCase()} for each group. Small groups (n under 15) move a lot; read them as hints.`}
          action={
            <Select value={segment} onValueChange={(v) => setSegment(v as keyof Respondent)}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Segment"><SelectValue /></SelectTrigger>
              <SelectContent>{segments.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="border-b border-border/70 text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{segments.find((s) => s.key === segment)?.label}</th>
                  {stimuli.map((s) => <th key={s.id} className="px-3 py-2 font-medium">{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {seg.values.map((v) => (
                  <tr key={v} className="border-b border-border/40">
                    <td className="py-2 pr-3">{v}</td>
                    {stimuli.map((s) => {
                      const c = seg.cells[v][s.id];
                      return (
                        <td key={s.id} className={`px-3 py-2 tabular-nums ${c.n < 15 ? "text-muted-foreground" : ""}`}>
                          {fmtScore(c.mean)} <span className="text-[11.5px] text-muted-foreground">n={c.n}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="In their words"
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={quoteStim} onValueChange={setQuoteStim}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Option"><SelectValue /></SelectTrigger>
              <SelectContent>{stimuli.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={quoteQ} onValueChange={setQuoteQ}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Question"><SelectValue /></SelectTrigger>
              <SelectContent>{[...likert, ...open].map((q) => <SelectItem key={q.key} value={q.key}>{q.label}</SelectItem>)}</SelectContent>
            </Select>
            {questions.find((q) => q.key === quoteQ)?.kind === "likert" && (
              <Select value={order} onValueChange={(v) => setOrder(v as "high" | "low")}>
                <SelectTrigger className="h-9 w-[150px]" aria-label="Order"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Most positive first</SelectItem>
                  <SelectItem value="low">Most negative first</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        }
      >
        {quotes.length ? (
          <ul className="divide-y divide-border/50">
            {quotes.map((q, i) => (
              <li key={i} className="py-2.5 text-[13px]">
                <p>{q.text}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {q.respondent ? `${q.respondent.name}, ${q.respondent.age}, ${q.respondent.region} · ${q.respondent.income}` : "Respondent"}
                  {q.score !== null && <> · scored {fmtScore(q.score)}</>}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No answers here yet.</p>
        )}
      </Panel>

      {stimuli.some((s) => s.kind === "video" && s.account) && (
        <Panel title="How the videos were described to the panel">
          <div className="space-y-4">
            {stimuli.filter((s) => s.kind === "video" && s.account).map((s) => (
              <div key={s.id} className="text-[13px]">
                <p className="font-medium">
                  {s.label}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {s.account_source === "video" ? "watched with sound" : "from key frames and script; the AI couldn't take the video itself, so sound wasn't heard"}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{s.account}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
