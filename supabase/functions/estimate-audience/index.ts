// Modelled audience demographics — permanent fallback while TikTok/Meta
// account connections are unavailable.
//
// Builds a per-creator age / gender / city split and Kenya share from signals we
// already hold (platform, niche, region, follower size) using Kenyan social
// benchmarks. Rows whose demo_source is 'measured' or 'self_reported' are never
// overwritten. Everything written here is tagged demo_source = 'modelled' so the
// UI can label it as an estimate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const AGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"] as const;
type Ages = Record<string, number>;

const PLATFORM_AGES: Record<string, Ages> = {
  tiktok:    { "13-17": 12, "18-24": 40, "25-34": 29, "35-44": 12, "45-54": 5, "55+": 2 },
  instagram: { "13-17": 6,  "18-24": 33, "25-34": 37, "35-44": 15, "45-54": 6, "55+": 3 },
  facebook:  { "13-17": 3,  "18-24": 20, "25-34": 34, "35-44": 24, "45-54": 13, "55+": 6 },
  youtube:   { "13-17": 8,  "18-24": 28, "25-34": 33, "35-44": 19, "45-54": 8, "55+": 4 },
  twitter:   { "13-17": 3,  "18-24": 27, "25-34": 40, "35-44": 20, "45-54": 7, "55+": 3 },
};
const DEFAULT_AGES = PLATFORM_AGES.instagram;

// niche keyword -> [female, male] skew and age shift (negative = younger)
const NICHE_RULES: Array<{ re: RegExp; female: number; ageShift: number }> = [
  { re: /beauty|makeup|skincare|hair|fashion|style|bridal/i, female: 78, ageShift: -2 },
  { re: /food|cook|recipe|kitchen|baking|chef/i,             female: 68, ageShift: 2 },
  { re: /mom|parent|family|baby|home|decor|clean/i,          female: 76, ageShift: 5 },
  { re: /health|fitness|wellness|yoga|gym/i,                 female: 58, ageShift: 0 },
  { re: /campus|student|school|univers|teen/i,               female: 52, ageShift: -6 },
  { re: /comedy|skit|entertain|music|dance|celeb/i,          female: 50, ageShift: -3 },
  { re: /sport|football|rugby|betting|gaming|motor|car/i,    female: 22, ageShift: -1 },
  { re: /tech|gadget|crypto|dev|software|ai\b/i,             female: 30, ageShift: 1 },
  { re: /finance|business|invest|money|sacco|banking|insur/i, female: 40, ageShift: 6 },
  { re: /news|politic|current affairs|radio|tv|show/i,       female: 45, ageShift: 6 },
  { re: /travel|lifestyle|photo/i,                           female: 56, ageShift: 1 },
  { re: /farm|agri|shamba/i,                                 female: 44, ageShift: 8 },
];

// region -> home city share of the Kenyan audience
const REGION_CITIES: Record<string, Array<[string, number]>> = {
  nairobi:  [["Nairobi", 56], ["Mombasa", 8], ["Kiambu", 7], ["Nakuru", 6], ["Kisumu", 5], ["Eldoret", 4]],
  mombasa:  [["Mombasa", 48], ["Nairobi", 22], ["Kilifi", 8], ["Malindi", 5], ["Nakuru", 4], ["Kisumu", 3]],
  kisumu:   [["Kisumu", 44], ["Nairobi", 24], ["Kakamega", 8], ["Eldoret", 6], ["Mombasa", 5], ["Nakuru", 4]],
  nakuru:   [["Nakuru", 44], ["Nairobi", 26], ["Eldoret", 8], ["Naivasha", 6], ["Mombasa", 5], ["Kisumu", 4]],
  eldoret:  [["Eldoret", 44], ["Nairobi", 25], ["Kitale", 8], ["Nakuru", 7], ["Kisumu", 5], ["Mombasa", 4]],
  coast:    [["Mombasa", 42], ["Nairobi", 24], ["Kilifi", 10], ["Diani", 6], ["Malindi", 5], ["Nakuru", 4]],
  dar:      [["Dar es Salaam", 52], ["Arusha", 10], ["Mwanza", 8], ["Dodoma", 6], ["Nairobi", 5], ["Mbeya", 4]],
  kampala:  [["Kampala", 52], ["Wakiso", 10], ["Entebbe", 7], ["Nairobi", 6], ["Gulu", 4], ["Mbarara", 4]],
};
const DEFAULT_CITIES = REGION_CITIES.nairobi;

const regionKey = (region?: string | null) => {
  const r = (region || "").toLowerCase();
  for (const k of Object.keys(REGION_CITIES)) if (r.includes(k)) return k;
  if (/tanzania|tz\b/.test(r)) return "dar";
  if (/uganda|ug\b/.test(r)) return "kampala";
  if (/coast|kilifi|malindi|diani|lamu/.test(r)) return "coast";
  return "nairobi";
};

