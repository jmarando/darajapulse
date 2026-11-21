import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  draftProblems, fmtScore, progressOf, questionKey, quotesFor, scoresFor, segmentTable,
  type Question, type RespondentRow, type ResponseRow, type Stimulus, type Study,
} from "@/lib/research";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import StudyResults from "@/components/research/StudyResults";

const stim = (id: string, label: string, extra: Partial<Stimulus> = {}): Stimulus => ({
  id, study_id: "s", position: 0, label, kind: "text", body: "x", price: null, media_path: null, frame_paths: [], account: null, account_source: null, ...extra,
});
const q = (key: string, extra: Partial<Question> = {}): Question => ({
  id: key, study_id: "s", position: 0, key, label: key, kind: "likert", prompt: "?", anchors: [], source: "template", anchors_approved_at: null, ...extra,
});
const person = (id: string, age_band: string, extra = {}): RespondentRow => ({
  id, idx: 0, profile: { idx: 0, name: id, age: 30, age_band, gender: "Female", region: "Nairobi", setting: "Urban", income: "Middle", language: "English", attitude: null, ...extra },
});
const resp = (respondent_id: string, stimulus_id: string, pmf: number[] | null, text = "answer", status: ResponseRow["status"] = "done"): ResponseRow => ({
  id: `${respondent_id}-${stimulus_id}`, respondent_id, stimulus_id, status, error: null,
  answers: pmf ? { appeal: { text, pmf, score: pmf.reduce((s, x, i) => s + x * (i + 1), 0) } } : null,
});

const A = stim("a", "Pack A");
const B = stim("b", "Pack B");
const people = [person("p1", "18-24"), person("p2", "35-44")];
const rows = [
  resp("p1", "a", [0, 0, 0, 0, 1], "Love it"), resp("p2", "a", [0, 0, 0, 1, 0], "Nice"),
  resp("p1", "b", [1, 0, 0, 0, 0], "Hate it"), resp("p2", "b", null, "", "pending"),
];

describe("results", () => {
  it("counts progress, with failed answers as finished", () => {
    expect(progressOf([{ status: "done" }, { status: "failed" }, { status: "pending" }, { status: "pending" }]))
      .toEqual({ total: 4, done: 1, failed: 1, pending: 2, share: 0.5 });
  });
  it("ranks options by mean, from done answers only", () => {
    const s = scoresFor("appeal", [B, A], rows);
    expect(s.map((x) => x.stimulus.label)).toEqual(["Pack A", "Pack B"]);
    expect(s[0].mean).toBeCloseTo(4.5);
    expect(s[1].agg?.n).toBe(1);
  });
  it("splits a question by segment, leaving a group with no answers without a mean", () => {
    const t = segmentTable("appeal", "age_band", [A, B], rows, people);
    expect(t.values).toEqual(["18-24", "35-44"]);
    expect(t.cells["18-24"].a.mean).toBeCloseTo(5);
    expect(t.cells["35-44"].b).toEqual({ mean: null, n: 0 });
  });
  it("lists quotes most positive or most negative first, with who said them", () => {
    expect(quotesFor("appeal", "a", rows, people, "high").map((x) => x.text)).toEqual(["Love it", "Nice"]);
    expect(quotesFor("appeal", "a", rows, people, "low")[0].respondent?.name).toBe("p2");
  });
  it("shows a dash, never 0, for a missing score", () => {
    expect(fmtScore(null)).toBe("–");
    expect(fmtScore(3.456)).toBe("3.46");
  });
});

describe("drafts", () => {
  it("makes unique keys for custom questions", () => {
    expect(questionKey("Gifting!", [])).toBe("q_gifting");
    expect(questionKey("Gifting", ["q_gifting"])).toBe("q_gifting_2");
  });
  it("names what stops a draft running", () => {
    const problems = draftProblems(
      [stim("t", "Concept", { body: " " }), stim("i", "Pack", { kind: "image" }), stim("v", "Ad", { kind: "video", media_path: "x.mp4", body: null })],
      [q("message", { kind: "open" }), q("q_gift", { source: "custom", label: "Gifting" })],
    );
    expect(problems).toEqual([
      'Describe "Concept".',
      'Upload the image for "Pack".',
      'Add a script or caption for "Ad".',
      'Approve the scale for "Gifting".',
    ]);
    expect(draftProblems([], [])).toContain("Ask at least one rated question.");
  });
});

describe("StudyResults", () => {
  const study = {
    id: "s", client_id: "c", title: "Packs", template: "concept", status: "done", panel: { size: 2 }, video_mode: "summary",
    units_charged: 4, units_refunded: 0, summary: { verdict: "Pack A wins on taste cues.", changes: ["Make B's price clearer"], stimuli: [] },
    error: null, created_at: "", started_at: null, finished_at: null,
  } as unknown as Study;

  it("shows the verdict, marks the best option, labels custom questions untested and keeps the method note", () => {
    render(<StudyResults study={study} stimuli={[A, B]} questions={[q("appeal"), q("q_gift", { source: "custom", label: "Gifting" })]} respondents={people} responses={rows} />);
    expect(screen.getByText("Pack A wins on taste cues.")).toBeInTheDocument();
    expect(screen.getByText(/synthetic respondents/)).toBeInTheDocument();
    expect(screen.getByText(/hasn't been checked against Kenyan or Ugandan panels/)).toBeInTheDocument();
    const appealRow = screen.getAllByRole("row").find((r) => within(r).queryByText("appeal") && within(r).queryByLabelText("Best"));
    expect(appealRow).toBeTruthy();
    const giftRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Gifting"))!;
    expect(within(giftRow).getByText("Untested")).toBeInTheDocument();
    // No Gifting answers: dashes, not zeros.
    expect(within(giftRow).getAllByText(/–/).length).toBeGreaterThan(0);
  });

  it("says when a video was described from frames because the AI couldn't take it", () => {
    const V = stim("v", "Creator cut", { kind: "video", account: "A man drinks.", account_source: "frames" });
    render(<StudyResults study={study} stimuli={[V]} questions={[q("appeal")]} respondents={people} responses={[]} />);
    expect(screen.getByText(/sound wasn't heard/)).toBeInTheDocument();
  });
});

describe("StudyEditor", () => {
  it("renders a draft with its cost against what's left, and holds Run until the draft is complete", async () => {
    const { default: StudyEditor } = await import("@/components/research/StudyEditor");
    const { defaultPanel } = await import("../../supabase/functions/_shared/research-panel");
    const draft = {
      id: "s", client_id: "c", title: "Packs", template: "concept", status: "draft", panel: { ...defaultPanel("Kenya"), size: 100 },
      video_mode: "summary", units_charged: 0, units_refunded: 0, summary: null, error: null, created_at: "", started_at: null, finished_at: null,
    } as unknown as Study;
    render(
      <StudyEditor
        study={draft}
        stimuli={[A, stim("i", "Pack", { kind: "image" })]}
        questions={[q("appeal")]}
        allowance={{ month: "2026-11", monthly_units: 300, used: 150 }}
        onChanged={() => {}}
        onStarted={() => {}}
      />,
    );
    expect(screen.getByText("200 units")).toBeInTheDocument();
    expect(screen.getByText(/150 of 300 left this month/)).toBeInTheDocument();
    expect(screen.getByText('Upload the image for "Pack".')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run study/ })).toBeDisabled();
    expect(screen.getByLabelText("Region: Nairobi share")).toHaveValue(35);
  });
});
