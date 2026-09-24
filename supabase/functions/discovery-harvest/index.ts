// Discovery harvest — finds real creators in Kenya / Uganda / Tanzania from platform
// data (TikTok hashtag + keyword search, TikTok follow graph, Instagram hashtag search)
// instead of asking an AI to remember famous names.
//
// Spend is capped: every provider call costs 1 ScrapeCreators credit, the budget is split
// across countries and modes, and 20% is reserved for follower-count profile lookups.
// Each run is logged in discovery_harvest_runs and in scraper_credit_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { COUNTRY_PLAYBOOKS, DEFAULT_HARVEST_COUNTRIES, cityFromText, countryFromText, playbook } from "../_shared/discovery-countries.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SC_KEY = Deno.env.get("SCRAPECREATORS_API_KEY") ?? "";
const BASE = "https://api.scrapecreators.com";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type Mode = "hashtag" | "keyword" | "snowball";

// How much we trust a recorded country. Never downgrade.
const SOURCE_RANK: Record<string, number> = {
  verified: 5,
  platform_region: 4,
  imported: 3,
  inferred_campaign: 2,
  inferred_hashtag: 2,
  ai_estimated: 1,
  defaulted: 0,
};

const budget = { cap: 0, used: 0, remaining: null as number | null };

function num(v: any): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function scCall(path: string, params: Record<string, string>): Promise<any | null> {
  if (!SC_KEY) throw new Error("SCRAPECREATORS_API_KEY not configured");
  if (budget.used >= budget.cap) return null;
  const qs = new URLSearchParams(params).toString();
  let json: any;
  try {
    const r = await fetch(`${BASE}${path}?${qs}`, { headers: { "x-api-key": SC_KEY, Accept: "application/json" } });
    const text = await r.text();
    try { json = JSON.parse(text); } catch { console.error(`harvest non-JSON ${path} ${r.status}: ${text.slice(0, 160)}`); return null; }
    if (!r.ok || json?.success === false) {
      console.error(`harvest ${path} ${r.status}: ${String(json?.message ?? json?.error ?? "failed").slice(0, 160)}`);
      // Failed lookups are not charged.
      return null;
    }
  } catch (e) {
    console.error(`harvest ${path} threw:`, (e as Error).message);
    return null;
  }
  budget.used += Math.max(1, num(json?.credits_charged) || 1);
  if (json?.credits_remaining != null) budget.remaining = num(json.credits_remaining);
  return json;
}

type Candidate = {
  platform: "tiktok" | "instagram";
  handle: string;
  full_name: string;
  bio: string;
  followers: number | null;
  avatar: string | null;
  profile_url: string;
  country: string | null;
  countrySource: "platform_region" | "inferred_hashtag" | null;
  city: string | null;
  plays: number;
  isPrivate: boolean;
};

const ttUrl = (h: string) => `https://www.tiktok.com/@${h}`;
const igUrl = (h: string) => `https://www.instagram.com/${h}/`;

function tiktokAuthorToCandidate(a: any, code: string, plays: number): Candidate | null {
  const handle = String(a?.unique_id ?? a?.uniqueId ?? "").replace(/^@/, "").toLowerCase();
  if (!handle) return null;
  const bio = String(a?.signature ?? "");
  const region = String(a?.region ?? a?.account_region ?? "").toUpperCase();
  const text = `${bio} ${a?.nickname ?? ""}`;
  let country: string | null = null;
  let countrySource: Candidate["countrySource"] = null;
  if (region) {
    country = region;
    countrySource = "platform_region";
  } else {
    const guess = countryFromText(text, [code]);
    if (guess) { country = guess; countrySource = "inferred_hashtag"; }
  }
  return {
    platform: "tiktok",
    handle,
    full_name: String(a?.nickname ?? handle).trim() || handle,
    bio,
    followers: a?.follower_count != null ? num(a.follower_count) : null,
    avatar: a?.avatar_medium?.url_list?.[0] ?? a?.avatar_168x168?.url_list?.[0] ?? a?.avatar_thumb?.url_list?.[0] ?? null,
    profile_url: ttUrl(handle),
    country,
    countrySource,
    city: country ? cityFromText(text, country) : null,
    plays,
    isPrivate: !!(a?.is_private_account ?? a?.secret),
  };
}

