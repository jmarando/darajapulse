// Semantic similarity rating (SSR): turns a synthetic respondent's written answer into a
// 5-point Likert distribution by comparing its embedding with five anchor statements
// (Maier et al., "LLMs Reproduce Human Purchase Intent via Semantic Similarity Elicitation
// of Likert Ratings"). Asking a model for a number directly gives narrow, middle-heavy
// answers; reading a free-text answer against anchors keeps a realistic spread.
//
// Pure, with no Deno or network use, so the research job and the page share it and tests
// can run it. The job embeds; this module only scores and adds up.

export type Pmf = [number, number, number, number, number];

/** Cosine similarity of two vectors; 0 when either is empty or flat. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!n || na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Small weight left on the least similar anchor so no point is ever exactly impossible. */
export const SSR_EPSILON = 0.0;
/** The paper's temperature: 1 keeps the shape the similarities give. */
export const SSR_TEMPERATURE = 1;

/**
 * One anchor set's distribution, as in the paper: each point's weight is how much more
 * similar the answer is to that anchor than to the least similar one (plus epsilon on the
 * least similar), normalised, then sharpened or flattened by the temperature.
 */
export function pmfFromSimilarities(sims: number[], epsilon = SSR_EPSILON, temperature = SSR_TEMPERATURE): Pmf {
  if (sims.length !== 5 || sims.some((s) => !Number.isFinite(s))) throw new Error("SSR needs five similarities");
  const min = Math.min(...sims);
  const minAt = sims.indexOf(min);
  let w = sims.map((s, i) => s - min + (i === minAt ? epsilon : 0));
  let total = w.reduce((a, b) => a + b, 0);
  // Every anchor equally similar: the answer says nothing, so the distribution is flat.
  if (total <= 0) return [0.2, 0.2, 0.2, 0.2, 0.2];
  w = w.map((x) => x / total);
  if (temperature !== 1) {
    const t = Math.max(temperature, 1e-6);
    w = w.map((x) => Math.pow(x, 1 / t));
    total = w.reduce((a, b) => a + b, 0);
    w = w.map((x) => x / total);
  }
  return w as Pmf;
}

/**
 * The answer's distribution over 1–5: one distribution per anchor set, averaged. Anchor sets
 * are five statements ordered from 1 (most negative) to 5 (most positive).
 */
export function ssrPmf(answer: number[], anchorSets: number[][][], epsilon = SSR_EPSILON, temperature = SSR_TEMPERATURE): Pmf {
  if (!anchorSets.length) throw new Error("SSR needs at least one anchor set");
  const sum: number[] = [0, 0, 0, 0, 0];
  for (const set of anchorSets) {
    if (set.length !== 5) throw new Error("Each anchor set needs five statements");
    const p = pmfFromSimilarities(set.map((a) => cosine(answer, a)), epsilon, temperature);
    p.forEach((x, i) => (sum[i] += x));
  }
  return sum.map((x) => x / anchorSets.length) as Pmf;
}

/** The distribution's mean on the 1–5 scale. */
export const expectedScore = (p: Pmf | number[]): number => p.reduce((s, x, i) => s + x * (i + 1), 0);

/** Share expected to answer 4 or 5 ("top two box"), the figure concept tests are usually read by. */
export const topTwoBox = (p: Pmf | number[]): number => (p[3] ?? 0) + (p[4] ?? 0);

export type ScoredAnswer = { pmf: Pmf | number[] };

export type Aggregate = {
  n: number;
  /** Mean distribution across respondents: the panel's predicted answer shares for 1–5. */
  pmf: Pmf;
  mean: number;
  top2: number;
  /** 95% interval of the mean across respondents, or null below two answers. */
  ci95: [number, number] | null;
};

/** Adds up scored answers into the panel's distribution, mean, top-two box and an interval. */
export function aggregate(answers: ScoredAnswer[]): Aggregate | null {
  const valid = answers.filter((a) => Array.isArray(a.pmf) && a.pmf.length === 5 && a.pmf.every(Number.isFinite));
  if (!valid.length) return null;
  const pmf = [0, 0, 0, 0, 0];
  const scores: number[] = [];
  for (const a of valid) {
    a.pmf.forEach((x, i) => (pmf[i] += x / valid.length));
    scores.push(expectedScore(a.pmf));
  }
  const mean = expectedScore(pmf);
  let ci95: [number, number] | null = null;
  if (scores.length >= 2) {
    const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (scores.length - 1);
    const half = 1.96 * Math.sqrt(variance / scores.length);
    ci95 = [mean - half, mean + half];
  }
  return { n: valid.length, pmf: pmf as Pmf, mean, top2: topTwoBox(pmf), ci95 };
}

/** Stimuli ranked best first by mean; ties keep their order. */
export function rankByMean<T extends { mean: number | null }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.mean ?? -Infinity) - (a.r.mean ?? -Infinity) || a.i - b.i)
    .map((x) => x.r);
}
