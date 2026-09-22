import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_LIMIT = 500;
const MAX_OFFSET = 8_000;
const ALLOWED_PLATFORMS = new Set(["instagram", "tiktok", "youtube", "twitter", "facebook", "whatsapp"]);
const ALLOWED_CONTACT_KINDS = new Set(["link", "email", "manager_email"]);

type Contact = { kind: string; value: string; label?: string | null };

type CreatorRow = {
  id: string;
  full_name: string;
  handle: string;
  platform: string;
  profile_url: string | null;
  niche: string[] | null;
  city: string | null;
  country_code: string | null;
  follower_count: number | null;
  engagement_rate: number | null;
  bio: string | null;
  avatar_url: string | null;
  verified_at: string | null;
  person_key: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanString(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanCountry(value: unknown): string | null {
  const v = cleanString(value, 2)?.toUpperCase() ?? null;
  return /^[A-Z]{2}$/.test(v ?? "") ? v : null;
}

function cleanLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 240;
  return Math.min(Math.max(Math.round(n), 1), MAX_LIMIT);
}

function cleanOffset(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), MAX_OFFSET);
}

const normalize = (value: string) => value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/^@+/, "")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const personKey = (row: CreatorRow) =>
  row.person_key?.trim() || row.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || row.id;

function sanitizeBio(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/(?:\+?254|0)[\s().-]?[17](?:[\s().-]?\d){8}/g, "")
    .replace(/\b(?:for\s+)?(?:biz|business|call|whatsapp|wa)\b\s*[:\-]?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return cleaned || null;
}