async function tiktokProfile(handle: string): Promise<{ followers: number | null; region: string | null; bio: string; name: string | null; avatar: string | null } | null> {
  const j = await scCall("/v1/tiktok/profile", { handle, trim: "true" });
  if (!j) return null;
  const u = j?.user ?? j?.data?.user ?? {};
  const s = j?.statsV2 ?? j?.stats ?? j?.user?.stats ?? {};
  return {
    followers: num(s?.followerCount ?? u?.followerCount ?? j?.followerCount) || null,
    region: (u?.region ?? j?.region ?? null) ? String(u?.region ?? j?.region).toUpperCase() : null,
    bio: String(u?.signature ?? ""),
    name: u?.nickname ?? null,
    avatar: u?.avatarMedium ?? u?.avatarThumb ?? null,
  };
}

// ---------- harvest modes ----------

async function harvestTikTokSearch(mode: "hashtag" | "keyword", code: string, perMode: number, out: Map<string, Candidate>) {
  const pb = playbook(code)!;
  const terms = mode === "hashtag" ? pb.tiktokHashtags : pb.tiktokKeywords;
  const spendStart = budget.used;
  for (const term of terms) {
    if (budget.used - spendStart >= perMode || budget.used >= budget.cap) break;
    // Hashtag search is flaky when a proxy region is forced, so only keyword search sets it.
    const j = mode === "hashtag"
      ? await scCall("/v1/tiktok/search/hashtag", { hashtag: term, trim: "true" })
      : await scCall("/v1/tiktok/search/keyword", { query: term, region: code, trim: "true" });
    const list: any[] = j?.aweme_list ?? j?.search_item_list ?? [];
    for (const item of list) {
      const author = item?.author ?? item?.aweme_info?.author;
      const plays = num(item?.statistics?.play_count ?? item?.aweme_info?.statistics?.play_count);
      const c = author ? tiktokAuthorToCandidate(author, code, plays) : null;
      if (!c) continue;
      const key = `tiktok:${c.handle}`;
      const prev = out.get(key);
      if (!prev || (c.followers ?? 0) > (prev.followers ?? 0)) out.set(key, { ...c, plays: Math.max(plays, prev?.plays ?? 0) });
    }
  }
}

async function harvestSnowball(code: string, perMode: number, out: Map<string, Candidate>) {
  const { data: seeds } = await supabase
    .from("discovery_creators")
    .select("handle")
    .eq("platform", "tiktok")
    .eq("country_code", code)
    .in("country_source", ["verified", "platform_region"])
    .gte("follower_count", 5000)
    .order("follower_count", { ascending: false })
    .limit(40);
  const spendStart = budget.used;
  for (const s of (seeds ?? [])) {
    if (budget.used - spendStart >= perMode || budget.used >= budget.cap) break;
    const j = await scCall("/v1/tiktok/user/following", { handle: s.handle, trim: "true" });
    for (const f of (j?.followings ?? [])) {
      const c = tiktokAuthorToCandidate(f, code, 0);
      if (!c) continue;
      const key = `tiktok:${c.handle}`;
      if (!out.has(key)) out.set(key, c);
    }
  }
}

async function harvestInstagram(code: string, perMode: number, out: Map<string, Candidate>) {
  const pb = playbook(code)!;
  const spendStart = budget.used;
  for (const tag of pb.instagramHashtags) {
    if (budget.used - spendStart >= perMode || budget.used >= budget.cap) break;
    const j = await scCall("/v1/instagram/search/hashtag", { hashtag: tag, media_type: "all" });
    for (const post of (j?.posts ?? [])) {
      const o = post?.owner;
      const handle = String(o?.username ?? "").replace(/^@/, "").toLowerCase();
      if (!handle) continue;
      const text = `${o?.full_name ?? ""} ${post?.caption ?? ""} ${post?.location?.name ?? ""}`;
      // No region field on Instagram — the hashtag plus caption/location wording is the signal.
      const guess = countryFromText(text, [code]) ?? code;
      const key = `instagram:${handle}`;
      if (out.has(key)) continue;
      out.set(key, {
        platform: "instagram",
        handle,
        full_name: String(o?.full_name ?? handle).trim() || handle,
        bio: "",
        followers: o?.follower_count != null ? num(o.follower_count) : null,
        avatar: o?.profile_pic_url ?? null,
        profile_url: igUrl(handle),
        country: guess,
        countrySource: "inferred_hashtag",
        city: cityFromText(text, guess),
        plays: num(post?.video_play_count ?? post?.like_count),
        isPrivate: !!o?.is_private,
      });
    }
  }
}

// ---------- persistence ----------

