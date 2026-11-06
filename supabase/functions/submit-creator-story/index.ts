// Lets a creator send their story insights screenshot from their brief link.
// The screenshot is read automatically (Lovable AI vision) into ai_reading, and the
// numbers the creator typed (if any) stay on the row, so staff can see both and
// confirm. The row is source "creator" and verified false until staff confirm it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const MODEL = "google/gemini-3-flash-preview";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PLATFORM = new Set(["instagram", "facebook", "tiktok"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseDataUrl(image: string): { mime: string; bytes: Uint8Array } | null {
  const m = image.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = (m[1] || "image/jpeg").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;
  try {
    const bytes = base64Bytes(m[3]);
    return { mime, bytes };
  } catch {
    return null;
  }
}

/** Reads one screenshot's numbers with Lovable AI vision. Never throws: a bad read is {error} so the submission still saves. */
async function readScreenshot(dataUrl: string): Promise<Record<string, unknown>> {
  const readAt = new Date().toISOString();
  if (!LOVABLE_API_KEY) return { error: "AI is not configured", model: MODEL, read_at: readAt };
  const prompt = `Read the numbers in this Instagram/Facebook story insights screenshot. Return STRICT JSON only:
{"reach": <integer|null>, "views": <integer|null>, "replies": <integer|null>, "link_taps": <integer|null>, "insights": <short string summarizing what is shown, or null>}
Rules:
- Use only numbers visibly written on the screenshot, as integers. Expand k/M (4.2k = 4200, 1.1M = 1100000). Use null for anything not shown.
- "views" is the story views / impressions count. "link_taps" is link sticker clicks when shown.
- Do not guess. If no insight numbers are visible, return all nulls and insights "No numbers visible".`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Output strict JSON only." },
          { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("submit-creator-story AI read failed", res.status, detail);
      return { error: `AI read failed (${res.status})`, model: MODEL, read_at: readAt };
    }
    const data = await res.json();
    const txt = String(data?.choices?.[0]?.message?.content ?? "{}");
    let parsed: any = {};
    try { parsed = JSON.parse(txt); } catch { parsed = {}; }
    const num = (v: unknown) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && (v as unknown) !== null && (v as unknown) !== undefined ? Math.max(0, Math.round(n)) : null;
    };
    return {
      reach: num(parsed.reach),
      views: num(parsed.views),
      replies: num(parsed.replies),
      link_taps: num(parsed.link_taps),
      insights: typeof parsed.insights === "string" ? parsed.insights : null,
      model: MODEL,
      read_at: readAt,
    };
  } catch (e) {
    console.error("submit-creator-story AI read error", e);
    return { error: String((e as Error).message ?? e).slice(0, 300), model: MODEL, read_at: readAt };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.brief_token !== "string") return json({ error: "Missing brief_token." }, 400);
    const briefToken = body.brief_token.trim();
    if (briefToken.length < 16 || briefToken.length > 128) return json({ error: "Creator link not recognised." }, 404);

    const platform = String(body.platform ?? "instagram").toLowerCase();
    if (!ALLOWED_PLATFORM.has(platform)) return json({ error: "Pick Instagram, Facebook or TikTok." }, 400);

    const { data: ci } = await supabase
      .from("campaign_influencers")
      .select("campaign_id, influencer_id")
      .eq("brief_token", briefToken)
      .maybeSingle();
    if (!ci) return json({ error: "Creator link not recognised." }, 404);

    const { data: campaign } = await supabase.from("campaigns").select("status").eq("id", ci.campaign_id).maybeSingle();
    if (!campaign) return json({ error: "Campaign not found." }, 404);
    if (campaign.status === "draft") return json({ error: "This campaign is still a draft, so story screenshots can't be sent yet." }, 400);

    let postedAt = new Date().toISOString();
    if (body.posted_at) {
      const d = new Date(String(body.posted_at));
      if (!Number.isFinite(d.getTime())) return json({ error: "That story date isn't right." }, 400);
      if (d.getTime() > Date.now() + 5 * 60_000) return json({ error: "That story is from the future." }, 400);
      if (d.getTime() < Date.now() - 7 * 24 * 3600_000) return json({ error: "That story is older than 7 days." }, 400);
      postedAt = d.toISOString();
    }

    const image = typeof body.image === "string" ? body.image : "";
    if (!image) return json({ error: "Choose your insights screenshot first." }, 400);
    const parsedImage = parseDataUrl(image);
    if (!parsedImage) return json({ error: "That image isn't supported. Use a JPEG, PNG or WebP screenshot." }, 400);
    if (parsedImage.bytes.length > MAX_BYTES) return json({ error: "That screenshot is too big (max 5MB)." }, 400);

    const ext = parsedImage.mime === "image/png" ? "png" : parsedImage.mime === "image/webp" ? "webp" : "jpg";
    const path = `${ci.campaign_id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("story-proofs")
      .upload(path, parsedImage.bytes, { contentType: parsedImage.mime, upsert: false });
    if (upErr) {
      console.error("submit-creator-story upload failed", upErr.message);
      return json({ error: "Could not store your screenshot. Please try again." }, 500);
    }

    const aiReading = await readScreenshot(image);
    const numOrNull = (v: unknown) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
    };
    // The creator's typed numbers win on the row; the AI reading is kept beside them.
    const reach = numOrNull(body.reach) ?? (typeof aiReading.reach === "number" ? aiReading.reach : null);
    const impressions = numOrNull(body.impressions ?? body.views) ?? (typeof aiReading.views === "number" ? aiReading.views : null);
    const replies = numOrNull(body.replies) ?? (typeof aiReading.replies === "number" ? aiReading.replies : null);
    const linkClicks = numOrNull(body.link_clicks ?? body.link_taps) ?? (typeof aiReading.link_taps === "number" ? aiReading.link_taps : null);

    const { data: row, error: insErr } = await supabase
      .from("stories")
      .insert({
        campaign_id: ci.campaign_id,
        influencer_id: ci.influencer_id,
        platform,
        posted_at: postedAt,
        expires_at: new Date(new Date(postedAt).getTime() + 24 * 3600_000).toISOString(),
        media_url: path,
        reach,
        impressions,
        replies,
        link_clicks: linkClicks,
        ai_reading: aiReading,
        source: "creator",
        verified: false,
      })
      .select("id")
      .single();
    if (insErr || !row) {
      console.error("submit-creator-story insert failed", insErr?.message);
      return json({ error: "Could not save your story. Please try again." }, 500);
    }
    return json({ id: row.id, ai_reading: aiReading });
  } catch (e) {
    console.error("submit-creator-story failed", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
