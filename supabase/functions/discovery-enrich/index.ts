// Enrich the Kenyan creator roster:
// 1) For WhatsApp-only contacts, ask AI for their social handles and create matching
//    discovery_creators rows (instagram/tiktok/youtube/twitter/facebook) so they group
//    with everyone else by name.
// 2) For every creator that has no email/phone/whatsapp contact yet, ask AI for any
//    publicly listed email or phone (bio/linktree/agency page) and insert them as
//    public discovery_contacts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ED_TOKENS = [
  Deno.env.get("ENSEMBLEDATA_API_TOKEN"),
  Deno.env.get("ENSEMBLE_DATA_API_TOKEN"),
  Deno.env.get("ENSEMBLEDATA_API_TOKEN_2"),
].filter((t): t is string => !!t && t.length > 0);

async function ai(prompt: string): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You output strict JSON only. If unsure, return empty values — never invent." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("ai err", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = await res.json();
  const txt: string = data?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(txt); } catch { return null; }
}

async function edFetch(buildUrl: (token: string) => string): Promise<any | null> {
  for (const tok of ED_TOKENS) {
    const res = await fetch(buildUrl(tok));
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    if (![402, 403, 429, 495].includes(res.status)) break;
  }
  return null;
}

function walkValues(value: any, keyHint = "", out: { key: string; value: string }[] = []) {
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (text) out.push({ key: keyHint, value: text });
    return out;
  }
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item) => walkValues(item, keyHint, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walkValues(child, key, out);
  }
  return out;
}

const cleanPhone = (raw: string) => {
  const compact = raw.replace(/[\s().-]/g, "");
  if (/^07\d{8}$/.test(compact)) return `+254${compact.slice(1)}`;
  if (/^01\d{8}$/.test(compact)) return `+254${compact.slice(1)}`;
  if (/^254[17]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+254[17]\d{8}$/.test(compact)) return compact;
  return "";
};

function extractContacts(payload: any, fallbackBio?: string | null) {
  const values = walkValues(payload);
  if (fallbackBio) values.push({ key: "bio", value: fallbackBio });
  const emails = new Set<string>();
  const phones = new Set<string>();
  let avatarUrl = "";
  let bio = fallbackBio || "";

  for (const { key, value } of values) {
    const lowerKey = key.toLowerCase();
    for (const match of value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) emails.add(match.toLowerCase());
    for (const match of value.match(/(?:\+?254|0)[\s().-]?[17]\d[\s().-]?\d{3}[\s().-]?\d{3}/g) ?? []) {
      const phone = cleanPhone(match);
      if (phone) phones.add(phone);
    }
    if (!bio && ["biography", "bio", "signature"].includes(lowerKey) && value.length > 8) bio = value;
    if (!avatarUrl && /profile.*pic|avatar|hd_profile/i.test(key) && /^https?:\/\//i.test(value)) avatarUrl = value;
  }
  return { emails: [...emails], phones: [...phones], avatarUrl, bio };
}

async function fetchProfileContacts(platform: string, handle: string, fallbackBio?: string | null) {
  if (!handle || !ED_TOKENS.length) return extractContacts(null, fallbackBio);
  if (platform === "instagram") {
    const payload = await edFetch((tok) => `https://ensembledata.com/apis/instagram/user/info?username=${encodeURIComponent(handle)}&token=${tok}`);
    return extractContacts(payload, fallbackBio);
  }
  if (platform === "tiktok") {
    const payload = await edFetch((tok) => `https://ensembledata.com/apis/tt/user/info?username=${encodeURIComponent(handle)}&token=${tok}`);
    return extractContacts(payload, fallbackBio);
  }
  return extractContacts(null, fallbackBio);
}

async function insertContact(supabase: any, creatorId: string, kind: string, value: string, label: string, isPublic = true) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.length < 4) return false;
  const { data: existing } = await supabase
    .from("discovery_contacts")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("kind", kind)
    .eq("value", trimmed)
    .maybeSingle();
  if (existing?.id) return false;
  const { error } = await supabase.from("discovery_contacts").insert({
    creator_id: creatorId,
    kind,
    value: trimmed,
    is_public: isPublic,
    label,
  });
  return !error;
}

