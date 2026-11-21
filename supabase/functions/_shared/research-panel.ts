// Who answers a consumer-research study: the panel spec a person builds (country, size and the
// share of each age band, gender, region, setting, income tier and language, plus optional
// attitudes) and the respondents drawn from it. Each dimension's shares become exact counts
// (largest remainder), shuffled with a seed from the study, so the same study always gets the
// same people and every stimulus is judged by them all.
//
// Pure, so the job, the page and tests share it.
import { countryOf, type CountryCode } from "./listening-country.ts";

export type Shares = Record<string, number>;

export type PanelSpec = {
  country: CountryCode;
  size: number;
  ages: Shares;
  genders: Shares;
  regions: Shares;
  settings: Shares;
  incomes: Shares;
  languages: Shares;
  /** Optional mindsets, shared out evenly ("price-sensitive mum", "Gen Z early adopter"). */
  attitudes: string[];
  /** The free-text audience the spec was filled from, kept for the record. */
  description?: string;
};

export type Respondent = {
  idx: number;
  name: string;
  age: number;
  age_band: string;
  gender: string;
  region: string;
  setting: string;
  income: string;
  language: string;
  attitude: string | null;
};

export const PANEL_SIZES = [50, 100, 200, 300] as const;
export const MAX_PANEL = 300;
export const MAX_ATTITUDES = 6;

export const AGE_BANDS: Record<string, [number, number]> = {
  "18-24": [18, 24],
  "25-34": [25, 34],
  "35-44": [35, 44],
  "45-54": [45, 54],
  "55+": [55, 68],
};
export const GENDERS = ["Female", "Male"];
export const SETTINGS = ["Urban", "Peri-urban", "Rural"];

type CountryPanel = {
  currency: string;
  regions: string[];
  languages: string[];
  /** Income tiers with what each means where the respondent lives. */
  incomes: Record<string, string>;
  names: { Female: string[]; Male: string[] };
  defaults: Omit<PanelSpec, "country" | "size" | "attitudes" | "description">;
};

export const COUNTRY_PANELS: Record<CountryCode, CountryPanel> = {
  KE: {
    currency: "KES",
    regions: ["Nairobi", "Mombasa & Coast", "Kisumu & Western", "Nakuru & Rift Valley", "Central Kenya", "Eastern & North"],
    languages: ["English", "Kiswahili", "Sheng"],
    incomes: {
      "Low income": "household earns under KES 20,000 a month; every shilling is counted",
      "Lower-middle": "household earns about KES 20,000–50,000 a month",
      "Middle": "household earns about KES 50,000–120,000 a month",
      "Upper-middle": "household earns about KES 120,000–300,000 a month",
      "Affluent": "household earns over KES 300,000 a month",
    },
    names: {
      Female: ["Wanjiku", "Achieng", "Mercy", "Faith", "Njeri", "Akinyi", "Chebet", "Mwende", "Halima", "Grace", "Wairimu", "Atieno", "Nekesa", "Zawadi", "Esther"],
      Male: ["Kamau", "Otieno", "Brian", "Kevin", "Mwangi", "Ochieng", "Kiprop", "Mutua", "Hassan", "Dennis", "Njoroge", "Omondi", "Wafula", "Baraka", "Collins"],
    },
    defaults: {
      ages: { "18-24": 25, "25-34": 35, "35-44": 22, "45-54": 12, "55+": 6 },
      genders: { Female: 50, Male: 50 },
      regions: { "Nairobi": 35, "Mombasa & Coast": 12, "Kisumu & Western": 15, "Nakuru & Rift Valley": 15, "Central Kenya": 13, "Eastern & North": 10 },
      settings: { Urban: 55, "Peri-urban": 25, Rural: 20 },
      incomes: { "Low income": 25, "Lower-middle": 35, "Middle": 25, "Upper-middle": 12, "Affluent": 3 },
      languages: { English: 40, Kiswahili: 40, Sheng: 20 },
    },
  },
  UG: {
    currency: "UGX",
    regions: ["Kampala", "Wakiso & Mukono", "Central (other)", "Eastern", "Western", "Northern"],
    languages: ["English", "Luganda", "Swahili", "Runyankore"],
    incomes: {
      "Low income": "household earns under UGX 500,000 a month; every shilling is counted",
      "Lower-middle": "household earns about UGX 500,000–1,500,000 a month",
      "Middle": "household earns about UGX 1,500,000–4,000,000 a month",
      "Upper-middle": "household earns about UGX 4,000,000–10,000,000 a month",
      "Affluent": "household earns over UGX 10,000,000 a month",
    },
    names: {
      Female: ["Nakato", "Namubiru", "Atim", "Kemigisa", "Nansubuga", "Akello", "Babirye", "Patience", "Florence", "Joan", "Nalwoga", "Kyomuhendo", "Auma", "Sarah", "Prossy"],
      Male: ["Mukasa", "Ssempijja", "Okello", "Tumusiime", "Kato", "Opio", "Byaruhanga", "Wasswa", "Ronald", "Isaac", "Lubega", "Mugisha", "Odongo", "Moses", "Brian"],
    },
    defaults: {
      ages: { "18-24": 30, "25-34": 35, "35-44": 20, "45-54": 10, "55+": 5 },
      genders: { Female: 50, Male: 50 },
      regions: { "Kampala": 30, "Wakiso & Mukono": 20, "Central (other)": 10, "Eastern": 15, "Western": 15, "Northern": 10 },
      settings: { Urban: 50, "Peri-urban": 25, Rural: 25 },
      incomes: { "Low income": 30, "Lower-middle": 35, "Middle": 22, "Upper-middle": 10, "Affluent": 3 },
      languages: { English: 40, Luganda: 35, Swahili: 10, Runyankore: 15 },
    },
  },
};

