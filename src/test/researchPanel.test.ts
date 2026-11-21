import { describe, expect, it } from "vitest";
import {
  COUNTRY_PANELS, MAX_PANEL, allocate, cleanPanel, defaultPanel, drawPanel, personaPrompt,
} from "../../supabase/functions/_shared/research-panel";
import { MEASURES, TEMPLATES, anchorsValid } from "../../supabase/functions/_shared/research-templates";

const count = <T,>(xs: T[]) => xs.reduce<Record<string, number>>((m, x) => ((m[String(x)] = (m[String(x)] ?? 0) + 1), m), {});

describe("allocate", () => {
  it("hands out exactly n places by the largest remainders", () => {
    expect(allocate({ a: 1, b: 1, c: 1 }, 10)).toEqual({ a: 4, b: 3, c: 3 });
    expect(allocate({ a: 70, b: 30 }, 7)).toEqual({ a: 5, b: 2 });
  });
  it("splits evenly when every share is zero or nonsense, so nobody is left out", () => {
    expect(allocate({ a: 0, b: -5 }, 4)).toEqual({ a: 2, b: 2 });
  });
});

describe("drawPanel", () => {
  const spec = { ...defaultPanel("Kenya"), size: 100, attitudes: ["price-sensitive mum", "early adopter"] };

  it("matches every dimension's shares exactly", () => {
    const people = drawPanel(spec, "study-1");
    expect(people).toHaveLength(100);
    expect(count(people.map((p) => p.gender))).toEqual({ Female: 50, Male: 50 });
    expect(count(people.map((p) => p.region))["Nairobi"]).toBe(35);
    expect(count(people.map((p) => p.attitude))).toEqual({ "price-sensitive mum": 50, "early adopter": 50 });
  });

  it("is the same panel every time for the same study, and a different mix for another", () => {
    expect(drawPanel(spec, "study-1")).toEqual(drawPanel(spec, "study-1"));
    expect(drawPanel(spec, "study-2")).not.toEqual(drawPanel(spec, "study-1"));
  });

  it("gives ages inside each band and names that fit the country", () => {
    for (const p of drawPanel(spec, "x")) {
      const [lo, hi] = p.age_band === "55+" ? [55, 68] : p.age_band.split("-").map(Number);
      expect(p.age).toBeGreaterThanOrEqual(lo);
      expect(p.age).toBeLessThanOrEqual(hi);
      expect(COUNTRY_PANELS.KE.names[p.gender as "Female" | "Male"]).toContain(p.name);
    }
  });

  it("uses Ugandan regions, languages and currency for a Ugandan brand", () => {
    const ug = drawPanel(defaultPanel("Uganda"), "ug");
    expect(new Set(ug.map((p) => p.region)).has("Kampala")).toBe(true);
    expect(personaPrompt(ug[0], "UG")).toContain("UGX");
    expect(personaPrompt(ug[0], "UG")).toContain("Uganda");
  });
});

describe("cleanPanel", () => {
  it("caps the size, drops unknown options and keeps at most six attitudes", () => {
    const c = cleanPanel({ country: "KE", size: 5000, regions: { Nairobi: 100, Atlantis: 50 }, attitudes: Array(9).fill("x") });
    expect(c.size).toBe(MAX_PANEL);
    expect(Object.keys(c.regions)).not.toContain("Atlantis");
    expect(c.regions.Nairobi).toBe(100);
    expect(c.attitudes).toHaveLength(6);
  });
  it("falls back to the country's defaults for an empty dimension", () => {
    expect(cleanPanel({ country: "UG", ages: { "18-24": 0 } }).ages).toEqual(defaultPanel("Uganda").ages);
  });
});

describe("personaPrompt", () => {
  it("speaks as the respondent, asks for honesty and never admits to being an AI", () => {
    const [p] = drawPanel({ ...defaultPanel("Kenya"), size: 1 }, "p");
    const text = personaPrompt(p, "KE");
    expect(text).toContain(`You are ${p.name}`);
    expect(text).toContain("KES");
    expect(text).toMatch(/honest/i);
    expect(text).toMatch(/Never mention that you are an AI/);
  });
});

describe("templates", () => {
  it("only use measures that exist, and every Likert measure has valid anchor sets", () => {
    for (const t of Object.values(TEMPLATES)) for (const k of t.measures) expect(MEASURES[k]).toBeDefined();
    for (const m of Object.values(MEASURES)) {
      if (m.kind === "likert") {
        expect(m.anchors.length).toBeGreaterThan(0);
        for (const set of m.anchors) expect(anchorsValid(set)).toBe(true);
      } else {
        expect(m.anchors).toEqual([]);
      }
    }
  });
  it("anchorsValid wants five distinct, sensible statements", () => {
    expect(anchorsValid(["a b c", "d e f", "g h i", "j k l", "m n o"])).toBe(true);
    expect(anchorsValid(["same", "same", "x y z", "j k l", "m n o"])).toBe(false);
    expect(anchorsValid(["a", "b", "c", "d"])).toBe(false);
    expect(anchorsValid("nope")).toBe(false);
  });
});