async function saveCandidates(cands: Candidate[], code: string, minFollowers: number, minPlays: number, reserve: number) {
  let inserted = 0, updated = 0, skipped = 0;
  const why = { private: 0, country: 0, followers: 0, unchanged: 0, error: 0 };
  const reserveStart = budget.used;

  // Spend the profile-lookup reserve on the best-performing posts first.
  const ordered = [...cands].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0) || b.plays - a.plays);

  for (const c of ordered) {
    if (c.isPrivate) { skipped++; why.private++; continue; }

    // Unknown follower count: only worth a paid profile lookup when the post did well.
    if (c.platform === "tiktok" && (c.followers == null || c.country == null) &&
        c.plays >= minPlays && budget.used - reserveStart < reserve && budget.used < budget.cap) {
      const p = await tiktokProfile(c.handle);
      if (p) {
        if (p.followers != null) c.followers = p.followers;
        if (p.region) { c.country = p.region; c.countrySource = "platform_region"; }
        if (p.bio) c.bio = p.bio;
        if (p.name) c.full_name = p.name;
        if (p.avatar) c.avatar = p.avatar;
        if (!c.city && c.country) c.city = cityFromText(`${c.bio} ${c.full_name}`, c.country);
      }
    }

    if (c.country !== code) { skipped++; why.country++; continue; }   // wrong country, or still unknown
    if ((c.followers ?? 0) < minFollowers) { skipped++; why.followers++; continue; }

    const { data: existing } = await supabase
      .from("discovery_creators")
      .select("id, country_code, country_source, follower_count, bio, avatar_url, city")
      .eq("platform", c.platform)
      .eq("handle", c.handle)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("discovery_creators").insert({
        full_name: c.full_name,
        handle: c.handle,
        platform: c.platform,
        profile_url: c.profile_url,
        avatar_url: c.avatar,
        bio: c.bio || null,
        follower_count: c.followers ?? 0,
        engagement_rate: 0,
        region: playbook(code)?.name ?? null,
        country_code: code,
        country_source: c.countrySource ?? "inferred_hashtag",
        city: c.city,
        niche: [],
        source: "harvest",
      });
      if (error) { console.error("insert err", c.handle, error.message); skipped++; why.error++; }
      else inserted++;
      continue;
    }

    // Never overwrite a verified row; only fill gaps or upgrade weaker data.
    const patch: Record<string, unknown> = {};
    const oldRank = SOURCE_RANK[String(existing.country_source ?? "defaulted")] ?? 0;
    const newRank = SOURCE_RANK[c.countrySource ?? "inferred_hashtag"] ?? 0;
    if (existing.country_source !== "verified" && newRank > oldRank) {
      patch.country_code = code;
      patch.country_source = c.countrySource;
    }
    if ((c.followers ?? 0) > (existing.follower_count ?? 0)) patch.follower_count = c.followers;
    if (!existing.bio && c.bio) patch.bio = c.bio;
    if (!existing.avatar_url && c.avatar) patch.avatar_url = c.avatar;
    if (!existing.city && c.city) patch.city = c.city;
    if (Object.keys(patch).length) {
      await supabase.from("discovery_creators").update(patch).eq("id", existing.id);
      updated++;
    } else { skipped++; why.unchanged++; }
  }

  console.log(`[discovery-harvest] ${code} skips`, why);
  return { inserted, updated, skipped, why };
}

// ---------- run ----------

