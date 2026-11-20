import { describe, expect, it } from "vitest";
import { LISTENING_COUNTRIES } from "../../supabase/functions/_shared/listening-country";
import { THEMES, byCountry, moodPrompt } from "../../supabase/functions/_shared/listening-moods";

// What the AI is asked about each post, by the brand's country. Kenya's prompt is pinned word for word as listening-sweep
// sent it before brands had a country (main at c587fda).
const KENYA_PROMPT =
  "You monitor Kenyan social media for consumer brands. Text may mix English, Kiswahili and Sheng. " +
  "Each item names the brand that is listening, the keyword that found the post, and whether that keyword is " +
  "the brand itself, a competitor, or a category the brand sells in. " +
  "For each item give the mood of the post towards the keyword's subject (the competitor, for a competitor keyword): " +
  "positive, neutral or negative, and a score from -1 (furious) to 1 (delighted). " +
  "Give one theme from: price, quality, taste, availability, service, delivery, packaging, advert, promotion, health, safety, competitor, general, off-topic. " +
  'Use "off-topic" when the post is not about the keyword\'s subject at all (a different meaning of the word, ' +
  "another country's unrelated news, spam). " +
  'Reply as JSON: {"results":[{"id":"…","sentiment":"positive|neutral|negative","theme":"…","score":0}]}, keeping each id.';

describe("moodPrompt", () => {
  it("asks about Kenyan posts word for word as before", () => {
    expect(moodPrompt(LISTENING_COUNTRIES.KE)).toBe(KENYA_PROMPT);
  });

  it("asks about Ugandan posts in Uganda's languages, with the same rules", () => {
    const prompt = moodPrompt(LISTENING_COUNTRIES.UG);
    expect(prompt.startsWith(LISTENING_COUNTRIES.UG.promptIntro)).toBe(true);
    expect(prompt).not.toContain("Kenya");
    expect(prompt.slice(LISTENING_COUNTRIES.UG.promptIntro.length)).toBe(KENYA_PROMPT.slice(LISTENING_COUNTRIES.KE.promptIntro.length));
  });

  it("keeps the themes the sweep stores", () => {
    expect(THEMES).toHaveLength(14);
    expect(THEMES.at(-1)).toBe("off-topic");
  });
});

describe("byCountry", () => {
  const ids = (groups: { country: { code: string }; items: { id: number }[] }[]) => groups.map((g) => [g.country.code, g.items.map((p) => p.id)]);

  it("keeps a run of Kenyan brands' posts together, in order, as one group", () => {
    expect(ids(byCountry([{ id: 1, c: "Kenya" }, { id: 2, c: null }, { id: 3, c: "Kenya" }], (p) => p.c))).toEqual([["KE", [1, 2, 3]]]);
  });

  it("puts each country's posts in a group of their own, in the order the countries first appear", () => {
    expect(ids(byCountry([{ id: 1, c: "Uganda" }, { id: 2, c: "Kenya" }, { id: 3, c: "Uganda" }], (p) => p.c))).toEqual([["UG", [1, 3]], ["KE", [2]]]);
  });
});
