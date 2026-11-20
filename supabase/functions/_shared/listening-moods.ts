// What the AI is asked when it reads a listening post's mood and theme, in the brand's own country: Kenya's prompt is the
// one Listening has always used, word for word. Posts are grouped by their brand's country so each group is read with its
// own prompt. Pure, so it is tested off Deno; listening-sweep/index.ts calls the AI.
import { type ListeningCountry, countryOf } from "./listening-country.ts";

export const OFF_TOPIC = "off-topic";
export const THEMES = ["price", "quality", "taste", "availability", "service", "delivery", "packaging", "advert", "promotion", "health", "safety", "competitor", "general", OFF_TOPIC];

/** The system prompt for one country's posts. */
export function moodPrompt(country: ListeningCountry): string {
  return [
    country.promptIntro,
    "Each item names the brand that is listening, the keyword that found the post, and whether that keyword is",
    "the brand itself, a competitor, or a category the brand sells in.",
    "For each item give the mood of the post towards the keyword's subject (the competitor, for a competitor keyword):",
    "positive, neutral or negative, and a score from -1 (furious) to 1 (delighted).",
    `Give one theme from: ${THEMES.join(", ")}.`,
    `Use "${OFF_TOPIC}" when the post is not about the keyword's subject at all (a different meaning of the word,`,
    "another country's unrelated news, spam).",
    'Reply as JSON: {"results":[{"id":"…","sentiment":"positive|neutral|negative","theme":"…","score":0}]}, keeping each id.',
  ].join(" ");
}

/**
 * Posts grouped by their brand's country, in the order each country first appears and each group in its own order, so a
 * run with only Kenyan brands reads the same posts in the same batches as before.
 */
export function byCountry<T>(items: T[], countryText: (item: T) => string | null | undefined): { country: ListeningCountry; items: T[] }[] {
  const groups = new Map<string, { country: ListeningCountry; items: T[] }>();
  for (const item of items) {
    const country = countryOf(countryText(item));
    const group = groups.get(country.code) ?? { country, items: [] };
    group.items.push(item);
    groups.set(country.code, group);
  }
  return [...groups.values()];
}
