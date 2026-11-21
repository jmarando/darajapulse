// Consumer research on the page: the study's rows, its results worked out from the panel's
// scored answers (with the same SSR maths the job uses), and the browser-side helpers for
// uploading images and videos (a video's key frames are taken here, at upload, so the job has
// them if the AI can't take the video itself).
import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregate, rankByMean, type Aggregate, type Pmf } from "../../supabase/functions/_shared/research-ssr";
import type { Respondent } from "../../supabase/functions/_shared/research-panel";
import type { PanelSpec } from "../../supabase/functions/_shared/research-panel";
import type { StudySummary, StimulusKind, VideoMode } from "../../supabase/functions/_shared/research-run";

export type StudyStatus = "draft" | "running" | "done" | "failed" | "cancelled";

export type Study = {
  id: string;
  client_id: string;
  title: string;
  template: "concept" | "ad" | "price" | "custom";
  status: StudyStatus;
  panel: PanelSpec;
  video_mode: VideoMode;
  units_charged: number;
  units_refunded: number;
  summary: StudySummary | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type Stimulus = {
  id: string;
  study_id: string;
  position: number;
  label: string;
  kind: StimulusKind;
  body: string | null;
  price: string | null;
  media_path: string | null;
  frame_paths: string[];
  account: string | null;
  account_source: "video" | "frames" | null;
};

export type Question = {
  id: string;
  study_id: string;
  position: number;
  key: string;
  label: string;
  kind: "likert" | "open";
  prompt: string;
  anchors: string[][];
  source: "template" | "custom";
  anchors_approved_at: string | null;
};

export type Answer = { text: string; pmf?: number[]; score?: number };

export type ResponseRow = {
  id: string;
  respondent_id: string;
  stimulus_id: string;
  status: "pending" | "done" | "failed";
  answers: Record<string, Answer> | null;
  error: string | null;
};

export type RespondentRow = { id: string; idx: number; profile: Respondent };

export type Allowance = { month: string; monthly_units: number; used: number };

export const STUDY_STATUS_LABEL: Record<StudyStatus, string> = {
  draft: "Draft",
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------- results

export type Progress = { total: number; done: number; failed: number; pending: number; share: number };

export function progressOf(rows: Pick<ResponseRow, "status">[]): Progress {
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const total = rows.length;
  return { total, done, failed, pending: total - done - failed, share: total ? (done + failed) / total : 0 };
}

export type StimulusScore = { stimulus: Stimulus; agg: Aggregate | null; mean: number | null };

/** Each stimulus's panel result on one Likert question, best first. */
export function scoresFor(questionKey: string, stimuli: Stimulus[], rows: ResponseRow[]): StimulusScore[] {
  return rankByMean(stimuli.map((stimulus) => {
    const agg = aggregate(rows
      .filter((r) => r.status === "done" && r.stimulus_id === stimulus.id)
      .map((r) => ({ pmf: (r.answers?.[questionKey]?.pmf ?? []) as Pmf })));
    return { stimulus, agg, mean: agg?.mean ?? null };
  }));
}

export type SegmentCell = { mean: number | null; n: number };
export type SegmentTable = { values: string[]; cells: Record<string, Record<string, SegmentCell>> };

/** Mean score on one question for each value of one segment (age band, region...) and each stimulus. */
export function segmentTable(
  questionKey: string,
  segment: keyof Respondent,
  stimuli: Stimulus[],
  rows: ResponseRow[],
  respondents: RespondentRow[],
): SegmentTable {
  const who = new Map(respondents.map((r) => [r.id, r.profile]));
  const values = [...new Set(respondents.map((r) => String(r.profile?.[segment] ?? "")).filter(Boolean))].sort();
  const cells: SegmentTable["cells"] = {};
  for (const v of values) {
    cells[v] = {};
    for (const s of stimuli) {
      const agg = aggregate(rows
        .filter((r) => r.status === "done" && r.stimulus_id === s.id && String(who.get(r.respondent_id)?.[segment] ?? "") === v)
        .map((r) => ({ pmf: (r.answers?.[questionKey]?.pmf ?? []) as Pmf })));
      cells[v][s.id] = { mean: agg?.mean ?? null, n: agg?.n ?? 0 };
    }
  }
  return { values, cells };
}

export type Quote = { respondent: Respondent | null; text: string; score: number | null };

/** What respondents wrote about a stimulus for one question, lowest or highest scores first. */
export function quotesFor(
  questionKey: string,
  stimulusId: string,
  rows: ResponseRow[],
  respondents: RespondentRow[],
  order: "low" | "high" = "high",
): Quote[] {
  const who = new Map(respondents.map((r) => [r.id, r.profile]));
  const out = rows
    .filter((r) => r.status === "done" && r.stimulus_id === stimulusId && r.answers?.[questionKey]?.text)
    .map((r) => ({
      respondent: who.get(r.respondent_id) ?? null,
      text: r.answers![questionKey].text,
      score: typeof r.answers![questionKey].score === "number" ? r.answers![questionKey].score! : null,
    }));
  if (out.some((q) => q.score !== null)) {
    out.sort((a, b) => ((order === "high" ? -1 : 1) * ((a.score ?? 0) - (b.score ?? 0))));
  }
  return out;
}

/** "3.84" for a 1–5 mean, a dash when there isn't one: a missing score is never shown as 0. */
export const fmtScore = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "–");
export const fmtPct = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? `${Math.round(n * 100)}%` : "–");

