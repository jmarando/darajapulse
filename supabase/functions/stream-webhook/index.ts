import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { streamApi, verifyWebhookSignature } from "../_shared/stream.ts";

/**
 * Cloudflare Stream webhook: marks creator drafts "ready" (or "failed") as soon
 * as conversion finishes. If the signature cannot be verified (secret not yet
 * provisioned), we double-check the video exists via the API before trusting it.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const raw = await req.text();
  let event: any = null;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400, headers: corsHeaders });
  }

  const uid = String(event?.uid ?? "");
  if (!uid) return new Response("ok", { headers: corsHeaders });

  const verified = await verifyWebhookSignature(raw, req.headers.get("Webhook-Signature"));
  if (!verified) {
    // Unverified source: only act if Cloudflare's own API confirms this video exists.
    const { ok } = await streamApi(`/stream/${uid}`);
    if (!ok) return new Response("bad signature", { status: 401, headers: corsHeaders });
  }

  const state = String(event?.status?.state ?? (event?.readyToStream ? "ready" : "")).toLowerCase();

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (state === "ready" || event?.readyToStream) {
      const { ok, data } = await streamApi(`/stream/${uid}`);
      const video = ok ? data?.result : null;
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