/** A brand's starting panel: its country's defaults, 100 people, no attitudes. */
export function defaultPanel(country: string | null | undefined): PanelSpec {
  const code = countryOf(country).code;
  const d = COUNTRY_PANELS[code].defaults;
  return { country: code, size: 100, ...structuredClone(d), attitudes: [] };
}

/** The options each dimension offers for a country. */
export function dimensionOptions(country: CountryCode) {
  const c = COUNTRY_PANELS[country];
  return {
    ages: Object.keys(AGE_BANDS),
    genders: GENDERS,
    regions: c.regions,
    settings: SETTINGS,
    incomes: Object.keys(c.incomes),
    languages: c.languages,
  };
}

/**
 * Exact counts for n people from shares (any scale): floor each, then hand the remaining
 * places to the largest remainders. Unknown or negative shares count as 0; all-zero shares
 * fall back to an even split so a dimension can never leave someone out.
 */
export function allocate(shares: Shares, n: number): Record<string, number> {
  const keys = Object.keys(shares);
  if (!keys.length || n <= 0) return {};
  let weights = keys.map((k) => (Number.isFinite(shares[k]) && shares[k] > 0 ? shares[k] : 0));
  if (weights.every((w) => w === 0)) weights = keys.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / total) * n);
  const counts = exact.map(Math.floor);
  let left = n - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let j = 0; left > 0; j = (j + 1) % order.length, left--) counts[order[j].i]++;
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]]));
}

