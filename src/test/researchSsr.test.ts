import { describe, expect, it } from "vitest";
import {
  aggregate, cosine, expectedScore, pmfFromSimilarities, rankByMean, ssrPmf, topTwoBox,
} from "../../supabase/functions/_shared/research-ssr";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("cosine", () => {
  it("is 1 for the same direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it("is 0 for an empty or flat vector instead of NaN", () => {
    expect(cosine([], [])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("pmfFromSimilarities", () => {
  it("puts no weight on the least similar anchor and the most on the most similar", () => {
    const p = pmfFromSimilarities([0.1, 0.2, 0.3, 0.4, 0.9]);
    expect(sum(p)).toBeCloseTo(1);
    expect(p[0]).toBe(0);
    expect(p.indexOf(Math.max(...p))).toBe(4);
  });
  it("is flat when every anchor is equally similar, because the answer says nothing", () => {
    expect(pmfFromSimilarities([0.5, 0.5, 0.5, 0.5, 0.5])).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  });
  it("sharpens with a low temperature and flattens with a high one", () => {
    const sims = [0.1, 0.3, 0.5, 0.6, 0.7];
    const base = pmfFromSimilarities(sims);
    const sharp = pmfFromSimilarities(sims, 0, 0.5);
    const flat = pmfFromSimilarities(sims, 0, 2);
    expect(sharp[4]).toBeGreaterThan(base[4]);
    expect(flat[4]).toBeLessThan(base[4]);
    expect(sum(sharp)).toBeCloseTo(1);
    expect(sum(flat)).toBeCloseTo(1);
  });
  it("leaves epsilon on the least similar point", () => {
    const p = pmfFromSimilarities([0.1, 0.2, 0.3, 0.4, 0.5], 0.05);
    expect(p[0]).toBeGreaterThan(0);
  });
  it("refuses anything but five finite similarities", () => {
    expect(() => pmfFromSimilarities([1, 2, 3])).toThrow();
    expect(() => pmfFromSimilarities([1, 2, 3, 4, NaN])).toThrow();
  });
});

describe("ssrPmf", () => {
  // Anchors on a circle: the answer pointing at anchor k should score highest at k.
  const anchors = [0, 1, 2, 3, 4].map((k) => [Math.cos(k * 0.5), Math.sin(k * 0.5)]);
  it("scores an answer close to the 5 anchor near 5, and one close to the 1 anchor near 1", () => {
    expect(expectedScore(ssrPmf(anchors[4], [anchors]))).toBeGreaterThan(3.8);
    expect(expectedScore(ssrPmf(anchors[0], [anchors]))).toBeLessThan(2.2);
  });
  it("averages several anchor sets", () => {
    const one = ssrPmf(anchors[3], [anchors]);
    const two = ssrPmf(anchors[3], [anchors, anchors]);
    one.forEach((x, i) => expect(two[i]).toBeCloseTo(x));
  });
  it("needs at least one set of five anchors", () => {
    expect(() => ssrPmf([1, 0], [])).toThrow();
    expect(() => ssrPmf([1, 0], [anchors.slice(0, 4)])).toThrow();
  });
});

describe("aggregate", () => {
  it("averages distributions, reads the mean and top-two box from them, and gives an interval", () => {
    const a = aggregate([{ pmf: [0, 0, 0, 0, 1] }, { pmf: [0, 0, 1, 0, 0] }])!;
    expect(a.n).toBe(2);
    expect(a.pmf).toEqual([0, 0, 0.5, 0, 0.5]);
    expect(a.mean).toBeCloseTo(4);
    expect(a.top2).toBeCloseTo(0.5);
    expect(a.ci95![0]).toBeLessThan(4);
    expect(a.ci95![1]).toBeGreaterThan(4);
  });
  it("skips broken answers and is null with none left", () => {
    expect(aggregate([{ pmf: [] }, { pmf: [NaN, 0, 0, 0, 1] }])).toBeNull();
    expect(aggregate([{ pmf: [1, 0, 0, 0, 0] }])!.ci95).toBeNull();
  });
  it("top-two box is the 4 and 5 shares", () => {
    expect(topTwoBox([0.1, 0.1, 0.2, 0.3, 0.3])).toBeCloseTo(0.6);
  });
});

describe("rankByMean", () => {
  it("puts the highest mean first, missing means last, ties in their order", () => {
    const rows = [{ id: "a", mean: 3 }, { id: "b", mean: null }, { id: "c", mean: 4 }, { id: "d", mean: 3 }];
    expect(rankByMean(rows).map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });
});