// ---------------------------------------------------------------- loading

export async function loadResponses(db: SupabaseClient, studyId: string): Promise<ResponseRow[]> {
  const out: ResponseRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db.from("research_responses")
      .select("id, respondent_id, stimulus_id, status, answers, error")
      .eq("study_id", studyId).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as ResponseRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------- media

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/** Why a file can't be used, or null when it can. */
export function fileProblem(file: File, kind: "image" | "video"): string | null {
  const types = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!types.includes(file.type)) return kind === "image" ? "Use a JPG, PNG or WebP image." : "Use an MP4, MOV or WebM video.";
  if (file.size > max) return `Keep it under ${Math.round(max / 1024 / 1024)} MB.`;
  return null;
}

const extOf = (file: File | Blob, fallback: string) =>
  ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as Record<string, string>)[file.type] ?? fallback;

/** Where a study's file lives: <client>/<study>/<random>.<ext>, which the bucket's policies read. */
export const mediaPath = (clientId: string, studyId: string, file: File | Blob, fallbackExt = "bin") =>
  `${clientId}/${studyId}/${crypto.randomUUID()}.${extOf(file, fallbackExt)}`;

/** Takes n evenly spaced frames from a video file as JPEGs, in the browser. */
export async function videoFrames(file: File, n = 8, width = 640): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("This video couldn't be read in the browser."));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const scale = Math.min(1, width / (video.videoWidth || width));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((video.videoWidth || width) * scale);
    canvas.height = Math.round((video.videoHeight || width * 1.78) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't take frames from video.");
    const frames: Blob[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(duration - 0.05, (duration * (i + 0.5)) / n);
      await new Promise<void>((res) => {
        video.onseeked = () => res();
        video.currentTime = Math.max(0, t);
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
      if (blob) frames.push(blob);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A short-lived link to a private file, for showing it on the page. */
export async function signedUrl(db: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from("research-media").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------- drafts

/** A custom question's key: from its label, unique in the study. */
export function questionKey(label: string, taken: string[]): string {
  const base = ("q_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")).slice(0, 34) || "q";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

/** What still stops a draft from running, in the order a person would fix it. */
export function draftProblems(stimuli: Stimulus[], questions: Question[]): string[] {
  const out: string[] = [];
  if (!stimuli.length) out.push("Add at least one thing to test.");
  for (const s of stimuli) {
    if (s.kind === "text" && !s.body?.trim()) out.push(`Describe "${s.label}".`);
    if (s.kind !== "text" && !s.media_path) out.push(`Upload the ${s.kind} for "${s.label}".`);
    if (s.kind === "video" && s.media_path && !s.frame_paths?.length && !s.body?.trim()) out.push(`Add a script or caption for "${s.label}".`);
  }
  if (!questions.some((q) => q.kind === "likert")) out.push("Ask at least one rated question.");
  for (const q of questions) if (q.source === "custom" && !q.anchors_approved_at) out.push(`Approve the scale for "${q.label}".`);
  return out;
}

/** Deletes files no other stimulus uses: a copied study shares its original's files. */
export async function removeUnused(db: SupabaseClient, paths: string[], exceptId: string) {
  const keep = new Set<string>();
  for (const p of paths) {
    const [{ count: asMedia }, { count: asFrame }] = await Promise.all([
      db.from("research_stimuli").select("id", { count: "exact", head: true }).eq("media_path", p).neq("id", exceptId),
      db.from("research_stimuli").select("id", { count: "exact", head: true }).contains("frame_paths", [p]).neq("id", exceptId),
    ]);
    if ((asMedia ?? 0) > 0 || (asFrame ?? 0) > 0) keep.add(p);
  }
  const gone = paths.filter((p) => !keep.has(p));
  if (gone.length) await db.storage.from("research-media").remove(gone);
}

