// Seed Mediamax Group talent + Kenyan TV/Radio/Podcast shows using Lovable AI.
// - Upserts creators into discovery_creators (with works_for + audience_demo)
// - Upserts shows into public.shows
// - Auto-creates inventory_items for Mediamax talent so they appear on the storefront
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MEDIAMAX_AGENCY_ID = "94a18a0b-5e45-4e6b-a387-e350b78a5045";

// Mediamax Group properties
const MEDIAMAX_STATIONS = [
  { name: "K24 TV", kind: "tv", city: "Nairobi", language: "English/Swahili" },
  { name: "People Daily", kind: "digital", city: "Nairobi", language: "English" },
  { name: "Milele FM", kind: "radio", city: "Nairobi", language: "Swahili" },
  { name: "Meru FM", kind: "radio", city: "Meru", language: "Kimeru" },
  { name: "Pilipili FM", kind: "radio", city: "Mombasa", language: "Swahili" },
  { name: "Emoo FM", kind: "radio", city: "Kapsabet", language: "Kalenjin" },
  { name: "Kameme FM", kind: "radio", city: "Nairobi", language: "Kikuyu" },
  { name: "Mayian FM", kind: "radio", city: "Narok", language: "Maa" },
  { name: "Msenangu FM", kind: "radio", city: "Machakos", language: "Kamba" },
];

// Other major KE broadcasters (shows-only pass, no auto-storefront)
const OTHER_BROADCASTERS = [
  { group: "Royal Media Services", stations: ["Citizen TV", "Radio Citizen", "Ramogi FM", "Inooro TV", "Inooro FM", "Musyi FM", "Mulembe FM", "Chamgei FM"] },
  { group: "Radio Africa Group", stations: ["Kiss FM", "Classic 105", "Radio Jambo", "Kiss TV", "The Star"] },
  { group: "Standard Group", stations: ["KTN Home", "KTN News", "Radio Maisha", "Spice FM", "Berur FM"] },
  { group: "Nation Media Group", stations: ["NTV Kenya", "QFM", "Nation FM"] },
];

type Creator = {
  full_name: string; handle?: string; platform?: string; profile_url?: string;
  follower_estimate?: number; engagement_estimate?: number;
  role?: string; station?: string; shows?: string[];
  city?: string; bio?: string; public_email?: string; public_phone?: string;
  audience_demo?: any; confidence?: number;
};

type Show = {
  name: string; kind: string; station: string; group?: string;
  host_names?: string[]; airtime?: string; days_on_air?: string[];
  platforms?: string[]; handles?: Record<string, string>;
  niche?: string[]; city?: string; description?: string;
  reach_estimate?: number; audience_demo?: any;
  public_email?: string; public_phone?: string; whatsapp?: string;
  confidence?: number;
};

async function ask(prompt: string): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You output strict JSON only. No prose. Never invent people or shows you are unsure about." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("AI err", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = await res.json();
  const txt: string = data?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(txt); } catch { return null; }
}

