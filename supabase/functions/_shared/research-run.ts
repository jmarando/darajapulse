// The decisions of a consumer-research run that don't need the network: what a study costs,
// what each AI call is told, and how its replies are read back. research-run (the edge
// function) does the calls and the database work; the page uses the same cost rule so the
// figure shown before Run is the figure charged.
import { countryOf, type CountryCode } from "./listening-country.ts";
import { anchorsValid, type MeasureKind } from "./research-templates.ts";
import { COUNTRY_PANELS, dimensionOptions, type PanelSpec } from "./research-panel.ts";

export type StimulusKind = "text" | "image" | "video";
export type VideoMode = "summary" | "full";

/** Units: one per respondent reading a text or image stimulus, or a video's written account. */
export const UNIT_PER_VIEW = 1;
/** A respondent watching the whole video costs this many units instead. */
export const UNIT_PER_FULL_WATCH = 5;
/** Writing a video's neutral account, once per video. */
export const UNIT_PER_VIDEO_ACCOUNT = 10;
/** Full watch is for small panels; bigger ones use the written account. */
export const MAX_FULL_WATCH_PANEL = 50;
/** What a brand may spend a month when staff haven't set an allowance. */
export const DEFAULT_MONTHLY_UNITS = 300;

export type CostInput = { respondents: number; stimuli: { kind: StimulusKind }[]; videoMode: VideoMode };

/** Units a study takes when it starts. Every respondent sees every stimulus once and answers all its questions. */
export function studyCost({ respondents, stimuli, videoMode }: CostInput): number {
  const n = Math.max(0, Math.round(respondents));
  let units = 0;
  for (const s of stimuli) {
    if (s.kind === "video") {
      units += UNIT_PER_VIDEO_ACCOUNT;
      units += n * (videoMode === "full" ? UNIT_PER_FULL_WATCH : UNIT_PER_VIEW);
    } else {
      units += n * UNIT_PER_VIEW;
    }
  }
  return units;
}

/** The month an allowance belongs to, as Nairobi sees it: "2026-11". */
export function allowanceMonth(at: Date = new Date()): string {
  const nairobi = new Date(at.getTime() + 3 * 3600_000);
  return nairobi.toISOString().slice(0, 7);
}

export type QuestionForRun = { key: string; kind: MeasureKind; prompt: string };

export type StimulusForRun = {
  label: string;
  kind: StimulusKind;
  body: string | null;
  price: string | null;
  /** The video's neutral account, once written. */
  account: string | null;
};

/** What the respondent is shown, before any images or video. */
export function stimulusText(s: StimulusForRun, brand: string, country: CountryCode): string {
  const currency = COUNTRY_PANELS[country].currency;
  const lines = [`Brand: ${brand}`, `What you are looking at: ${s.label}`];
  if (s.body?.trim()) lines.push(s.kind === "video" ? `Script or caption: ${s.body.trim()}` : s.body.trim());
  if (s.price?.trim()) lines.push(`Price: ${/^\s*\d/.test(s.price) ? `${currency} ${s.price.trim()}` : s.price.trim()}`);
  if (s.kind === "video" && s.account) lines.push(`The video, described scene by scene:\n${s.account}`);
  if (s.kind === "image") lines.push("The image is attached.");
  return lines.join("\n");
}

/** The survey questions, with the JSON shape the reply must take. */
export function questionsText(questions: QuestionForRun[]): string {
  const list = questions.map((q) => `- "${q.key}": ${q.prompt}`).join("\n");
  return [
    "Answer every question below in your own words, as yourself.",
    list,
    `Reply with JSON only: {"answers": {${questions.map((q) => `"${q.key}": "..."`).join(", ")}}}`,
  ].join("\n\n");
}

/** Reads a respondent's reply; null unless every question got a usable answer. */
export function parseAnswers(content: unknown, questions: QuestionForRun[]): Record<string, string> | null {
  let obj: unknown = content;
  if (typeof content === "string") {
    const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { obj = JSON.parse(text); } catch { return null; }
  }
  const answers = (obj as { answers?: unknown })?.answers ?? obj;
  if (!answers || typeof answers !== "object") return null;
  const out: Record<string, string> = {};
  for (const q of questions) {
    const v = (answers as Record<string, unknown>)[q.key];
    const text = typeof v === "string" ? v.trim() : "";
    if (text.length < 2) return null;
    out[q.key] = text.slice(0, 1200);
  }
  return out;
}

/** The instruction for writing a video's neutral account, which panel members then react to. */
export const WATCH_PROMPT = [
  "You describe marketing videos for a consumer-research panel who will not see the video themselves.",
  "Write a neutral, complete account so a viewer could react to it as if they had watched it. Do not judge or praise it.",
  "Cover, in order: the opening 3 seconds (what hooks or fails to hook); each scene (who is on screen, setting, action);",
  "everything said, quoted as closely as you can and noting the language (English, Kiswahili, Sheng, Luganda...);",
  "on-screen text; music and sound; pace and editing; when and how the brand or product first appears; the ending and any call to action;",
  "and the overall tone and energy. Plain text, at most 400 words.",
].join(" ");