function publicContact(contact: any): Contact | null {
  const kind = String(contact?.kind ?? "");
  const value = String(contact?.value ?? "").trim();
  if (!ALLOWED_CONTACT_KINDS.has(kind) || !value) return null;
  if (kind === "link" && !/^https?:\/\//i.test(value)) return null;
  if ((kind === "email" || kind === "manager_email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return { kind, value, label: contact?.label ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Showcase is not configured" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const country = cleanCountry(body?.country);
    const city = cleanString(body?.city, 80);
    const platform = cleanString(body?.platform, 32)?.toLowerCase() ?? null;
    const niche = cleanString(body?.niche, 80)?.toLowerCase() ?? null;
    const search = cleanString(body?.q, 160);
    const limit = cleanLimit(body?.limit);
    const offset = cleanOffset(body?.offset);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const BATCH = 1000;
    const rows: CreatorRow[] = [];
    for (let start = 0; start < MAX_OFFSET; start += BATCH) {
      let query = supabase
        .from("discovery_creators")
        .select("id, full_name, handle, platform, profile_url, niche, city, country_code, follower_count, engagement_rate, bio, avatar_url, verified_at, person_key")
        .eq("profile_status", "active")
        .neq("link_status", "broken")
        .in("platform", [...ALLOWED_PLATFORMS])
        .order("follower_count", { ascending: false, nullsFirst: false })
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })
        .range(start, start + BATCH - 1);

      if (country) query = query.eq("country_code", country);
      if (city) query = query.eq("city", city);
      if (platform && ALLOWED_PLATFORMS.has(platform)) query = query.eq("platform", platform);

      const { data: batch, error } = await query;
      if (error) throw error;
      const list = (batch ?? []) as CreatorRow[];
      rows.push(...list);
      if (list.length < BATCH) break;
    }

    const terms = search ? normalize(search).split(" ").filter(Boolean) : [];
    const filteredRows = rows.filter((row) => {
      const rowNiches = (row.niche ?? []).map((value) => String(value).trim().toLowerCase()).filter(Boolean);
      if (niche && !rowNiches.includes(niche)) return false;
      if (terms.length) {
        const hay = normalize([
          row.full_name,
          row.handle,
          row.platform,
          row.city,
          row.country_code,
          row.bio,
          ...rowNiches,
        ].filter(Boolean).join(" "));
        if (!terms.every((term) => hay.includes(term))) return false;
      }
      return true;
    });

    // Group every matching profile into people first, then paginate by person
    // so the page count matches the number of creators shown.
    const peopleMap = new Map<string, any>();
    for (const row of filteredRows) {
      const key = personKey(row);
      const current = peopleMap.get(key) ?? {
        key,
        full_name: row.full_name,
        city: row.city,
        country_code: row.country_code,
        bio: sanitizeBio(row.bio),
        avatar_url: row.avatar_url,
        verified_at: row.verified_at,
        niches: [] as string[],
        contacts: [] as Contact[],
        profiles: [] as any[],
        follower_total: 0,
        engagement_avg: 0,
      };

      const followers = Number(row.follower_count) || 0;
      current.follower_total += followers;
      current.profiles.push({
        id: row.id,
        handle: row.handle,
        platform: row.platform,
        profile_url: row.profile_url,
        follower_count: followers,
        engagement_rate: Number(row.engagement_rate) || 0,
      });
      if (!current.avatar_url && row.avatar_url) current.avatar_url = row.avatar_url;
      if (!current.bio) current.bio = sanitizeBio(row.bio);
      if (!current.verified_at && row.verified_at) current.verified_at = row.verified_at;
      if (!current.city && row.city) current.city = row.city;
      if (!current.country_code && row.country_code) current.country_code = row.country_code;
      for (const niche of row.niche ?? []) {
        const clean = String(niche).trim().toLowerCase();
        if (clean && !current.niches.includes(clean)) current.niches.push(clean);
      }
      peopleMap.set(key, current);
    }

    const allPeople = [...peopleMap.values()].sort((a, b) => b.follower_total - a.follower_total);
    const pagePeople = allPeople.slice(offset, offset + limit);
    const ids = pagePeople.flatMap((person: any) => person.profiles.map((p: any) => p.id));

    const contactsByCreator: Record<string, Contact[]> = {};
    if (ids.length) {
      const { data: contacts, error: contactError } = await supabase
        .from("discovery_contacts")
        .select("creator_id, kind, value, label")
        .in("creator_id", ids)
        .eq("is_public", true)
        .in("kind", [...ALLOWED_CONTACT_KINDS])
        .limit(ids.length * 8);
      if (contactError) throw contactError;
      for (const contact of contacts ?? []) {
        const safe = publicContact(contact);
        if (!safe) continue;
        const id = String((contact as any).creator_id);
        (contactsByCreator[id] ||= []).push(safe);
      }
    }

    for (const person of pagePeople as any[]) {
      for (const profile of person.profiles) {
        for (const contact of contactsByCreator[profile.id] ?? []) {
          const exists = person.contacts.some((c: Contact) => c.kind === contact.kind && c.value.toLowerCase() === contact.value.toLowerCase());
          if (!exists) person.contacts.push(contact);
        }
      }
    }

    const people = [...peopleMap.values()].map((person) => {
      const rates = person.profiles.map((p: any) => Number(p.engagement_rate) || 0).filter((n: number) => n > 0);
      return {
        ...person,
        engagement_avg: rates.length ? rates.reduce((sum: number, n: number) => sum + n, 0) / rates.length : 0,
        profiles: person.profiles.sort((a: any, b: any) => b.follower_count - a.follower_count),
        niches: person.niches.slice(0, 8),
        contacts: person.contacts.slice(0, 6),
      };
    });

    const platforms: Record<string, number> = {};
    const countries: Record<string, number> = {};
    const cities = new Set<string>();
    const niches = new Set<string>();
    const peopleKeys = new Set<string>();
    let totalFollowers = 0;
    for (const row of filteredRows as any[]) {
      platforms[row.platform] = (platforms[row.platform] ?? 0) + 1;
      if (row.country_code) countries[row.country_code] = (countries[row.country_code] ?? 0) + 1;
      if (row.city) cities.add(row.city);
      for (const niche of row.niche ?? []) {
        const clean = String(niche).trim().toLowerCase();
        if (clean) niches.add(clean);
      }
      peopleKeys.add(row.person_key || String(row.full_name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || row.id);
      totalFollowers += Number(row.follower_count) || 0;
    }

    return json({
      people,
      returned_profiles: creatorRows.length,
      next_offset: offset + limit < filteredRows.length ? offset + limit : null,
      stats: {
        profiles: filteredRows.length,
        people: peopleKeys.size,
        total_followers: totalFollowers,
        platforms,
        countries,
        cities: [...cities].sort(),
        niches: [...niches].sort(),
      },
    });
  } catch (e) {
    console.error("public-discovery-showcase fatal", e);
    return json({ error: "Could not load the showcase" }, 500);
  }
});
