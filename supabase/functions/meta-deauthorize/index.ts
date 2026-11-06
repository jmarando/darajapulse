// Meta calls this when someone removes the app in their Facebook settings. Their brand page tokens go at once, and those
// channels say so. Registered as the app's Deauthorize callback URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parseSignedRequest } from "../_shared/meta-graph.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const form = await req.formData().catch(() => null);
  const who = await parseSignedRequest(String(form?.get("signed_request") ?? ""), Deno.env.get("META_APP_SECRET") ?? "");
  if (!who) return new Response("bad signature", { status: 400 });
  const { error } = await supabase.rpc("revoke_brand_tokens_for_meta_user", { _meta_user_id: who.user_id });
  if (error) {
    console.error("meta-deauthorize failed", error.message);
    return new Response("try again", { status: 500 });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