/** Used when the gateway won't take the video itself: the account is written from key frames and the script. */
export const FRAMES_WATCH_PROMPT = [
  "You describe marketing videos for a consumer-research panel who will not see the video themselves.",
  "You have key frames taken in order through the video and, where given, its script or caption; you cannot hear it.",
  "Write a neutral, complete account of what the video shows, scene by scene, with on-screen text, people, setting, product appearances and the likely message.",
  "Say plainly that sound was not available. Do not judge or praise it. Plain text, at most 300 words.",
].join(" ");

/** The instruction for drafting a custom question's anchors, which a person then approves. */
export function anchorDraftPrompt(question: string): string {
  return [
    "You write anchor statements for a 5-point Likert scale used in consumer research.",
    "Each statement is something a respondent might say in their own words, in the first person, plain everyday English, under 15 words.",
    "Statement 1 is the most negative answer, 3 is neutral or unsure, 5 is the most positive; the steps should feel evenly spaced.",
    "Don't mention a specific product name or number. Keep all five about the same topic as the question.",
    `The question: "${question}"`,
    'Reply with JSON only: {"anchors": ["...", "...", "...", "...", "..."]}',
  ].join("\n");
}

export function parseAnchors(content: unknown): string[] | null {
  let obj: unknown = content;
  if (typeof content === "string") {
    try { obj = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { return null; }
  }
  const anchors = (obj as { anchors?: unknown })?.anchors;
  if (!anchorsValid(anchors)) return null;
  return (anchors as string[]).map((a) => a.trim());
}

/** The instruction for turning a written audience into panel shares, which a person then checks. */
export function audiencePrompt(description: string, country: CountryCode): string {
  const o = dimensionOptions(country);
  const name = countryOf(country).name;
  return [
    `You set up consumer-research panels in ${name}. Turn the audience below into percentage shares for each dimension.`,
    "Use only these options, as written. Give an option 0 to leave it out. Shares in each dimension should add to about 100.",
    `ages: ${o.ages.join(", ")}`,
    `genders: ${o.genders.join(", ")}`,
    `regions: ${o.regions.join(", ")}`,
    `settings: ${o.settings.join(", ")}`,
    `incomes: ${o.incomes.join(", ")}`,
    `languages: ${o.languages.join(", ")}`,
    "Where the audience says nothing about a dimension, use realistic shares for the country's adult online population.",
    "Also give up to 4 short attitudes (mindsets) the audience implies, such as \"price-sensitive mum of two\"; an empty list if none.",
    `The audience: "${description}"`,
    'Reply with JSON only: {"ages": {...}, "genders": {...}, "regions": {...}, "settings": {...}, "incomes": {...}, "languages": {...}, "attitudes": [...]}',
  ].join("\n");
}

export function parseAudience(content: unknown): Partial<PanelSpec> | null {
  let obj: unknown = content;
  if (typeof content === "string") {
    try { obj = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const shares = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : undefined);
  return {
    ages: shares(o.ages),
    genders: shares(o.genders),
    regions: shares(o.regions),
    settings: shares(o.settings),
    incomes: shares(o.incomes),
    languages: shares(o.languages),
    attitudes: Array.isArray(o.attitudes) ? o.attitudes.map(String) : [],
  };
}

export type SummaryInput = {
  brand: string;
  stimuli: { label: string; scores: Record<string, number | null>; quotes: string[] }[];
};

/** The instruction for the study's written read-out, built from the panel's own words. */
export const SUMMARY_PROMPT = [
  "You are a consumer-insights analyst. You get a synthetic consumer panel's results for several stimuli: mean scores (1–5) per measure and a sample of what respondents wrote.",
  "For each stimulus, give: what people liked (up to 3 points), what held them back (up to 3 points), and 2 short verbatim quotes from the sample that capture the mood.",
  "Then give an overall verdict: which stimulus is strongest and why, and up to 3 concrete changes that would most likely lift the weakest scores.",
  "Only state what the scores and quotes support. Plain, direct language for a marketing team.",
  'Reply with JSON only: {"stimuli": [{"label": "...", "likes": ["..."], "barriers": ["..."], "quotes": ["..."]}], "verdict": "...", "changes": ["..."]}',
].join(" ");

export type StudySummary = {
  stimuli: { label: string; likes: string[]; barriers: string[]; quotes: string[] }[];
  verdict: string;
  changes: string[];
};

export function parseSummary(content: unknown): StudySummary | null {
  let obj: unknown = content;
  if (typeof content === "string") {
    try { obj = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { return null; }
  }
  const o = obj as Partial<StudySummary> | null;
  if (!o || !Array.isArray(o.stimuli) || typeof o.verdict !== "string") return null;
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n) : []);
  return {
    stimuli: o.stimuli.map((s) => ({
      label: String((s as { label?: unknown })?.label ?? ""),
      likes: strs((s as { likes?: unknown })?.likes, 3),
      barriers: strs((s as { barriers?: unknown })?.barriers, 3),
      quotes: strs((s as { quotes?: unknown })?.quotes, 2),
    })),
    verdict: o.verdict.slice(0, 1500),
    changes: strs(o.changes, 3),
  };
}

/** Evenly spaced picks from a list, for quoting a fair sample rather than the first few. */
export function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}
