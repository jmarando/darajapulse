// Meta (Instagram) webhook endpoint. Answers the subscription handshake and checks
// the X-Hub-Signature-256 on every delivery; events are acknowledged but not yet
// processed.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { secretsMatch } from "../_shared/auth.ts";

// No fallbacks: an unset secret fails closed instead of accepting a known value.
const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

/** Meta signs each delivery with the app secret: X-Hub-Signature-256: sha256=<hex hmac>. */
async function signatureValid(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET || !header?.startsWith("sha256=")) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return secretsMatch(header.slice("sha256=".length), hex);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // Webhook verification handshake from Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && secretsMatch(token, VERIFY_TOKEN)) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  // Event delivery
  if (req.method === "POST") {
    const raw = await req.text();
    if (!(await signatureValid(raw, req.headers.get("X-Hub-Signature-256")))) {
      return new Response("bad signature", { status: 401 });
    }
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("bad request", { status: 400 });
    }
    // Log the shape only: payloads carry usernames and comment text.
    const fields = (body?.entry ?? []).flatMap((e: any) => (e?.changes ?? []).map((c: any) => c?.field));
    console.log("ig webhook event", { object: body?.object, entries: body?.entry?.length ?? 0, fields });
    // TODO: route mentions/comments/insights events to the right handler
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  return new Response("method not allowed", { status: 405 });
});
