// Which country a brand listens in, and what that changes: the languages the AI is told to expect, where TikTok and
// YouTube search from, the country Google's news and web search is set to, and the country's own name, which the strict
// news rule leaves out like a filler word. A brand's country is its clients.country (free text, "Kenya" by default).
// Pure, with no imports, so the edge functions and the page read the same profiles.

export type CountryCode = "KE" | "UG";

export type ListeningCountry = {
  code: CountryCode;
  /** The name kept in clients.country and shown in the client form. */
  name: string;
  /** "Kenyan", as in "Kenyan news sites and blogs". */
  adjective: string;
  /** The mood prompt's opening: whose social media it is and the languages its posts mix. */
  promptIntro: string;
  /** The languages the page says the AI reads. */
  languages: string;
  /** Where ScrapeCreators runs TikTok and YouTube searches from; null leaves it to ScrapeCreators, as Kenya always has. */
  searchRegion: string | null;
  /** The country Serper's news and web search is set to (gl). */
  serperGl: string;
  /** The country's name as the news rule folds it, left out of a keyword like a filler word ("MTN Uganda" needs only "mtn"). */
  countryWord: string;
};

export const LISTENING_COUNTRIES: Record<CountryCode, ListeningCountry> = {
  KE: {
    code: "KE",
    name: "Kenya",
    adjective: "Kenyan",
    promptIntro: "You monitor Kenyan social media for consumer brands. Text may mix English, Kiswahili and Sheng.",
    languages: "English, Kiswahili or Sheng",
    searchRegion: null,
    serperGl: "ke",
    countryWord: "kenya",
  },
  UG: {
    code: "UG",
    name: "Uganda",
    adjective: "Ugandan",
    promptIntro:
      "You monitor Ugandan social media for consumer brands. Text may mix English, Luganda, Swahili and other Ugandan languages (Runyankore, Lusoga, Acholi), and Ugandan slang.",
    languages: "English, Luganda, Swahili or other Ugandan languages",
    searchRegion: "UG",
    serperGl: "ug",
    countryWord: "uganda",
  },
};

/** The countries a brand can listen in, as the client form offers them. */
export const COUNTRY_NAMES = Object.values(LISTENING_COUNTRIES).map((c) => c.name);

/** A brand's country (a name or a code, any case) as its profile. Anything that isn't Uganda, empty included, is Kenya. */
export function countryOf(value: string | null | undefined): ListeningCountry {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "uganda" || v === "ug" ? LISTENING_COUNTRIES.UG : LISTENING_COUNTRIES.KE;
}

/**
 * Where a new brand's country starts in the client form: the country most of the workspace's brands listen in. With no
 * brands yet, or a tie, there is none ("") and the form asks, so a workspace's first brand is never Kenyan by accident.
 */
export function defaultCountry(brands: { country?: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const b of brands) {
    const name = countryOf(b.country).name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const [first, second] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return !first || (second && second[1] === first[1]) ? "" : first[0];
}
