// Consumer research: starts, runs and finishes synthetic-panel studies.
//
// Callers
//   - the minutely job (x-job-key "research-run"): works through every running study
//   - a signed-in user who can reach the brand (can_access_research), body { action, ... }:
//       start          { study_id }     check the draft, charge its units, draw the panel, queue the answers
//       cancel         { study_id }     stop a running study and give back the units of work not done
//       process        { study_id }     work on that study now rather than waiting for the minute
//       draft_anchors  { client_id, question }      AI-drafted anchors for a custom question, for a person to approve
//       parse_audience { client_id, description, country }  panel shares from a written audience, for a person to check
//
// How a study runs: each video gets one neutral written account (from the video itself, or from
// key frames when the gateway won't take it). Then every respondent sees every stimulus once and
// answers all its questions in their own words; each Likert answer is embedded and scored against
// its anchors (semantic similarity rating, _shared/research-ssr.ts). Answers are claimed in small
// batches so two runs never do the same one, retried up to three times, and units for work that
// never happened go back to the brand's month.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { denied, requireCaller } from "../_shared/auth.ts";
import { clip } from "../_shared/clip.ts";
import { countryOf } from "../_shared/listening-country.ts";
import { aggregate, ssrPmf, type Pmf } from "../_shared/research-ssr.ts";
import { MEASURES, MAX_STIMULI, anchorsValid } from "../_shared/research-templates.ts";
import { cleanPanel, drawPanel, personaPrompt, type Respondent } from "../_shared/research-panel.ts";
import {
  FRAMES_WATCH_PROMPT, MAX_FULL_WATCH_PANEL, SUMMARY_PROMPT, UNIT_PER_FULL_WATCH, UNIT_PER_VIDEO_ACCOUNT, UNIT_PER_VIEW,
  WATCH_PROMPT, anchorDraftPrompt, audiencePrompt, parseAnchors, parseAnswers, parseAudience, parseSummary,
  questionsText, spread, stimulusText, studyCost, type QuestionForRun, type StimulusKind, type VideoMode,
} from "../_shared/research-run.ts";
import { GatewayPause, GatewayRejected, dataUrl, gateway, type Part } from "../_shared/research-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const ai = gateway(LOVABLE_API_KEY);

const LOCK = "research-run";
/** Edge functions stop at 150 s; leave room to write what was done. */
const BUDGET_MS = 110_000;
const BATCH = 24;
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 3;
/** Videos larger than this go to the AI as key frames, not as a whole file. */
const MAX_INLINE_VIDEO_BYTES = 20 * 1024 * 1024;
const BUCKET = "research-media";
/** A study still running after this long is stopped and what's left is given back, so a stuck one can't spend forever. */
const GIVE_UP_MS = 6 * 3600_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Study = {
  id: string; client_id: string; title: string; template: string; status: string; panel: unknown;
  video_mode: VideoMode; units_charged: number; units_refunded: number; charged_month: string | null;
  summary: unknown; started_at: string | null; clients?: { name: string; country: string | null } | null;
};
type Stimulus = {
  id: string; study_id: string; position: number; label: string; kind: StimulusKind; body: string | null; price: string | null;
  media_path: string | null; frame_paths: string[]; account: string | null; account_source: "video" | "frames" | null;
};
type Question = {
  id: string; key: string; label: string; kind: "likert" | "open"; prompt: string; anchors: string[][];
  source: "template" | "custom"; anchors_approved_at: string | null;
  anchor_embeddings: { model: string; sets: number[][][] } | null;
};
type Answer = { text: string; pmf?: number[]; score?: number };

const STUDY_COLUMNS = "id, client_id, title, template, status, panel, video_mode, units_charged, units_refunded, charged_month, summary, started_at, clients(name, country)";

