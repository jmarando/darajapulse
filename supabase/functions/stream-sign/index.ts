import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { customerCodeFrom, signStreamToken, streamApi } from "../_shared/stream.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/**
 * Mint playback / thumbnail / download URLs for Stream-hosted draft videos.
 * Access is either a client review-link token, or a signed-in user with
 * campaign access (agency dashboard).
 *
 *  - { draft_id }  → full playback payload for one video
 *  - { draft_ids } → thumbnail URLs only, so review lists paint real tiles
 *                    without touching each video.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const draftId = String(body?.draft_id ?? "");
    const draftIds = Array.isArray(body?.draft_ids) ? body.draft_ids.map(String).slice(0, 200) : null;
    const linkToken = String(body?.link_token ?? "").trim();
    if (!draftId && !draftIds?.length) return json({ error: "draft_id required" }, 400);

    const db = admin();

    /** Returns true when the caller may see videos from this campaign. */
    const allowCampaign = async (campaignId: string): Promise<boolean> => {
      if (linkToken) {
        const { data: link } = await db
          .from("draft_links")
          .select("campaign_id, is_active")
          .eq("token", linkToken)
          .maybeSingle();
        return Boolean(link?.is_active && link.campaign_id === campaignId);
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
      );
      const { data: auth } = await userClient.auth.getUser();
      if (!auth?.user) return false;
      const { data: allowed } = await db.rpc("user_has_campaign_access", {
        _user_id: auth.user.id,
        _campaign_id: campaignId,
      });
      return Boolean(allowed);
    };

    // ---- Batch thumbnails ------------------------------------------------
    if (draftIds?.length) {
      const { data: rows } = await db
        .from("creator_drafts")
        .select("id, campaign_id, stream_uid, stream_thumbnail_url")
        .in("id", draftIds);
      const list = (rows ?? []).filter((r: any) => r.stream_uid && r.stream_thumbnail_url);
      if (!list.length) return json({ posters: {} });

      // Every draft in one request belongs to one campaign in practice; check each distinct one.
      const campaigns = [...new Set(list.map((r: any) => r.campaign_id))];
      const checks = await Promise.all(campaigns.map((c) => allowCampaign(String(c))));
      const okCampaigns = new Set(campaigns.filter((_, i) => checks[i]));

      const posters: Record<string, string> = {};
      await Promise.all(
        list.map(async (r: any) => {
          if (!okCampaigns.has(r.campaign_id)) return;
          const token = await signStreamToken(r.stream_uid);
          posters[r.id] = token ? `${r.stream_thumbnail_url}?token=${token}` : r.stream_thumbnail_url;
        }),
      );
      return json({ posters });
    }

    // ---- Single video ----------------------------------------------------
    const { data: draft } = await db
      .from("creator_drafts")
      .select("id, campaign_id, stream_uid, stream_status, stream_duration, stream_thumbnail_url, file_name")
      .eq("id", draftId)
      .maybeSingle();
    if (!draft?.stream_uid) return json({ error: "This video is not on the video service." }, 404);
    if (!(await allowCampaign(draft.campaign_id))) {
      return json({ error: linkToken ? "invalid link" : "You don't have access to this campaign." }, 403);
    }

    // If the webhook was missed, poll the video once and self-heal the status.
    const { ok, data: videoRes } = await streamApi(`/stream/${draft.stream_uid}`);
    if (!ok) return json({ error: "Video unavailable" }, 404);
    const video = videoRes?.result;
    const state = String(video?.status?.state ?? "").toLowerCase();
    if (state !== "ready") {
      if (draft.stream_status !== state && state) {
        await db
          .from("creator_drafts")
          .update({ stream_status: ["errored", "failed", "in-progress-failed"].includes(state) ? "failed" : "processing" })
          .eq("id", draft.id);
      }
      return json({ status: "processing" });
    }

    const code = customerCodeFrom(video?.previewURL, video?.thumbnail, video?.playback?.hls);
    if (!code) return json({ error: "Video unavailable" }, 404);
    const base = `https://customer-${code}.cloudflarestream.com/${draft.stream_uid}`;
    const thumbBase = video?.thumbnail || `${base}/thumbnails/thumbnail.jpg`;

    // Persist the thumbnail so review lists can show a real tile straight away.
    if (draft.stream_status !== "ready" || draft.stream_thumbnail_url !== thumbBase) {
      await db
        .from("creator_drafts")
        .update({
          stream_status: "ready",
          stream_duration: video?.duration ?? draft.stream_duration,
          stream_thumbnail_url: thumbBase,
        })
        .eq("id", draft.id);
    }

    // Cloudflare only serves an MP4 once a download copy has been created for
    // the video. Ask for one (idempotent) and only hand back a link when ready.
    let downloadUrl: string | null = null;
    let downloadReady = false;
    const dlPath = `/stream/${draft.stream_uid}/downloads`;
    let dl = await streamApi(dlPath);
    let dlState = String(dl.data?.result?.default?.status ?? "").toLowerCase();
    if (!dl.ok || !dlState) {
      dl = await streamApi(dlPath, { method: "POST", body: "{}" });
      dlState = String(dl.data?.result?.default?.status ?? "").toLowerCase();
    }
    if (dlState === "ready") downloadReady = true;

    const [token, dlToken] = await Promise.all([
      signStreamToken(draft.stream_uid),
      signStreamToken(draft.stream_uid, true),
    ]);
    if (downloadReady) {
      downloadUrl = `${base}/downloads/default.mp4${dlToken ? `?token=${dlToken}` : ""}`;
    }

    return json({
      status: "ready",
      duration: video?.duration ?? draft.stream_duration ?? null,
      embedUrl: `${base}/iframe${token ? `?token=${token}` : ""}`,
      posterUrl: `${thumbBase}${token ? `?token=${token}` : ""}`,
      downloadUrl,
      downloadStatus: downloadReady ? "ready" : "preparing",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
