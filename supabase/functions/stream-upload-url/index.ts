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

    // Failure beacon from the creator's browser — logged so uploads that die in the
    // browser (blocked networks, dead links) can be audited instead of guessed at.
    if (String(body?.action ?? "") === "report") {
      console.error("creator upload failed", {
        stage: body?.stage,
        uid: body?.uid ?? null,
        file: String(body?.file_name ?? "").slice(0, 120),
        size: Number(body?.file_size ?? 0),
        brief: String(body?.brief_token ?? "").slice(0, 8),
        message: String(body?.message ?? "").slice(0, 500),
        ua: String(body?.ua ?? "").slice(0, 200),
      });
      return json({ ok: true });
    }

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

    // tus-style creation: returns a one-time upload URL our tus client can PATCH to.
    // maxdurationseconds also reserves billable storage, so keep it close to real clip
    // length (10 min) instead of the previous hour.
    // requiresignedurls locks playback to tokens minted by stream-sign.
    const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const meta = [
      `name ${b64(fileName)}`,
      `brief_token ${b64(briefToken)}`,
      `maxdurationseconds ${b64("600")}`,
      `requiresignedurls`,
    ].join(",");



    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${Deno.env.get("CLOUDFLARE_ACCOUNT_ID")}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("CLOUDFLARE_STREAM_TOKEN")}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(fileSize),
          "Upload-Metadata": meta,
        },
      },
    );
    const uploadUrl = cfRes.headers.get("Location");
    const uid = cfRes.headers.get("stream-media-id");
    if (!cfRes.ok || !uploadUrl || !uid) {
      console.error("stream tus create failed", cfRes.status, await cfRes.text().catch(() => ""));
      return json({ error: "The video service hiccuped — please try again in a moment." }, 502);
    }

    return json({ uid, uploadUrl });

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