function cleanHandle(h?: string): string | null {
  if (!h) return null;
  return String(h).trim().replace(/^@+/, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/[/?#].*$/, "").toLowerCase() || null;
}

async function askMediamaxTalent(station: { name: string; kind: string }): Promise<Creator[]> {
  const prompt = `List up to 20 real, well-known on-air presenters, DJs, news anchors, sports/political/entertainment hosts and journalists currently or recently working at ${station.name} (Mediamax Network Ltd, Kenya).
Return strict JSON: { "creators": [ ... ] }. Each item MUST have:
- full_name (string)
- role (string, e.g. "news anchor", "morning show host", "DJ", "sports presenter")
- shows (string[], the show names on ${station.name} they present)
- handle (string, primary social handle no @, or "")
- platform (one of: instagram, tiktok, youtube, twitter, facebook — their strongest)
- profile_url (string, https URL to that profile)
- follower_estimate (integer)
- engagement_estimate (number, percent)
- city (string, usually Nairobi)
- bio (string, max 140 chars)
- public_email (string or "" — only if widely listed)
- public_phone (string or "" — Kenyan format if widely listed)
- audience_demo (object: { age_bands: {"18-24": %, "25-34": %, "35-44": %, "45+": %}, gender: {"female": %, "male": %}, top_cities: ["Nairobi","Mombasa",...], estimated: true })
- confidence (0..1)
Only include real, verifiable people. Omit if unsure.`;
  const out = await ask(prompt);
  return Array.isArray(out?.creators) ? out.creators : [];
}

async function askShows(group: string, station: string, kind: string): Promise<Show[]> {
  const prompt = `List up to 12 real, currently-airing (or very recently aired) shows on ${station} (${group}, Kenya). ${kind === "tv" ? "TV station" : kind === "radio" ? "radio station" : "publisher"}.
Return strict JSON: { "shows": [ ... ] }. Each item:
- name (string)
- kind ("${kind}")
- station ("${station}")
- host_names (string[], main hosts)
- airtime (string, e.g. "Weekdays 06:00–10:00" or "Sundays 20:00")
- days_on_air (string[], from Mon..Sun or ["Weekdays","Weekends"])
- platforms (string[], subset of: instagram, tiktok, youtube, facebook, twitter)
- handles (object with instagram/tiktok/youtube/facebook/twitter/website keys — values are handles/usernames, no @)
- niche (string[], e.g. ["news","politics"], ["entertainment","comedy"], ["gospel"], ["sports"])
- city (string)
- description (string, max 180 chars)
- reach_estimate (integer, weekly reach or followers of the show's own handle)
- audience_demo (object: { age_bands, gender, top_cities, estimated: true })
- public_email (string or "")
- public_phone (string or "")
- whatsapp (string or "")
- confidence (0..1)
Only real shows. Omit if unsure.`;
  const out = await ask(prompt);
  return Array.isArray(out?.shows) ? out.shows : [];
}

async function upsertCreator(sb: any, c: Creator, station: string, works_for: string[]): Promise<string | null> {
  const handle = cleanHandle(c.handle);
  if (!c.full_name || !c.platform) return null;
  const niches = Array.from(new Set(["media personality", station.toLowerCase().replace(/\s+/g, "-")]));
  const row: any = {
    full_name: c.full_name,
    handle: handle || c.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "."),
    platform: c.platform,
    profile_url: c.profile_url ?? null,
    niche: niches,
    region: "Kenya",
    city: c.city || "Nairobi",
    follower_count: Number(c.follower_estimate) || 0,
    engagement_rate: Number(c.engagement_estimate) || 0,
    bio: c.bio || (c.role ? `${c.role} at ${station}` : null),
    source: "ai_seed_mediamax",
    ai_confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.6)),
    audience_demo: c.audience_demo || null,
    demo_source: c.audience_demo ? "ai_estimated" : null,
    works_for,
    shows: c.shows || [],
  };

  // Idempotent: match by (platform, handle) if we have a handle; else by (platform, full_name lowered) approximation.
  let existing: any = null;
  if (handle) {
    const { data } = await sb.from("discovery_creators")
      .select("id, niche, works_for, shows, audience_demo, ai_confidence, verified_at")
      .eq("platform", c.platform).eq("handle", row.handle).maybeSingle();
    existing = data;
  }
  if (!existing) {
    const { data } = await sb.from("discovery_creators")
      .select("id, niche, works_for, shows, audience_demo, ai_confidence, verified_at")
      .eq("platform", c.platform).ilike("full_name", c.full_name).maybeSingle();
    existing = data;
  }

  if (existing) {
    const mergedNiche = Array.from(new Set([...(existing.niche || []), ...niches]));
    const mergedWorksFor = Array.from(new Set([...(existing.works_for || []), ...works_for]));
    const mergedShows = Array.from(new Set([...(existing.shows || []), ...(c.shows || [])]));
    const patch: any = {
      niche: mergedNiche,
      works_for: mergedWorksFor,
      shows: mergedShows,
    };
    if (!existing.audience_demo && row.audience_demo) {
      patch.audience_demo = row.audience_demo;
      patch.demo_source = "ai_estimated";
    }
    if (!existing.verified_at) {
      patch.ai_confidence = Math.max(Number(existing.ai_confidence) || 0, row.ai_confidence);
    }
    await sb.from("discovery_creators").update(patch).eq("id", existing.id);
    return existing.id;
  } else {
    const { data, error } = await sb.from("discovery_creators").insert(row).select("id").maybeSingle();
    if (error) { console.error("creator insert err", error.message, row.full_name); return null; }
    return data?.id ?? null;
  }
}