async function loadStudy(id: string): Promise<Study | null> {
  const { data, error } = await supabase.from("research_studies").select(STUDY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as Study | null;
}

async function loadParts(studyId: string) {
  const [s, q] = await Promise.all([
    supabase.from("research_stimuli").select("*").eq("study_id", studyId).order("position"),
    supabase.from("research_questions").select("*").eq("study_id", studyId).order("position"),
  ]);
  if (s.error) throw s.error;
  if (q.error) throw q.error;
  return { stimuli: (s.data ?? []) as Stimulus[], questions: (q.data ?? []) as Question[] };
}

/** What one respondent's view of a stimulus costs. */
const unitsPerView = (kind: StimulusKind, mode: VideoMode) =>
  kind === "video" && mode === "full" ? UNIT_PER_FULL_WATCH : UNIT_PER_VIEW;

// ---------------------------------------------------------------- media

const mediaCache = new Map<string, { bytes: Uint8Array; mime: string }>();

async function download(path: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const hit = mediaCache.get(path);
  if (hit) return hit;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Couldn't read ${path}: ${error?.message ?? "missing"}`);
  const out = { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || mimeOf(path) };
  // Keep images for the run; videos are large, so only the latest one.
  if (out.mime.startsWith("video/")) for (const k of [...mediaCache.keys()]) if (mediaCache.get(k)!.mime.startsWith("video/")) mediaCache.delete(k);
  mediaCache.set(path, out);
  return out;
}

function mimeOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

async function imagePart(path: string): Promise<Part> {
  const { bytes, mime } = await download(path);
  return { type: "image_url", image_url: { url: dataUrl(bytes, mime) } };
}

/** The video itself as a part, or null when it is too big to send whole. */
async function videoPart(path: string): Promise<Part | null> {
  const { data: info } = await supabase.storage.from(BUCKET).list(path.split("/").slice(0, -1).join("/"), { search: path.split("/").pop() });
  const size = Number((info?.[0] as { metadata?: { size?: number } } | undefined)?.metadata?.size ?? 0);
  if (size > MAX_INLINE_VIDEO_BYTES) return null;
  const { bytes, mime } = await download(path);
  if (bytes.length > MAX_INLINE_VIDEO_BYTES) return null;
  return { type: "video", dataUrl: dataUrl(bytes, mime) };
}

async function framesParts(s: Stimulus, max: number): Promise<Part[]> {
  const picks = spread(s.frame_paths ?? [], max);
  return Promise.all(picks.map(imagePart));
}

// ---------------------------------------------------------------- steps

/** Writes each video's neutral account once: from the video when the gateway takes it, else from frames and script. */
async function watchVideos(study: Study, stimuli: Stimulus[]): Promise<void> {
  for (const s of stimuli.filter((x) => x.kind === "video" && !x.account)) {
    const brand = study.clients?.name ?? "";
    const context = `Brand: ${brand}\nVideo: ${s.label}${s.body ? `\nScript or caption: ${s.body}` : ""}`;
    let account: string | null = null;
    let source: "video" | "frames" = "video";
    const video = s.media_path ? await videoPart(s.media_path) : null;
    if (video && ai.videoShape() !== "none") {
      try {
        const out = await ai.chatJson([
          { role: "system", content: `${WATCH_PROMPT} Reply with JSON only: {"account": "..."}` },
          { role: "user", content: [{ type: "text", text: context }, video] },
        ], { timeoutMs: 100_000 });
        account = readAccount(out);
      } catch (e) {
        if (!(e instanceof GatewayRejected)) throw e;
      }
    }
    if (!account) {
      source = "frames";
      const frames = await framesParts(s, 8);
      if (!frames.length && !s.body) throw new Error(`"${s.label}" has no key frames or script to describe.`);
      const out = await ai.chatJson([
        { role: "system", content: `${FRAMES_WATCH_PROMPT} Reply with JSON only: {"account": "..."}` },
        { role: "user", content: [{ type: "text", text: context }, ...frames] },
      ]);
      account = readAccount(out);
    }
    if (!account) throw new Error(`Couldn't describe "${s.label}".`);
    s.account = account;
    s.account_source = source;
    const { error } = await supabase.from("research_stimuli").update({ account: clip(account, 4000), account_source: source }).eq("id", s.id);
    if (error) throw error;
  }
}

function readAccount(out: unknown): string | null {
  try {
    const o = typeof out === "string" ? JSON.parse(out) : out;
    const a = (o as { account?: unknown })?.account;
    return typeof a === "string" && a.trim().length > 20 ? a.trim() : null;
  } catch {
    return null;
  }
}

/** Each Likert question's anchors, embedded by the same model the answers will be. */
async function anchorSets(questions: Question[], model: string | null): Promise<Map<string, number[][][]>> {
  const out = new Map<string, number[][][]>();
  for (const q of questions.filter((x) => x.kind === "likert")) {
    if (q.anchor_embeddings && (!model || q.anchor_embeddings.model === model)) {
      out.set(q.key, q.anchor_embeddings.sets);
      continue;
    }
    const flat = q.anchors.flat();
    const { model: used, vectors } = await ai.embed(flat);
    const sets = q.anchors.map((_, i) => vectors.slice(i * 5, i * 5 + 5));
    q.anchor_embeddings = { model: used, sets };
    out.set(q.key, sets);
    await supabase.from("research_questions").update({ anchor_embeddings: q.anchor_embeddings }).eq("id", q.id);
  }
  return out;
}

/** One respondent reacts to one stimulus: written answers, then each Likert answer scored against its anchors. */
async function answerOne(
  study: Study, stimulus: Stimulus, respondent: Respondent, questions: Question[],
): Promise<Record<string, Answer>> {
  const country = countryOf(study.clients?.country).code;
  const brand = study.clients?.name ?? "";
  const parts: Part[] = [{ type: "text", text: stimulusText(stimulus, brand, country) }];
  if (stimulus.kind === "image" && stimulus.media_path) parts.push(await imagePart(stimulus.media_path));
  if (stimulus.kind === "video") {
    let whole: Part | null = null;
    if (study.video_mode === "full" && stimulus.media_path && stimulus.account_source === "video") {
      whole = await videoPart(stimulus.media_path);
    }
    if (whole) parts.push(whole);
    else parts.push(...(await framesParts(stimulus, 4)));
  }
  const qs: QuestionForRun[] = questions.map((q) => ({ key: q.key, kind: q.kind, prompt: q.prompt }));
  parts.push({ type: "text", text: questionsText(qs) });

  const reply = await ai.chatJson([
    { role: "system", content: personaPrompt(respondent, country) },
    { role: "user", content: parts },
  ], { timeoutMs: 90_000 });
  const texts = parseAnswers(reply, qs);
  if (!texts) throw new Error("The respondent's reply was missing answers.");

  const likert = questions.filter((q) => q.kind === "likert");
  const { model, vectors } = await ai.embed(likert.map((q) => texts[q.key]));
  const sets = await anchorSets(likert, model);
  const out: Record<string, Answer> = {};
  for (const q of questions) out[q.key] = { text: texts[q.key] };
  likert.forEach((q, i) => {
    const pmf = ssrPmf(vectors[i], sets.get(q.key)!);
    out[q.key].pmf = pmf.map((x) => Math.round(x * 10000) / 10000);
    out[q.key].score = Math.round(pmf.reduce((s, x, j) => s + x * (j + 1), 0) * 1000) / 1000;
  });
  return out;
}

/** Runs up to n jobs at a time. */
async function pool<T>(items: T[], n: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

/** Works on one running study until it's done or the time is up. True when it finished. */
async function runStudy(study: Study, deadline: number): Promise<boolean> {
  const { stimuli, questions } = await loadParts(study.id);
  await watchVideos(study, stimuli);
  await anchorSets(questions, null);
  const byId = new Map(stimuli.map((s) => [s.id, s]));

  while (Date.now() < deadline) {
    const now = new Date().toISOString();
    const { data: open, error } = await supabase.from("research_responses")
      .select("id, respondent_id, stimulus_id, attempts")
      .eq("study_id", study.id).eq("status", "pending")
      .or(`claimed_until.is.null,claimed_until.lt.${now}`)
      .order("id").limit(BATCH);
    if (error) throw error;
    if (!open?.length) break;

    // Claim the batch so an overlapping run skips it.
    const claimUntil = new Date(Date.now() + 3 * 60_000).toISOString();
    const { data: claimed } = await supabase.from("research_responses")
      .update({ claimed_until: claimUntil })
      .in("id", open.map((r) => r.id)).eq("status", "pending")
      .or(`claimed_until.is.null,claimed_until.lt.${now}`)
      .select("id, respondent_id, stimulus_id, attempts");
    if (!claimed?.length) break;

    const { data: people } = await supabase.from("research_respondents").select("id, profile")
      .in("id", [...new Set(claimed.map((r) => r.respondent_id))]);
    const profiles = new Map((people ?? []).map((p) => [p.id as string, p.profile as Respondent]));

    let paused: GatewayPause | null = null;
    await pool(claimed, CONCURRENCY, async (row) => {
      if (paused || Date.now() > deadline) {
        await supabase.from("research_responses").update({ claimed_until: null }).eq("id", row.id);
        return;
      }
      try {
        const answers = await answerOne(study, byId.get(row.stimulus_id)!, profiles.get(row.respondent_id)!, questions);
        await supabase.from("research_responses").update({
          status: "done", answers, error: null, attempts: row.attempts + 1, claimed_until: null, updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      } catch (e) {
        if (e instanceof GatewayPause) {
          paused = e;
          await supabase.from("research_responses").update({ claimed_until: null }).eq("id", row.id);
          return;
        }
        const attempts = row.attempts + 1;
        await supabase.from("research_responses").update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts, error: clip((e as Error).message, 300), claimed_until: null, updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    });
    if (paused) {
      await supabase.from("research_studies").update({
        error: (paused as GatewayPause).status === 402 ? "Paused: the AI workspace is out of credits. It carries on once they're topped up." : null,
      }).eq("id", study.id);
      throw paused;
    }
  }

  const { count: left } = await supabase.from("research_responses")
    .select("id", { count: "exact", head: true }).eq("study_id", study.id).eq("status", "pending");
  if ((left ?? 0) > 0) return false;
  await finishStudy(study, stimuli, questions);
  return true;
}

/** Writes the read-out, gives back units for answers that failed, and closes the study. */
async function finishStudy(study: Study, stimuli: Stimulus[], questions: Question[]) {
  const rows = await allResponses(study.id);
  const done = rows.filter((r) => r.status === "done");
  const failed = rows.filter((r) => r.status === "failed");
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  const refund = failed.reduce((n, r) => n + unitsPerView(byId.get(r.stimulus_id)?.kind ?? "text", study.video_mode), 0);

  let summary = null;
  if (done.length) {
    const likert = questions.filter((q) => q.kind === "likert");
    const quoteKeys = [likert[0]?.key, ...questions.filter((q) => q.kind === "open").map((q) => q.key)].filter(Boolean) as string[];
    const input = {
      brand: study.clients?.name ?? "",
      stimuli: stimuli.map((s) => {
        const mine = done.filter((r) => r.stimulus_id === s.id);
        const scores: Record<string, number | null> = {};
        for (const q of likert) {
          const agg = aggregate(mine.map((r) => ({ pmf: (r.answers?.[q.key]?.pmf ?? []) as Pmf })));
          scores[q.label] = agg ? Math.round(agg.mean * 100) / 100 : null;
        }
        const quotes = spread(mine, 14).flatMap((r) => quoteKeys.map((k) => clip(r.answers?.[k]?.text ?? "", 240)).filter(Boolean) as string[]);
        return { label: s.label, scores, quotes };
      }),
    };
    try {
      summary = parseSummary(await ai.chatJson([
        { role: "system", content: SUMMARY_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ], { timeoutMs: 90_000 }));
    } catch (e) {
      if (e instanceof GatewayPause) throw e;
      summary = null;
    }
  }
  if (refund > 0 && study.charged_month) {
    await supabase.rpc("give_back_research_units", { _client_id: study.client_id, _month: study.charged_month, _units: refund });
  }
  await supabase.from("research_studies").update({
    status: done.length ? "done" : "failed",
    summary,
    units_refunded: study.units_refunded + refund,
    error: done.length ? (failed.length ? `${failed.length} of ${rows.length} answers couldn't be collected; their units were given back.` : null)
      : "No answers could be collected; the units were given back.",
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", study.id).eq("status", "running");
}

/** Marks what's left of a stuck study as failed, then closes it as usual (which gives back those units). */
async function giveUp(study: Study) {
  await supabase.from("research_responses").update({ status: "failed", error: "Stopped: the study ran too long." })
    .eq("study_id", study.id).eq("status", "pending");
  const { stimuli, questions } = await loadParts(study.id);
  const unwatched = stimuli.filter((s) => s.kind === "video" && !s.account).length * UNIT_PER_VIDEO_ACCOUNT;
  if (unwatched && study.charged_month) {
    await supabase.rpc("give_back_research_units", { _client_id: study.client_id, _month: study.charged_month, _units: unwatched });
    study.units_refunded += unwatched;
  }
  await finishStudy(study, stimuli, questions);
}

async function allResponses(studyId: string) {
  const out: { id: string; stimulus_id: string; status: string; answers: Record<string, Answer> | null }[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase.from("research_responses").select("id, stimulus_id, status, answers")
      .eq("study_id", studyId).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as typeof out));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------- user actions

/** Checks a draft, charges it and queues its answers. */
async function start(studyId: string): Promise<Response> {
  const study = await loadStudy(studyId);
  if (!study) return json({ error: "Study not found." }, 404);
  if (study.status !== "draft") return json({ error: "This study has already been run." }, 409);
  const { stimuli, questions } = await loadParts(study.id);

  if (!stimuli.length) return json({ error: "Add at least one thing to test." }, 400);
  if (stimuli.length > MAX_STIMULI) return json({ error: `Test at most ${MAX_STIMULI} things in one study.` }, 400);
  for (const s of stimuli) {
    if ((s.kind === "image" || s.kind === "video") && !s.media_path) return json({ error: `"${s.label}" needs its ${s.kind}.` }, 400);
    if (s.kind === "text" && !s.body?.trim()) return json({ error: `"${s.label}" needs a description.` }, 400);
    // Key frames are the fallback when the AI can't take the video itself, so a video needs them or a script.
    if (s.kind === "video" && !s.frame_paths?.length && !s.body?.trim()) return json({ error: `"${s.label}" needs key frames or a script; upload the video again.` }, 400);
  }
  if (!questions.some((q) => q.kind === "likert")) return json({ error: "Ask at least one rated question." }, 400);
  for (const q of questions) {
    if (q.source === "template") {
      const m = MEASURES[q.key];
      if (!m) return json({ error: `"${q.label}" isn't a known measure.` }, 400);
      // Template questions always run with the library's wording and anchors, so studies stay comparable.
      q.prompt = m.prompt; q.anchors = m.anchors; q.kind = m.kind;
      await supabase.from("research_questions").update({ prompt: m.prompt, anchors: m.anchors, kind: m.kind, anchor_embeddings: null }).eq("id", q.id);
    } else if (q.kind === "likert") {
      if (!Array.isArray(q.anchors) || !q.anchors.length || !q.anchors.every(anchorsValid)) {
        return json({ error: `"${q.label}" needs five different anchor statements.` }, 400);
      }
      if (!q.anchors_approved_at) return json({ error: `Approve the anchors for "${q.label}" first.` }, 400);
    }
  }
  const panel = cleanPanel({ ...(study.panel as object), country: countryOf(study.clients?.country).code });
  const mode: VideoMode = study.video_mode === "full" && panel.size <= MAX_FULL_WATCH_PANEL ? "full" : "summary";
  const cost = studyCost({ respondents: panel.size, stimuli, videoMode: mode });

  // Claim the draft first, so two clicks can't charge twice.
  const { data: claimed } = await supabase.from("research_studies")
    .update({ status: "running", panel, video_mode: mode, started_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
    .eq("id", study.id).eq("status", "draft").select("id");
  if (!claimed?.length) return json({ error: "This study has already been run." }, 409);

  const back = async (msg: string, status = 400) => {
    await supabase.from("research_studies").update({ status: "draft", started_at: null }).eq("id", study.id);
    return json({ error: msg }, status);
  };
  const { data: month, error: takeErr } = await supabase.rpc("take_research_units", { _client_id: study.client_id, _units: cost });
  if (takeErr) return back(takeErr.message, 500);
  if (!month) {
    return back(`This study needs ${cost} units, which is more than this brand has left this month. Ask Pulse to raise the allowance, or use a smaller panel.`, 402);
  }

  try {
    const people = drawPanel(panel, study.id);
    const { data: inserted, error: pErr } = await supabase.from("research_respondents")
      .insert(people.map((p) => ({ study_id: study.id, idx: p.idx, profile: p }))).select("id");
    if (pErr) throw pErr;
    const rows = (inserted ?? []).flatMap((p) => stimuli.map((s) => ({ study_id: study.id, respondent_id: p.id, stimulus_id: s.id })));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("research_responses").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
    await supabase.from("research_studies").update({ units_charged: cost, charged_month: month }).eq("id", study.id);
  } catch (e) {
    await supabase.rpc("give_back_research_units", { _client_id: study.client_id, _month: month, _units: cost });
    await supabase.from("research_responses").delete().eq("study_id", study.id);
    await supabase.from("research_respondents").delete().eq("study_id", study.id);
    return back(`Couldn't start the study: ${(e as Error).message}`, 500);
  }
  return json({ started: true, units: cost, video_mode: mode });
}

/** Stops a running study and gives back the units of everything not yet done. */
async function cancel(studyId: string): Promise<Response> {
  const study = await loadStudy(studyId);
  if (!study) return json({ error: "Study not found." }, 404);
  if (study.status !== "running") return json({ error: "Only a running study can be cancelled." }, 409);
  const { data: stopped } = await supabase.from("research_studies")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", study.id).eq("status", "running").select("id");
  if (!stopped?.length) return json({ error: "The study has already finished." }, 409);
  const { stimuli } = await loadParts(study.id);
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  const { data: open } = await supabase.from("research_responses").select("stimulus_id")
    .eq("study_id", study.id).in("status", ["pending", "failed"]);
  let refund = (open ?? []).reduce((n, r) => n + unitsPerView(byId.get(r.stimulus_id)?.kind ?? "text", study.video_mode), 0);
  refund += stimuli.filter((s) => s.kind === "video" && !s.account).length * UNIT_PER_VIDEO_ACCOUNT;
  await supabase.from("research_responses").update({ status: "failed", error: "Cancelled" }).eq("study_id", study.id).eq("status", "pending");
  if (refund > 0 && study.charged_month) {
    await supabase.rpc("give_back_research_units", { _client_id: study.client_id, _month: study.charged_month, _units: refund });
  }
  await supabase.from("research_studies").update({ units_refunded: study.units_refunded + refund }).eq("id", study.id);
  return json({ cancelled: true, units_returned: refund });
}

async function draftAnchors(question: string): Promise<Response> {
  const q = question.trim();
  if (q.length < 5 || q.length > 400) return json({ error: "Write the question in a sentence first." }, 400);
  for (let i = 0; i < 2; i++) {
    const anchors = parseAnchors(await ai.chatJson([{ role: "user", content: anchorDraftPrompt(q) }]));
    if (anchors) return json({ anchors });
  }
  return json({ error: "Couldn't draft anchors for that question. Try rewording it." }, 502);
}

async function fillAudience(description: string, country: string | null): Promise<Response> {
  const d = description.trim();
  if (d.length < 5 || d.length > 600) return json({ error: "Describe the audience in a sentence or two." }, 400);
  const code = countryOf(country).code;
  const parsed = parseAudience(await ai.chatJson([{ role: "user", content: audiencePrompt(d, code) }]));
  if (!parsed) return json({ error: "Couldn't read that audience. Try describing it differently." }, 502);
  return json({ panel: cleanPanel({ ...parsed, country: code, description: d }) });
}

// ---------------------------------------------------------------- the run

async function runQueue(onlyStudy: string | null): Promise<Response> {
  const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 140 });
  if (lockErr) throw lockErr;
  if (!locked) return json({ ran: false, note: "Another run is working; it will pick this up." });
  const deadline = Date.now() + BUDGET_MS;
  const result = { ran: true, studies: 0, finished: 0, notes: [] as string[] };
  try {
    let q = supabase.from("research_studies").select(STUDY_COLUMNS).eq("status", "running").order("started_at").limit(10);
    if (onlyStudy) q = q.eq("id", onlyStudy);
    const { data: running, error } = await q;
    if (error) throw error;
    for (const study of (running ?? []) as unknown as Study[]) {
      if (Date.now() > deadline) break;
      result.studies++;
      try {
        if (study.started_at && Date.now() - Date.parse(study.started_at) > GIVE_UP_MS) {
          await giveUp(study);
          result.notes.push(`${study.title}: stopped after ${GIVE_UP_MS / 3600_000} hours`);
          continue;
        }
        if (await runStudy(study, deadline)) result.finished++;
      } catch (e) {
        if (e instanceof GatewayPause) { result.notes.push(e.message); break; }
        const msg = clip((e as Error).message, 300);
        result.notes.push(`${study.title}: ${msg}`);
        await supabase.from("research_studies").update({ error: msg }).eq("id", study.id);
      }
    }
  } finally {
    await supabase.rpc("release_job_lock", { _name: LOCK });
  }
  return json(result);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await requireCaller(req, { job: "research-run", anySignedIn: true });
    if (caller instanceof Response) return caller;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (!LOVABLE_API_KEY) return json({ error: "The AI gateway is not connected." }, 503);
    if (caller.kind !== "user") return await runQueue(null);

    const action = String(body?.action ?? "");
    const studyId = typeof body?.study_id === "string" ? body.study_id : null;
    let clientId = typeof body?.client_id === "string" ? body.client_id : null;
    if (studyId) {
      const { data: s } = await supabase.from("research_studies").select("client_id").eq("id", studyId).maybeSingle();
      if (!s) return json({ error: "Study not found." }, 404);
      clientId = s.client_id;
    }
    if (!clientId) return denied(403, "Pick a brand first.");
    const { data: ok } = await supabase.rpc("can_access_research", { _user_id: caller.userId, _client_id: clientId });
    if (ok !== true) return denied(403, "You don't have access to this brand.");

    if (action === "start" && studyId) return await start(studyId);
    if (action === "cancel" && studyId) return await cancel(studyId);
    if (action === "process" && studyId) return await runQueue(studyId);
    if (action === "draft_anchors") return await draftAnchors(String(body?.question ?? ""));
    if (action === "parse_audience") {
      const { data: c } = await supabase.from("clients").select("country").eq("id", clientId).maybeSingle();
      return await fillAudience(String(body?.description ?? ""), c?.country ?? null);
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    if (e instanceof GatewayPause) return json({ error: e.status === 402 ? "The AI workspace is out of credits." : "The AI is busy; try again in a minute." }, e.status);
    console.error("research-run", e);
    return json({ error: (e as Error).message }, 500);
  }
});
