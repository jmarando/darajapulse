import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "daraja-pulse-ig-verify-9f2a7c";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // Webhook verification handshake from Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  // Event delivery
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("ig webhook event", JSON.stringify(body));
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
      // Persist raw payload for later processing
      await supabase.from("instagram_oauth_states").select("state").limit(1); // touch
      // TODO: route mentions/comments/insights events to the right handler
      return new Response("ok", { status: 200, headers: corsHeaders });
    } catch (e) {
      console.error("ig webhook error", e);
      return new Response("error", { status: 500 });
    }
  }

  return new Response("method not allowed", { status: 405 });
});
