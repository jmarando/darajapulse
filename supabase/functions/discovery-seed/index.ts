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
  "media personalities", "journalism", "radio hosts", "TV hosts",
  "podcast hosts", "activism and civic tech",
  // Broadcast & media depth
  "TV news anchors", "sports journalists and commentators", "business and markets journalists",
  "investigative journalists", "breakfast show hosts", "vernacular radio presenters",
  "Swahili language broadcasters", "talk show hosts", "sports radio presenters",
  // Entertainment
  "musicians and recording artists", "gengetone and hip hop artists",
  "afro pop and RnB artists", "benga and vernacular musicians", "DJs and selectors",
  "actors and thespians", "film and TV producers", "dancers and choreographers",
  "stand up comedians", "skit makers and meme pages", "voice over artists",
  "models and pageant winners", "reality TV personalities",
  // Sport
  "footballers and football pundits", "athletics and marathon runners",
  "rugby players and fans", "boxing and MMA", "motorsport and rally",
  "basketball and volleyball", "esports players",
  // Knowledge & professional
  "doctors and health educators", "lawyers and legal commentators",
  "personal finance and investing", "crypto and web3", "career and jobs",
  "science and engineering", "architecture and interior design",
  "photographers and videographers", "authors and book reviewers",
  "history and heritage storytellers", "mental health advocates",
  // Faith & community
  "preachers and church leaders", "gospel worship leaders", "muslim scholars and speakers",
  // Lifestyle & culture
  "matatu and street culture", "sheng and youth culture", "pets and animals",
  "wildlife and conservation", "environment and climate", "home and DIY",
  "kids and family content", "relationships and dating", "luxury and cars",
  "fashion designers and stylists", "makeup artists", "barbers and grooming",
  "weight loss and wellness", "vegan and healthy eating", "street food and nyama choma",
  "farming and livestock", "logistics and transport", "manufacturing and industry",
  // Geography & diaspora
  "Mombasa and coast creators", "Kisumu and lake region creators",
  "Eldoret and Rift Valley creators", "Nakuru creators", "Central Kenya creators",
  "Northern Kenya creators", "Kenyan diaspora creators",
  // Commercial
  "brand ambassadors and endorsers", "corporate leaders and CEOs",
  "startup founders and tech builders", "NGO and development sector voices",
  "county government and public officials",
];

const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook"];

type Creator = {
  full_name: string; handle: string; profile_url?: string;
  follower_estimate?: number; engagement_estimate?: number;
  city?: string; bio?: string; public_email?: string; public_phone?: string;
  audience_demo?: any;
  confidence?: number;
};

async function askGemini(niche: string, platform: string): Promise<Creator[]> {
  const prompt = `List up to 25 well-known KENYAN ${platform} creators, personalities or public figures in the "${niche}" niche.
Include veteran/legacy media names (e.g. long-serving TV anchors and radio hosts) as well as newer creators — do not skip household names just because they are "traditional media".
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
- audience_demo (object: { age_bands: {"18-24": %, "25-34": %, "35-44": %, "45+": %}, gender: {"female": %, "male": %}, top_cities: ["Nairobi","Mombasa",...], estimated: true })
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

async function runSeed(platforms: string[], niches: string[], concurrency: number) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const jobs: { platform: string; niche: string }[] = [];
  for (const p of platforms) for (const n of niches) jobs.push({ platform: p, niche: n });

  let inserted = 0, updated = 0, errors = 0;
  console.log(`[discovery-seed] starting ${jobs.length} jobs (concurrency=${concurrency})`);

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
            audience_demo: c.audience_demo || null,
            demo_source: c.audience_demo ? "ai_estimated" : null,
          }));

        let ins = 0, upd = 0;
        for (const row of rows) {
          const { data: existing } = await supabase
            .from("discovery_creators")
            .select("id, niche, verified_at, ai_confidence, audience_demo")
            .eq("platform", row.platform).eq("handle", row.handle).maybeSingle();
          if (existing) {
            const mergedNiche = Array.from(new Set([...(existing.niche || []), j.niche]));
            const patch: any = { niche: mergedNiche };
            if (!existing.verified_at) {
              patch.ai_confidence = Math.max(Number(existing.ai_confidence) || 0, row.ai_confidence);
            }
            if (!existing.audience_demo && row.audience_demo) {
              patch.audience_demo = row.audience_demo;
              patch.demo_source = "ai_estimated";
            }
            await supabase.from("discovery_creators").update(patch).eq("id", existing.id);
            upd++;
          } else {
            const { error } = await supabase.from("discovery_creators").insert(row);
            if (!error) ins++;
            else console.error("insert err", error.message, row.handle);
          }

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
    console.log(`[discovery-seed] progress ${Math.min(i + concurrency, jobs.length)}/${jobs.length} — ins=${inserted} upd=${updated} err=${errors}`);
  }
  console.log(`[discovery-seed] DONE inserted=${inserted} updated=${updated} errors=${errors}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const platforms: string[] = body.platforms ?? PLATFORMS;
    const niches: string[] = body.niches ?? NICHES;
    const concurrency = Number(body.concurrency ?? 6);
    const jobCount = platforms.length * niches.length;

    // Run in background to avoid 150s idle timeout — seeding can take many minutes.
    // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
    EdgeRuntime.waitUntil(runSeed(platforms, niches, concurrency));

    return new Response(JSON.stringify({
      ok: true,
      status: "started",
      total_jobs: jobCount,
      message: "Seeding started in background. Check the Discovery roster in a few minutes; refresh the page to see new creators appear.",
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("seed fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
