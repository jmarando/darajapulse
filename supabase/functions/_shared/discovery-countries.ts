// One playbook per country used by discovery harvesting + AI seeding.
// Edit this file to steer discovery: cities, hashtags, keywords, bio signals, niches.

export type CountryPlaybook = {
  code: string;
  name: string;
  demonym: string;
  phonePrefix: string;
  cities: string[];
  /** Lowercase substrings in a bio/caption that strongly suggest this country. */
  bioSignals: string[];
  tiktokHashtags: string[];
  tiktokKeywords: string[];
  instagramHashtags: string[];
  /** Local niches handed to the AI seeder. */
  niches: string[];
};

export const COUNTRY_PLAYBOOKS: Record<string, CountryPlaybook> = {
  KE: {
    code: "KE",
    name: "Kenya",
    demonym: "Kenyan",
    phonePrefix: "+254",
    cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Nyeri", "Machakos", "Kakamega", "Malindi"],
    bioSignals: ["kenya", "nairobi", "mombasa", "kisumu", "nakuru", "eldoret", "254", "ke 🇰🇪", "🇰🇪", "sheng", "kenyan"],
    tiktokHashtags: [
      "kenyantiktok", "kenyantiktok254", "nairobitiktok", "kenyancomedy", "kenyanfood",
      "kenyanmusic", "mombasatiktok", "kisumutiktok", "nairobifashion", "kenyanbeauty",
      "shengtiktok", "kenyandancers", "kenyanfarmers", "kenyanbusiness", "kenyangospel",
    ],
    tiktokKeywords: [
      "nairobi vlog", "kenyan recipes", "nairobi fashion", "kenya small business",
      "kenyan skits", "nairobi nightlife", "kenyan skincare", "kenya travel",
    ],
    instagramHashtags: [
      "nairobi", "kenya", "nairobifoodie", "kenyanfashion", "mombasa", "kisumu",
      "nairobibusiness", "kenyanbeauty", "magicalkenya", "nairobifashion",
    ],
    niches: [
      "food", "beauty", "comedy", "fitness", "fashion", "parenting", "finance", "gospel",
      "tech", "travel", "sports", "gaming", "lifestyle", "music", "news and politics",
      "matatu and street culture", "sheng and youth culture", "media personalities",
      "radio hosts", "TV hosts", "farming and livestock", "hustle and SME",
    ],
  },
  UG: {
    code: "UG",
    name: "Uganda",
    demonym: "Ugandan",
    phonePrefix: "+256",
    cities: ["Kampala", "Entebbe", "Jinja", "Gulu", "Mbarara", "Mbale", "Wakiso", "Masaka", "Fort Portal", "Arua"],
    bioSignals: ["uganda", "kampala", "entebbe", "jinja", "gulu", "mbarara", "256", "🇺🇬", "luganda", "ugandan", "pearl of africa"],
    tiktokHashtags: [
      "ugandantiktok", "ugandatiktok", "kampalatiktok", "ugandancomedy", "lugandaskits",
      "ugandanmusic", "ugandanfood", "kampalafashion", "ugandandancers", "ugandagospel",
      "jinjatiktok", "ugandanbusiness", "ugandanbeauty", "ugandanfarmers", "ugandanews",
    ],
    tiktokKeywords: [
      "kampala vlog", "ugandan recipes", "luganda comedy", "uganda small business",
      "kampala fashion", "uganda travel", "ugandan skincare", "uganda music video",
    ],
    instagramHashtags: [
      "kampala", "uganda", "ugandanfashion", "kampalafoodie", "entebbe", "jinja",
      "visituganda", "ugandanbeauty", "kampalanightlife", "ugandanmusic",
    ],
    niches: [
      "food", "beauty", "comedy", "fitness", "fashion", "parenting", "finance", "gospel",
      "tech", "travel", "sports", "music", "news and politics", "Luganda skits",
      "Kampala nightlife", "NBS and CBS presenters", "boda and street culture",
      "agribusiness", "hustle and SME", "media personalities",
    ],
  },
  TZ: {
    code: "TZ",
    name: "Tanzania",
    demonym: "Tanzanian",
    phonePrefix: "+255",
    cities: ["Dar es Salaam", "Arusha", "Mwanza", "Dodoma", "Zanzibar", "Mbeya", "Morogoro", "Tanga", "Moshi", "Iringa"],
    bioSignals: ["tanzania", "dar es salaam", "dar", "arusha", "mwanza", "dodoma", "zanzibar", "255", "🇹🇿", "bongo", "tanzanian", "mtanzania"],
    tiktokHashtags: [
      "tanzaniatiktok", "bongofleva", "tanzaniantiktok", "dartiktok", "vichekesho",
      "singeli", "bongomovie", "tanzanianfood", "zanzibartiktok", "arushatiktok",
      "tanzanianfashion", "bongostar", "tanzaniabusiness", "tanzanianbeauty", "mwanzatiktok",
    ],
    tiktokKeywords: [
      "dar es salaam vlog", "bongo fleva", "vichekesho tanzania", "mapishi ya kitanzania",
      "tanzania biashara", "zanzibar travel", "tanzanian fashion", "singeli dance",
    ],
    instagramHashtags: [
      "daressalaam", "tanzania", "bongofleva", "zanzibar", "arusha", "mwanza",
      "tanzanianfashion", "dartuna", "visittanzania", "tanzanianbeauty",
    ],
    niches: [
      "food", "beauty", "comedy", "fitness", "fashion", "parenting", "finance",
      "tech", "travel", "sports", "music", "news and politics", "Bongo Flava artists",
      "Singeli artists", "vichekesho comedians", "Clouds and Wasafi presenters",
      "Zanzibar and coast creators", "agribusiness", "hustle and SME", "media personalities",
    ],
  },
  ZM: {
    code: "ZM",
    name: "Zambia",
    demonym: "Zambian",
    phonePrefix: "+260",
    cities: ["Lusaka", "Kitwe", "Ndola", "Livingstone", "Kabwe", "Chingola", "Solwezi"],
    bioSignals: ["zambia", "lusaka", "kitwe", "ndola", "livingstone", "260", "🇿🇲", "zambian"],
    tiktokHashtags: ["zambiantiktok", "lusakatiktok", "zambianmusic", "zambiancomedy", "zambianfood", "zedmusic"],
    tiktokKeywords: ["lusaka vlog", "zambian recipes", "zed music", "zambia small business"],
    instagramHashtags: ["lusaka", "zambia", "zambianfashion", "livingstone", "zedfashion"],
    niches: ["food", "beauty", "comedy", "fashion", "music", "sports", "news and politics", "hustle and SME", "media personalities"],
  },
};

export const DEFAULT_HARVEST_COUNTRIES = ["KE", "UG", "TZ"];

export const playbook = (code: string): CountryPlaybook | null =>
  COUNTRY_PLAYBOOKS[(code || "").toUpperCase()] ?? null;

/** Best-effort country guess from free text (bio, caption, location). */
export function countryFromText(text: string, candidates: string[] = Object.keys(COUNTRY_PLAYBOOKS)): string | null {
  const t = (text || "").toLowerCase();
  if (!t) return null;
  for (const code of candidates) {
    const pb = COUNTRY_PLAYBOOKS[code];
    if (!pb) continue;
    if (pb.bioSignals.some((s) => t.includes(s))) return pb.code;
    if (pb.cities.some((c) => t.includes(c.toLowerCase()))) return pb.code;
  }
  return null;
}

/** City guess inside a known country. */
export function cityFromText(text: string, code: string): string | null {
  const pb = playbook(code);
  if (!pb) return null;
  const t = (text || "").toLowerCase();
  return pb.cities.find((c) => t.includes(c.toLowerCase())) ?? null;
}
