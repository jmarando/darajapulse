// Seed the Kenya influencer roster across platforms using Lovable AI.
// Iterates niche x platform combinations, asks Gemini for known creators,
// and upserts into discovery_creators (idempotent on platform+handle).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NICHES = [
  "food", "beauty", "comedy", "fitness", "fashion", "parenting", "finance",
  "gospel", "tech", "travel", "sports", "gaming", "lifestyle", "music",
  "news and politics", "automotive", "hair", "skincare", "wedding",
  "hustle and SME", "agribusiness", "education", "real estate", "motherhood",
  "nightlife and events",
];
const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook"];

type Creator = {
  full_name: string; handle: string; profile_url?: string;
  follower_estimate?: number; engagement_estimate?: number;
  city?: string; bio?: string; public_email?: string; public_phone?: string;
  confidence?: number;
};

async function askGemini(niche: string, platform: string): Promise<Creator[]> {
  const prompt = `List up to 15 well-known KENYAN ${platform} creators in the "${niche}" niche.
Return strictly a JSON array. Each item must have:
- full_name (string)
- handle (string, no @)
- profile_url (string, full https URL to their ${platform} profile)
- follower_estimate (integer)
- engagement_estimate (number, percent, e.g. 3.5)
- city (string, e.g. Nairobi/Mombasa/Kisumu or empty)
- bio (string, max 140 chars)
- public_email (string or empty — only if widely listed in their bio/linktree)
- public_phone (string or empty — Kenyan format if publicly listed)
- confidence (0..1 — how sure you are this creator exists and matches the niche)
Only include real, well-known creators. If you are unsure, omit. Return ONLY the JSON array, no prose.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You output strict JSON arrays only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("AI error", platform, niche, res.status, t);
    return [];
  }
  const data = await res.json();
  const txt: string = data?.choices?.[0]?.message?.content ?? "[]";
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return parsed;
    // sometimes models wrap in { creators: [...] }
    for (const k of Object.keys(parsed)) {
      if (Array.isArray(parsed[k])) return parsed[k];
    }
    return [];
  } catch (e) {
    console.error("parse fail", e, txt.slice(0, 200));
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const platforms: string[] = body.platforms ?? PLATFORMS;
    const niches: string[] = body.niches ?? NICHES;
    const concurrency = Number(body.concurrency ?? 6);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const jobs: { platform: string; niche: string }[] = [];
    for (const p of platforms) for (const n of niches) jobs.push({ platform: p, niche: n });

    let inserted = 0, updated = 0, errors = 0;

    for (let i = 0; i < jobs.length; i += concurrency) {
      const slice = jobs.slice(i, i + concurrency);
      const results = await Promise.all(slice.map(async (j) => {
        try {
          const creators = await askGemini(j.niche, j.platform);
          if (!creators.length) return { ins: 0, upd: 0 };
          const rows = creators
            .filter(c => c.full_name && c.handle)
            .map(c => ({
              full_name: c.full_name,
              handle: String(c.handle).replace(/^@/, "").toLowerCase(),
              platform: j.platform,
              profile_url: c.profile_url ?? null,
              niche: [j.niche],
              region: "Kenya",
              city: c.city || null,
              follower_count: Number(c.follower_estimate) || 0,
              engagement_rate: Number(c.engagement_estimate) || 0,
              bio: c.bio || null,
              source: "ai_seed",
              ai_confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.5)),
            }));

          let ins = 0, upd = 0;
          for (const row of rows) {
            // fetch existing to merge niches & preserve verified fields
            const { data: existing } = await supabase
              .from("discovery_creators")
              .select("id, niche, verified_at, ai_confidence")
              .eq("platform", row.platform).eq("handle", row.handle).maybeSingle();
            if (existing) {
              const mergedNiche = Array.from(new Set([...(existing.niche || []), j.niche]));
              const patch: any = { niche: mergedNiche };
              if (!existing.verified_at) {
                patch.ai_confidence = Math.max(Number(existing.ai_confidence) || 0, row.ai_confidence);
              }
              await supabase.from("discovery_creators").update(patch).eq("id", existing.id);
              upd++;
            } else {
              const { error } = await supabase.from("discovery_creators").insert(row);
              if (!error) ins++;
              else console.error("insert err", error.message, row.handle);
            }

            // Contacts (public only)
            const creatorId = existing?.id ?? (await supabase
              .from("discovery_creators").select("id").eq("platform", row.platform).eq("handle", row.handle).maybeSingle()).data?.id;
            if (creatorId) {
              const cs = creators.find(c => String(c.handle).replace(/^@/, "").toLowerCase() === row.handle);
              if (cs?.public_email) {
                await supabase.from("discovery_contacts").upsert({
                  creator_id: creatorId, kind: "email", value: cs.public_email, is_public: true, label: "from bio",
                }, { onConflict: "creator_id,kind,value" as any, ignoreDuplicates: true } as any).catch(() => {});
              }
              if (cs?.public_phone) {
                await supabase.from("discovery_contacts").upsert({
                  creator_id: creatorId, kind: "phone", value: cs.public_phone, is_public: true, label: "from bio",
                }, { onConflict: "creator_id,kind,value" as any, ignoreDuplicates: true } as any).catch(() => {});
              }
            }
          }
          return { ins, upd };
        } catch (e) {
          console.error("job error", j, e);
          return { ins: 0, upd: 0, err: 1 };
        }
      }));
      for (const r of results) { inserted += r.ins; updated += r.upd; if ((r as any).err) errors++; }
    }

    return new Response(JSON.stringify({ ok: true, inserted, updated, errors, total_jobs: jobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