async function addCreatorContacts(sb: any, creatorId: string, c: Creator) {
  if (c.public_email) {
    await sb.from("discovery_contacts").upsert(
      { creator_id: creatorId, kind: "email", value: c.public_email, is_public: true, label: "media" },
      { onConflict: "creator_id,kind,value", ignoreDuplicates: true } as any,
    ).catch(() => {});
  }
  if (c.public_phone) {
    await sb.from("discovery_contacts").upsert(
      { creator_id: creatorId, kind: "phone", value: c.public_phone, is_public: true, label: "media" },
      { onConflict: "creator_id,kind,value", ignoreDuplicates: true } as any,
    ).catch(() => {});
  }
}

async function upsertShow(sb: any, s: Show, agencyId: string | null): Promise<string | null> {
  if (!s.name || !s.station) return null;
  const { data: existing } = await sb.from("shows")
    .select("id, host_names, platforms, handles, niche, audience_demo, description")
    .ilike("name", s.name).ilike("station", s.station).maybeSingle();

  const row: any = {
    name: s.name,
    kind: s.kind || "tv",
    station: s.station,
    host_names: s.host_names || [],
    airtime: s.airtime || null,
    days_on_air: s.days_on_air || [],
    platforms: s.platforms || [],
    handles: s.handles || {},
    niche: s.niche || [],
    region: "Kenya",
    city: s.city || null,
    description: s.description || null,
    reach_estimate: Number(s.reach_estimate) || 0,
    demographics: s.audience_demo || null,
    ai_confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.6)),
    source: "ai_seed_shows",
    agency_id: agencyId,
  };

  if (existing) {
    const patch: any = {
      host_names: Array.from(new Set([...(existing.host_names || []), ...(s.host_names || [])])),
      platforms: Array.from(new Set([...(existing.platforms || []), ...(s.platforms || [])])),
      handles: { ...(existing.handles || {}), ...(s.handles || {}) },
      niche: Array.from(new Set([...(existing.niche || []), ...(s.niche || [])])),
    };
    if (!existing.audience_demo && row.demographics) patch.demographics = row.demographics;
    if (!existing.description && row.description) patch.description = row.description;
    await sb.from("shows").update(patch).eq("id", existing.id);
    return existing.id;
  } else {
    const { data, error } = await sb.from("shows").insert(row).select("id").maybeSingle();
    if (error) { console.error("show insert err", error.message, s.name); return null; }
    return data?.id ?? null;
  }
}

async function addShowContacts(sb: any, showId: string, s: Show) {
  const contacts = [
    s.public_email ? { kind: "email", value: s.public_email, label: "show" } : null,
    s.public_phone ? { kind: "phone", value: s.public_phone, label: "show" } : null,
    s.whatsapp ? { kind: "whatsapp", value: s.whatsapp, label: "show" } : null,
  ].filter(Boolean) as any[];
  for (const c of contacts) {
    await sb.from("show_contacts").upsert(
      { show_id: showId, kind: c.kind, value: c.value, is_public: true, label: c.label },
      { onConflict: "show_id,kind,value", ignoreDuplicates: true } as any,
    ).catch(() => {});
  }
}