async function runEnrich() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ----- 1) Promote whatsapp-only contacts to full creators with socials -----
  const { data: waRows } = await supabase
    .from("discovery_creators")
    .select("id, full_name, handle, city, bio")
    .eq("platform", "whatsapp");

  let promoted = 0;
  for (const w of waRows ?? []) {
    const parsed = await ai(
      `For the Kenyan media/marketing person named "${w.full_name}" (phone ${w.handle}), return strict JSON:
{
  "city": "Nairobi" | other Kenyan city | "",
  "bio": "short bio under 140 chars or empty",
  "niche": ["food","beauty",...] (lowercase, max 4),
  "socials": [{"platform":"instagram|tiktok|youtube|twitter|facebook","handle":"no-at","profile_url":"https://...","follower_estimate":int,"engagement_estimate":float}]
}
Only include socials you are confident exist for THIS exact person. If you cannot confidently identify them, return {"socials":[]}.`
    );
    const socials = Array.isArray(parsed?.socials) ? parsed.socials : [];
    const niche = Array.isArray(parsed?.niche) ? parsed.niche.slice(0, 4) : [];
    const phone = String(w.handle).replace(/[^\d+]/g, "");
    if (phone) {
      await insertContact(supabase, w.id, "whatsapp", phone, "from group", false);
      await insertContact(supabase, w.id, "phone", phone, "from group", false);
    }
    for (const s of socials) {
      const platform = String(s.platform || "").toLowerCase();
      const handle = String(s.handle || "").replace(/^@/, "").toLowerCase();
      if (!handle || !["instagram", "tiktok", "youtube", "twitter", "facebook"].includes(platform)) continue;
      const { data: exists } = await supabase
        .from("discovery_creators").select("id").eq("platform", platform).eq("handle", handle).maybeSingle();
      if (exists) continue;
      const { error } = await supabase.from("discovery_creators").insert({
        full_name: w.full_name,
        handle, platform,
        profile_url: s.profile_url ?? null,
        niche, region: "Kenya", city: parsed?.city || w.city || null,
        follower_count: Number(s.follower_estimate) || 0,
        engagement_rate: Number(s.engagement_estimate) || 0,
        bio: parsed?.bio || w.bio || null,
        source: "ai_enrich",
        ai_confidence: 0.6,
      });
      if (!error) promoted++;
    }
  }

  // ----- 2) Fill in email/phone where missing -----
  const { data: candidates } = await supabase
    .from("discovery_creators")
    .select("id, full_name, handle, platform, city, bio")
    .neq("platform", "whatsapp")
    .limit(500);

  const { data: have } = await supabase
    .from("discovery_contacts")
    .select("creator_id, kind");
  const hasEmail = new Set<string>();
  const hasPhone = new Set<string>();
  (have ?? []).forEach((c: any) => {
    if (c.kind === "email" || c.kind === "manager_email") hasEmail.add(c.creator_id);
    if (c.kind === "phone" || c.kind === "whatsapp") hasPhone.add(c.creator_id);
  });

  let contactsAdded = 0;
  for (const c of candidates ?? []) {
    if (hasEmail.has(c.id) && hasPhone.has(c.id)) continue;
    const profileContacts = await fetchProfileContacts(c.platform, c.handle, c.bio);
    if (profileContacts.avatarUrl || (profileContacts.bio && profileContacts.bio !== c.bio)) {
      await supabase
        .from("discovery_creators")
        .update({
          avatar_url: profileContacts.avatarUrl || undefined,
          bio: profileContacts.bio || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", c.id);
    }

    for (const email of profileContacts.emails) {
      if (await insertContact(supabase, c.id, "email", email, "from profile", true)) contactsAdded++;
      hasEmail.add(c.id);
    }
    for (const phone of profileContacts.phones) {
      if (await insertContact(supabase, c.id, "phone", phone, "from profile", true)) contactsAdded++;
      hasPhone.add(c.id);
    }
    if (hasEmail.has(c.id) && hasPhone.has(c.id)) continue;

    const parsed = await ai(
      `For Kenyan ${c.platform} creator @${c.handle} ("${c.full_name}"), return strict JSON:
{"email":"only if publicly listed in bio/linktree/agency, else empty",
 "manager_email":"only if publicly listed, else empty",
 "phone":"Kenyan format only if publicly listed, else empty"}
Never invent. If unsure, return empty strings.`
    );
    if (!parsed) continue;
    if (!hasEmail.has(c.id)) {
      if (await insertContact(supabase, c.id, "email", String(parsed.email || ""), "from bio", true)) contactsAdded++;
      if (await insertContact(supabase, c.id, "manager_email", String(parsed.manager_email || ""), "from bio", true)) contactsAdded++;
    }
    if (!hasPhone.has(c.id)) {
      if (await insertContact(supabase, c.id, "phone", String(parsed.phone || ""), "from bio", true)) contactsAdded++;
    }
  }

  console.log(`[discovery-enrich] DONE promoted=${promoted} contacts_added=${contactsAdded}`);
}

async function findByName(query: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const parsed = await ai(
    `Find the Kenyan creator/influencer/personality matching "${query}". Return strict JSON:
{
  "full_name":"canonical name",
  "city":"Kenyan city or empty",
  "bio":"short bio under 140 chars or empty",
  "niche":["lowercase",...] (max 4),
  "socials":[{"platform":"instagram|tiktok|youtube|twitter|facebook","handle":"no-at","profile_url":"https://...","follower_estimate":int,"engagement_estimate":float,"verified":bool}],
  "contacts":[{"kind":"email|manager_email|phone","value":"...","is_public":true}]
}
Only include socials/contacts you're confident exist for THIS exact person. If you can't identify them confidently, return {"full_name":"","socials":[]}.`
  );
  if (!parsed?.full_name) return { ok: false, message: "Couldn't confidently identify that person." };
  const inserted: any[] = [];
  for (const s of parsed.socials ?? []) {
    const platform = String(s.platform || "").toLowerCase();
    const handle = String(s.handle || "").replace(/^@/, "").toLowerCase();
    if (!handle || !["instagram", "tiktok", "youtube", "twitter", "facebook"].includes(platform)) continue;
    const { data: exists } = await supabase
      .from("discovery_creators").select("id").eq("platform", platform).eq("handle", handle).maybeSingle();
    let id = exists?.id;
    if (!id) {
      const { data: ins, error } = await supabase.from("discovery_creators").insert({
        full_name: parsed.full_name,
        handle, platform,
        profile_url: s.profile_url ?? null,
        niche: Array.isArray(parsed.niche) ? parsed.niche.slice(0, 4) : [],
        region: "Kenya", city: parsed.city || null,
        follower_count: Number(s.follower_estimate) || 0,
        engagement_rate: Number(s.engagement_estimate) || 0,
        bio: parsed.bio || null,
        source: "ai_search",
        ai_confidence: 0.55,
        verified_at: s.verified ? new Date().toISOString() : null,
      }).select("id").maybeSingle();
      if (error) continue;
      id = ins?.id;
    }
    if (id) inserted.push({ id, platform, handle });
  }
  // Attach contacts to the first/best inserted profile.
  const anchorId = inserted[0]?.id;
  if (anchorId) {
    for (const c of parsed.contacts ?? []) {
      const value = String(c.value || "").trim();
      if (!value || value.length < 4) continue;
      await insertContact(supabase, anchorId, c.kind, value, "from search", c.is_public !== false);
    }
  }
  return { ok: true, name: parsed.full_name, added: inserted.length, profiles: inserted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.query && typeof body.query === "string") {
      const result = await findByName(body.query.trim());
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(runEnrich());
    return new Response(JSON.stringify({
      ok: true,
      status: "started",
      message: "Enriching socials and contacts in background. Refresh the page in a few minutes.",
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
