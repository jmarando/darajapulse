import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { streamApi, streamConfigured } from "../_shared/stream.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!streamConfigured()) return json({ error: "Video service is not configured yet." }, 503);

    const body = await req.json().catch(() => ({}));
    const briefToken = String(body?.brief_token ?? "").trim();
    const fileName = String(body?.file_name ?? "video.mp4").slice(0, 200);
    const fileSize = Number(body?.file_size ?? 0);
    if (briefToken.length < 16) return json({ error: "invalid link" }, 400);
    if (!fileSize || fileSize < 1024) return json({ error: "Choose a video file first." }, 400);
    if (fileSize > 900 * 1024 * 1024) return json({ error: "That file is too big — please compress it and try again." }, 400);

    // Only real brief links may mint upload URLs.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ci } = await admin
      .from("campaign_influencers")
      .select("id, campaign_id")
      .eq("brief_token", briefToken)
      .maybeSingle();
    if (!ci) return json({ error: "invalid link" }, 404);

    const { ok, status, data } = await streamApi("/stream/direct_upload", {
      method: "POST",
      body: JSON.stringify({
        maxDurationSeconds: 3600,
        requireSignedURLs: false,
        creator: briefToken,
        meta: { brief_token: briefToken, file_name: fileName },
      }),
    });
    const result = data?.result;
    if (!ok || !result?.uploadURL || !result?.uid) {
      console.error("stream direct_upload failed", status, JSON.stringify(data?.errors ?? data));
      return json({ error: "The video service hiccuped — please try again in a moment." }, 502);
    }

    return json({ uid: result.uid, uploadUrl: result.uploadURL });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
