// Starts a Facebook login for a brand's pages, and answers the address to send the person to.
//
// Callers
//   - anyone holding a brand's connect link (body { link_token }): no Pulse login needed
//   - a signed-in person who can see the brand (body { client_id }): staff or the brand's own users
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { denied, requireCaller } from "../_shared/auth.ts";
import { metaDialogUrl } from "../_shared/meta-graph.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** 64 hex characters, as the table requires: single use, and the only thing tying Meta's answer to this login. */
const newState = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const appId = Deno.env.get("META_APP_ID") ?? "";
  if (!appId) return json({ error: "Facebook isn't set up on the server yet." }, 500);
  try {
    const body = await req.json().catch(() => ({}));
    let clientId: string;
    let startedBy: string | null = null;
    let linkId: string | null = null;

    if (typeof body?.link_token === "string" && body.link_token) {
      const { data: link } = await supabase.from("brand_connect_links").select("id, client_id, revoked_at, expires_at").eq("token", body.link_token).maybeSingle();
      if (!link || link.revoked_at || Date.parse(link.expires_at) <= Date.now()) return json({ error: "This link has expired or was cancelled." }, 410);
      clientId = link.client_id;
      linkId = link.id;
      await supabase.from("brand_connect_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);
    } else {
      const caller = await requireCaller(req, { anySignedIn: true });
      if (caller instanceof Response) return caller;
      if (caller.kind !== "user" || typeof body?.client_id !== "string") return denied(403, "Sign in and pick a brand.");
      const { data: allowed } = await supabase.rpc("can_view_brand_channels", { _user_id: caller.userId, _client_id: body.client_id });
      if (allowed !== true) return denied(403, "You don't have access to this brand.");
      clientId = body.client_id;
      startedBy = caller.userId;
    }

    await supabase.rpc("clear_brand_connect_expired");
    const state = newState();
    const { error } = await supabase.from("brand_oauth_states").insert({ state, client_id: clientId, connect_link_id: linkId, started_by: startedBy });
    if (error) throw error;
    return json({
      url: metaDialogUrl({ appId, redirectUri: `${SUPABASE_URL}/functions/v1/brand-connect-callback`, state, configId: Deno.env.get("META_LOGIN_CONFIG_ID") ?? null }),
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