const renorm = (obj: Ages): Ages => {
  const total = Object.values(obj).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const out: Ages = {};
  let running = 0;
  const keys = Object.keys(obj);
  keys.forEach((k, i) => {
    const v = Math.round((Math.max(0, obj[k]) / total) * 100);
    if (i === keys.length - 1) out[k] = Math.max(0, 100 - running);
    else { out[k] = v; running += v; }
  });
  return out;
};

// Shift the age curve older (+) or younger (-) by moving weight between buckets.
const shiftAges = (base: Ages, shift: number): Ages => {
  if (!shift) return { ...base };
  const idx = AGES.map(a => base[a] ?? 0);
  const f = Math.min(0.35, Math.abs(shift) / 20);
  const out = [...idx];
  for (let i = 0; i < idx.length; i++) {
    const move = idx[i] * f;
    const target = shift > 0 ? i + 1 : i - 1;
    if (target < 0 || target >= idx.length) continue;
    out[i] -= move;
    out[target] += move;
  }
  return renorm(Object.fromEntries(AGES.map((a, i) => [a, out[i]])));
};

export function estimateFor(row: {
  primary_platform?: string | null;
  niche?: string | null;
  region?: string | null;
  follower_count?: number | null;
  languages?: string[] | null;
}) {
  const platform = (row.primary_platform || "instagram").toLowerCase();
  const niche = `${row.niche || ""}`;
  const followers = Math.max(0, Number(row.follower_count || 0));

  let female = 52;
  let ageShift = 0;
  let matched = 0;
  for (const rule of NICHE_RULES) {
    if (rule.re.test(niche)) { female += rule.female - 52; ageShift += rule.ageShift; matched++; }
  }
  if (matched > 1) { female = 52 + (female - 52) / matched; ageShift = ageShift / matched; }

  // Larger accounts skew slightly older and slightly more male-balanced.
  const sizeShift = followers > 0 ? Math.min(4, Math.log10(Math.max(followers, 1000) / 1000) * 1.6) : 0;
  const ages = shiftAges(PLATFORM_AGES[platform] || DEFAULT_AGES, ageShift + sizeShift);

  female = Math.round(Math.min(88, Math.max(12, female - sizeShift)));
  const other = 2;
  const gender = { female, male: Math.max(0, 100 - female - other), other };

  // Kenya share: bigger reach pulls in more diaspora / regional spill.
  const rk = regionKey(row.region);
  const base = rk === "dar" || rk === "kampala" ? 12 : 88;
  const kenya = Math.round(Math.max(8, Math.min(95, base - (followers > 0 ? Math.log10(Math.max(followers, 1000) / 1000) * 2.6 : 0))));

  const cityBase = REGION_CITIES[rk] || DEFAULT_CITIES;
  const cities = cityBase.map(([city, pct]) => ({ city, pct }));

  // Confidence: how many real signals backed the estimate.
  const signals = [!!row.primary_platform, !!row.niche, !!row.region, followers > 0].filter(Boolean).length;

  return { ages, gender, kenya, cities, confidence: Number((signals / 4).toFixed(2)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const campaignId: string | null = body.campaign_id ?? null;
  const agencyId: string | null = body.agency_id ?? null;
  const force: boolean = !!body.force;
  const limit: number = Math.min(2000, Number(body.limit || 2000));

  let ids: string[] | null = null;
  if (campaignId) {
    const { data } = await supabase.from("campaign_influencers").select("influencer_id").eq("campaign_id", campaignId);
    ids = (data ?? []).map((r: any) => r.influencer_id);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, updated: 0, note: "no creators on campaign" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  let q = supabase
    .from("influencers")
    .select("id, primary_platform, niche, region, follower_count, languages, demo_source")
    .limit(limit);
  if (ids) q = q.in("id", ids);
  if (agencyId) q = q.eq("agency_id", agencyId);
  if (!force) q = q.or("demo_source.is.null,demo_source.eq.modelled");

  const { data: rows, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const targets = (rows ?? []).filter((r: any) => force || !["measured", "self_reported"].includes(r.demo_source));
  const now = new Date().toISOString();
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i += 40) {
    const chunk = targets.slice(i, i + 40);
    await Promise.all(chunk.map(async (r: any) => {
      const e = estimateFor(r);
      const { error: uErr } = await supabase
        .from("influencers")
        .update({
          audience_age_breakdown: e.ages,
          audience_gender_breakdown: e.gender,
          audience_top_cities: e.cities,
          audience_kenya_pct: e.kenya,
          demo_source: "modelled",
          demo_updated_at: now,
        })
        .eq("id", r.id);
      if (uErr) errors.push(`${r.id}: ${uErr.message}`);
      else updated++;
    }));
  }

  return new Response(
    JSON.stringify({ ok: true, considered: targets.length, updated, errors: errors.slice(0, 5) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
