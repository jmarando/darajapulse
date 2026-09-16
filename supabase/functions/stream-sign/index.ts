import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { customerCodeFrom, signStreamToken, streamApi } from "../_shared/stream.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Mint playback / thumbnail / download URLs for a Stream-hosted draft video.
 * Access is either a client review-link token, or a signed-in user with
 * campaign access (agency dashboard).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const draftId = String(body?.draft_id ?? "");
    const linkToken = String(body?.link_token ?? "").trim();
    if (!draftId) return json({ error: "draft_id required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: draft } = await admin
      .from("creator_drafts")
      .select("id, campaign_id, stream_uid, stream_status, stream_duration, file_name")
      .eq("id", draftId)
      .maybeSingle();
    if (!draft?.stream_uid) return json({ error: "This video is not on the video service." }, 404);

    if (linkToken) {
      const { data: link } = await admin
        .from("draft_links")
        .select("id, campaign_id, is_active")
        .eq("token", linkToken)
        .maybeSingle();
      if (!link?.is_active || link.campaign_id !== draft.campaign_id) {
        return json({ error: "invalid link" }, 403);
      }
    } else {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
      );
      const { data: auth } = await userClient.auth.getUser();
      const user = auth?.user;
      if (!user) return json({ error: "Please sign in." }, 401);
      const { data: allowed } = await admin.rpc("user_has_campaign_access", {
        _user_id: user.id,
        _campaign_id: draft.campaign_id,
      });
      if (!allowed) return json({ error: "You don't have access to this campaign." }, 403);
    }

    // If the webhook was missed, poll the video once and self-heal the status.
    const { ok, data: videoRes } = await streamApi(`/stream/${draft.stream_uid}`);
    if (!ok) return json({ error: "Video unavailable" }, 404);
    const video = videoRes?.result;
    const state = String(video?.status?.state ?? "").toLowerCase();
    if (state !== "ready") {
      if (draft.stream_status !== state && state) {
        await admin
          .from("creator_drafts")
          .update({ stream_status: ["errored", "failed", "in-progress-failed"].includes(state) ? "failed" : "processing" })
          .eq("id", draft.id);
      }
      return json({ status: "processing" });
    }
    if (draft.stream_status !== "ready") {
      await admin
        .from("creator_drafts")
        .update({ stream_status: "ready", stream_duration: video?.duration ?? draft.stream_duration })
        .eq("id", draft.id);
    }

    const code = customerCodeFrom(video?.previewURL, video?.thumbnail, video?.playback?.hls);
    if (!code) return json({ error: "Video unavailable" }, 404);

    const [token, dlToken] = await Promise.all([signStreamToken(draft.stream_uid), signStreamToken(draft.stream_uid, true)]);
    const base = `https://customer-${code}.cloudflarestream.com/${draft.stream_uid}`;

    return json({
      status: "ready",
      duration: video?.duration ?? draft.stream_duration ?? null,
      embedUrl: `${base}/iframe${token ? `?token=${token}` : ""}`,
      posterUrl: `${base}/thumbnails/thumbnail.jpg${token ? `?token=${token}` : ""}`,
      downloadUrl: `${base}/downloads/default.mp4${dlToken ? `?token=${dlToken}` : ""}`,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