/** A small, fast seeded generator (mulberry32), so a study's panel is the same every time. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function expand(shares: Shares, n: number, rand: () => number): string[] {
  const counts = allocate(shares, n);
  return shuffled(Object.entries(counts).flatMap(([k, c]) => Array(c).fill(k)), rand);
}

/** Keeps a spec inside what the job accepts: a known country, 1–300 people, at most six attitudes. */
export function cleanPanel(spec: Partial<PanelSpec> | null | undefined): PanelSpec {
  const base = defaultPanel(spec?.country);
  const opts = dimensionOptions(base.country);
  const pick = (given: Shares | undefined, allowed: string[], fallback: Shares): Shares => {
    if (!given || typeof given !== "object") return fallback;
    const out: Shares = {};
    for (const k of allowed) out[k] = Math.max(0, Number(given[k]) || 0);
    return Object.values(out).some((v) => v > 0) ? out : fallback;
  };
  const size = Math.round(Number(spec?.size) || base.size);
  return {
    country: base.country,
    size: Math.min(MAX_PANEL, Math.max(1, size)),
    ages: pick(spec?.ages, opts.ages, base.ages),
    genders: pick(spec?.genders, opts.genders, base.genders),
    regions: pick(spec?.regions, opts.regions, base.regions),
    settings: pick(spec?.settings, opts.settings, base.settings),
    incomes: pick(spec?.incomes, opts.incomes, base.incomes),
    languages: pick(spec?.languages, opts.languages, base.languages),
    attitudes: (Array.isArray(spec?.attitudes) ? spec!.attitudes : [])
      .map((a) => String(a ?? "").trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, MAX_ATTITUDES),
    description: typeof spec?.description === "string" ? spec.description.slice(0, 600) : undefined,
  };
}

/** The study's respondents: every dimension matches its shares exactly, mixed by the seed. */
export function drawPanel(spec: PanelSpec, seed: string): Respondent[] {
  const s = cleanPanel(spec);
  const rand = seededRandom(seed);
  const n = s.size;
  const ages = expand(s.ages, n, rand);
  const genders = expand(s.genders, n, rand);
  const regions = expand(s.regions, n, rand);
  const settings = expand(s.settings, n, rand);
  const incomes = expand(s.incomes, n, rand);
  const languages = expand(s.languages, n, rand);
  const attitudes = s.attitudes.length
    ? shuffled(Array.from({ length: n }, (_, i) => s.attitudes[i % s.attitudes.length]), rand)
    : [];
  const names = COUNTRY_PANELS[s.country].names;
  return Array.from({ length: n }, (_, i) => {
    const band = ages[i];
    const [lo, hi] = AGE_BANDS[band];
    const gender = genders[i];
    const pool = names[gender as "Female" | "Male"] ?? [...names.Female, ...names.Male];
    return {
      idx: i,
      name: pool[Math.floor(rand() * pool.length)],
      age: lo + Math.floor(rand() * (hi - lo + 1)),
      age_band: band,
      gender,
      region: regions[i],
      setting: settings[i],
      income: incomes[i],
      language: languages[i],
      attitude: attitudes[i] ?? null,
    };
  });
}

/** The respondent's voice: who they are, how they talk and what the survey expects of them. */
export function personaPrompt(r: Respondent, country: CountryCode): string {
  const c = COUNTRY_PANELS[country];
  const countryName = countryOf(country).name;
  const income = c.incomes[r.income] ?? r.income;
  const who = r.gender === "Female" ? "woman" : r.gender === "Male" ? "man" : "person";
  return [
    `You are ${r.name}, a ${r.age}-year-old ${who} living in ${r.region}, ${countryName} (${r.setting.toLowerCase()} area).`,
    `Your ${income}.`,
    `In daily life you mostly speak ${r.language}.`,
    r.attitude ? `About yourself: ${r.attitude}.` : "",
    "You are taking part in a consumer survey. React as yourself, with your own budget, habits and tastes.",
    "Be honest rather than polite: if something doesn't appeal to you, or you couldn't afford it, say so plainly. Don't hedge everything.",
    `Prices are in ${c.currency}. Answer each question in 1–3 natural sentences in everyday English; you may use the odd ${r.language === "English" ? "local" : r.language} word as people do.`,
    "Never mention that you are an AI or a persona.",
  ].filter(Boolean).join(" ");
}

/** The segments results can be split by, with each respondent's value. */
export const SEGMENTS: { key: keyof Respondent; label: string }[] = [
  { key: "age_band", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "region", label: "Region" },
  { key: "setting", label: "Setting" },
  { key: "income", label: "Income" },
  { key: "language", label: "Language" },
  { key: "attitude", label: "Mindset" },
];