// One country per invocation — edge functions get killed long before three
// countries finish — then the run hands the remaining countries to a fresh call.
async function runHarvest(opts: {
  runId: string; countries: string[]; modes: Mode[]; maxCredits: number;
  minFollowers: number; minPlays: number; includeInstagram: boolean;
}) {
  const code = opts.countries[0];
  const rest = opts.countries.slice(1);
  // Most search results carry no follower count, so a healthy share of the budget
  // is kept for profile lookups on the best-performing accounts.
  const perCountryReserve = Math.floor(opts.maxCredits * 0.4);
  const searchBudget = opts.maxCredits - perCountryReserve;
  const lanes = opts.modes.length + (opts.includeInstagram ? 1 : 0);
  const perMode = Math.max(1, Math.floor(searchBudget / Math.max(1, lanes)));

  const found = new Map<string, Candidate>();
  let stats: Record<string, unknown> = {};
  if (playbook(code)) {
    try {
      if (opts.modes.includes("hashtag")) await harvestTikTokSearch("hashtag", code, perMode, found);
      if (opts.modes.includes("keyword")) await harvestTikTokSearch("keyword", code, perMode, found);
      if (opts.modes.includes("snowball")) await harvestSnowball(code, perMode, found);
      if (opts.includeInstagram) await harvestInstagram(code, perMode, found);
    } catch (e) {
      console.error(`harvest ${code} failed:`, (e as Error).message);
    }
    const res = await saveCandidates([...found.values()], code, opts.minFollowers, opts.minPlays, perCountryReserve);
    stats = { [code]: { candidates: found.size, ...res, credits: budget.used } };
    await supabase.from("discovery_harvest_runs").update({
      credits_used: budget.used,
      credits_remaining: budget.remaining,
      candidates_seen: found.size,
      inserted_count: res.inserted,
      updated_count: res.updated,
      per_country: stats,
      finished_at: new Date().toISOString(),
    }).eq("id", opts.runId);
    console.log(`[discovery-harvest] ${code}`, stats[code]);

    if (budget.used > 0) {
      await supabase.from("scraper_credit_log").insert({
        provider: "scrapecreators",
        credits: budget.used,
        credits_remaining: budget.remaining,
        context: `discovery-harvest ${code} ${opts.modes.join("+")}`,
      });
    }
  }

  const leftCredits = opts.maxCredits - budget.used;
  if (rest.length && leftCredits < 10) console.log(`[discovery-harvest] total budget spent; skipping ${rest.join(",")}`);
  if (rest.length && leftCredits >= 10) {
    await fetch(`${SUPABASE_URL}/functions/v1/discovery-harvest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "x-internal-key": SERVICE_KEY,
      },
      body: JSON.stringify({
        countries: rest,
        modes: opts.modes,
        max_credits: leftCredits,
        min_followers: opts.minFollowers,
        min_plays: opts.minPlays,
        include_instagram: opts.includeInstagram,
      }),
    }).catch((e) => console.error("chain failed", e));
  }
  console.log(`[discovery-harvest] DONE ${code} credits=${budget.used}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SC_KEY) {
      return new Response(JSON.stringify({ error: "The scraping service key is not configured." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Agency staff only — except the function's own country-to-country chaining.
    const internal = req.headers.get("x-internal-key") === SERVICE_KEY;
    let uid: string | null = null;
    if (!internal) {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      const { data: userData } = await supabase.auth.getUser(token);
      uid = userData?.user?.id ?? null;
      if (!uid) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const allowed = (roles ?? []).some((r: any) => ["agency_admin", "account_manager"].includes(r.role));
      if (!allowed) return new Response(JSON.stringify({ error: "Only agency staff can run discovery harvests" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const countries: string[] = (body.countries?.length ? body.countries : DEFAULT_HARVEST_COUNTRIES)
      .map((c: string) => String(c).toUpperCase())
      .filter((c: string) => !!COUNTRY_PLAYBOOKS[c]);
    if (!countries.length) {
      return new Response(JSON.stringify({ error: "No supported country selected (Kenya, Uganda, Tanzania, Zambia)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const modes: Mode[] = (body.modes?.length ? body.modes : ["hashtag", "keyword", "snowball"]) as Mode[];
    const maxCredits = Math.max(10, Math.min(5000, Number(body.max_credits ?? 400)));
    const minFollowers = Math.max(0, Number(body.min_followers ?? 3000));
    const minPlays = Math.max(0, Number(body.min_plays ?? 20000));
    const includeInstagram = body.include_instagram !== false;

    budget.cap = maxCredits; budget.used = 0; budget.remaining = null;

    const { data: run, error: runErr } = await supabase.from("discovery_harvest_runs").insert({
      mode: modes.join("+") + (includeInstagram ? "+instagram" : ""),
      countries: [countries[0]],
      started_by: uid,
      notes: `cap ${maxCredits} credits total (remaining) · min ${minFollowers} followers`,
    }).select("id").single();
    if (runErr) throw new Error(runErr.message);

    // @ts-ignore - EdgeRuntime is available in the Supabase edge runtime
    EdgeRuntime.waitUntil(
      runHarvest({ runId: run.id, countries, modes, maxCredits, minFollowers, minPlays, includeInstagram })
        .catch(async (e) => {
          console.error("harvest fatal", e);
          await supabase.from("discovery_harvest_runs").update({ error: String(e), finished_at: new Date().toISOString(), credits_used: budget.used }).eq("id", run.id);
        }),
    );

    return new Response(JSON.stringify({
      ok: true,
      run_id: run.id,
      countries,
      max_credits: maxCredits,
      message: `Harvest started for ${countries.join(", ")} — up to ${maxCredits} credits in total. New creators appear over the next few minutes.`,
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("harvest error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
