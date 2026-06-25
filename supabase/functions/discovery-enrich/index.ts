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

async function ai(prompt: string): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
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
      await supabase.from("discovery_contacts").upsert({
        creator_id: w.id, kind: "whatsapp", value: phone, is_public: false, label: "from group",
      }, { onConflict: "creator_id,kind,value" as any, ignoreDuplicates: true } as any).catch(() => {});
      await supabase.from("discovery_contacts").upsert({
        creator_id: w.id, kind: "phone", value: phone, is_public: false, label: "from group",
      }, { onConflict: "creator_id,kind,value" as any, ignoreDuplicates: true } as any).catch(() => {});
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
    const parsed = await ai(
      `For Kenyan ${c.platform} creator @${c.handle} ("${c.full_name}"), return strict JSON:
{"email":"only if publicly listed in bio/linktree/agency, else empty",
 "manager_email":"only if publicly listed, else empty",
 "phone":"Kenyan format only if publicly listed, else empty"}
Never invent. If unsure, return empty strings.`
    );
    if (!parsed) continue;
    const insertContact = async (kind: string, value: string) => {
      if (!value || value.length < 4) return;
      const { error } = await supabase.from("discovery_contacts").upsert({
        creator_id: c.id, kind, value: value.trim(), is_public: true, label: "from bio",
      }, { onConflict: "creator_id,kind,value" as any, ignoreDuplicates: true } as any);
      if (!error) contactsAdded++;
    };
    if (!hasEmail.has(c.id)) {
      await insertContact("email", String(parsed.email || ""));
      await insertContact("manager_email", String(parsed.manager_email || ""));
    }
    if (!hasPhone.has(c.id)) {
      await insertContact("phone", String(parsed.phone || ""));
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
      await supabase.from("discovery_contacts").upsert({
        creator_id: anchorId, kind: c.kind, value, is_public: c.is_public !== false, label: "from search",
      }, { onConflict: "creator_id,kind,value" as any, ignoreDuplicates: true } as any).catch(() => {});
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
