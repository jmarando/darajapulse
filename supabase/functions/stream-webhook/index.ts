import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { streamApi, verifyWebhookSignature } from "../_shared/stream.ts";

/**
 * Cloudflare Stream webhook: marks creator drafts "ready" (or "failed") as soon
 * as conversion finishes. If the signature cannot be verified (secret not yet
 * provisioned), the video's state comes from the Stream API, never the payload.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const raw = await req.text();
  if (!raw.trim()) return new Response("ok", { headers: corsHeaders }); // Cloudflare URL validation probe
  let event: any = null;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("ok", { headers: corsHeaders });
  }


  const uid = String(event?.uid ?? "");
  if (!uid) return new Response("ok", { headers: corsHeaders });

  const verified = await verifyWebhookSignature(raw, req.headers.get("Webhook-Signature"));
  // Unsigned deliveries are only a hint: their state is read back from Cloudflare's
  // own API, so a forged event for a known video can't mark the draft failed.
  const { ok: found, data: lookup } = await streamApi(`/stream/${uid}`);
  const video = found ? lookup?.result : null;
  if (!verified && !video) return new Response("bad signature", { status: 401, headers: corsHeaders });
  const source = verified ? event : video;

  const state = String(source?.status?.state ?? (source?.readyToStream ? "ready" : "")).toLowerCase();

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (state === "ready" || source?.readyToStream) {
      await admin
        .from("creator_drafts")
        .update({ stream_status: "ready", stream_duration: video?.duration ?? null })
        .eq("stream_uid", uid);
    } else if (state === "errored" || state === "failed" || state === "in-progress-failed") {
      await admin.from("creator_drafts").update({ stream_status: "failed" }).eq("stream_uid", uid);
    }
  } catch (e) {
    console.error("stream-webhook db update failed", e);
    // Return 500 so Cloudflare retries the delivery.
    return new Response("error", { status: 500, headers: corsHeaders });
  }

  return new Response("ok", { headers: corsHeaders });
});