async function createInventoryItemForCreator(sb: any, c: Creator, creatorId: string) {
  // Only if we don't already have an inventory item for Mediamax with same handle/platform
  const handle = cleanHandle(c.handle);
  if (!handle || !c.platform) return;
  const { data: dup } = await sb.from("inventory_items")
    .select("id").eq("agency_id", MEDIAMAX_AGENCY_ID)
    .eq("platform", c.platform).eq("handle", handle).maybeSingle();
  if (dup) return;

  const row: any = {
    agency_id: MEDIAMAX_AGENCY_ID,
    kind: "influencer",
    title: c.full_name,
    subtitle: c.role ? `${c.role}${c.station ? ` · ${c.station}` : ""}` : (c.station || null),
    description: c.bio || null,
    platform: c.platform,
    handle,
    cover_url: null,
    follower_count: Number(c.follower_estimate) || 0,
    engagement_rate: Number(c.engagement_estimate) || 0,
    audience_demo: c.audience_demo || null,
    demo_source: c.audience_demo ? "ai_estimated" : null,
    deliverable_type: "IG/TikTok post + story",
    tags: Array.from(new Set([c.role, c.station].filter(Boolean))) as string[],
    is_active: true,
  };
  await sb.from("inventory_items").insert(row).catch((e: any) => console.error("inv err", e?.message));
}

async function runMediamaxSeed() {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let creatorsInserted = 0, showsInserted = 0, inventoryAdded = 0;

  console.log("[seed-shows] Mediamax talent pass — stations:", MEDIAMAX_STATIONS.length);
  for (const st of MEDIAMAX_STATIONS) {
    try {
      const creators = await askMediamaxTalent(st);
      console.log(`[seed-shows] ${st.name}: ${creators.length} talent`);
      for (const c of creators) {
        const id = await upsertCreator(sb, c, st.name, ["Mediamax", st.name]);
        if (id) {
          creatorsInserted++;
          await addCreatorContacts(sb, id, c);
          // Auto-storefront: high-confidence + reasonable follower count only
          if ((Number(c.confidence) || 0) >= 0.6 && (Number(c.follower_estimate) || 0) >= 1000) {
            const before = inventoryAdded;
            await createInventoryItemForCreator(sb, { ...c, station: st.name }, id);
            inventoryAdded = before + 1; // best-effort counter
          }
        }
      }
    } catch (e) { console.error("mediamax pass err", st.name, e); }
  }

  console.log("[seed-shows] Mediamax shows pass");
  for (const st of MEDIAMAX_STATIONS) {
    try {
      const shows = await askShows("Mediamax Network Ltd", st.name, st.kind);
      console.log(`[seed-shows] shows for ${st.name}: ${shows.length}`);
      for (const s of shows) {
        const id = await upsertShow(sb, s, MEDIAMAX_AGENCY_ID);
        if (id) { showsInserted++; await addShowContacts(sb, id, s); }
      }
    } catch (e) { console.error("mediamax shows err", st.name, e); }
  }

  console.log("[seed-shows] Other broadcasters shows pass");
  for (const g of OTHER_BROADCASTERS) {
    for (const st of g.stations) {
      try {
        // Best-guess kind from name
        const kind = /tv|ntv|ktn|k24|inooro tv|kiss tv/i.test(st) ? "tv" : "radio";
        const shows = await askShows(g.group, st, kind);
        for (const s of shows) {
          const id = await upsertShow(sb, s, null);
          if (id) { showsInserted++; await addShowContacts(sb, id, s); }
        }
      } catch (e) { console.error("other shows err", st, e); }
    }
  }

  console.log(`[seed-shows] DONE creators=${creatorsInserted} shows=${showsInserted} inv=${inventoryAdded}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // @ts-ignore - EdgeRuntime available
    EdgeRuntime.waitUntil(runMediamaxSeed());
    return new Response(JSON.stringify({
      ok: true,
      status: "started",
      message: "Fetching Mediamax talent, Mediamax shows, and top Kenyan broadcaster shows in the background. Refresh Discovery → Shows in a few minutes.",
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("seed-shows fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
