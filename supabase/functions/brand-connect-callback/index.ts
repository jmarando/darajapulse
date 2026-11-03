// Meta sends the person back here after login. Stores what they shared, and the login's token in the vault, while they
// tick this brand's accounts on the next page. Whatever goes wrong ends on that page, in plain words, with nothing stored.
import { createClient } from "npm:@supabase/supabase-js@2";
import { GRAPH_VERSION, graphCall, listAccounts, shapeAssets } from "../_shared/meta-graph.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://darajapulse.com";
const HOUR = 3_600_000;
const ASSET_FIELDS = "id,name,username,picture{url},instagram_business_account{id,username,name,profile_picture_url}";

const finish = (params: Record<string, string>) => Response.redirect(`${APP_ORIGIN}/connect/brand/done?${new URLSearchParams(params).toString()}`, 302);

/** Meta's token swap takes the app's secret in the address. This address must never be logged. */
async function swap(params: Record<string, string>): Promise<string | null> {
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${new URLSearchParams(params).toString()}`);
  const body = await r.json().catch(() => null);
  return typeof body?.access_token === "string" ? body.access_token : null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");

  // Taken away first, so a replayed address finds nothing.
  const { data: started } = await supabase
    .from("brand_oauth_states")
    .delete()
    .eq("state", state)
    .select("client_id, connect_link_id, started_by, created_at")
    .maybeSingle();
  if (!started || Date.now() - Date.parse(started.created_at) > HOUR) return finish({ status: "error", reason: "invalid_state" });

  let back: Record<string, string> = {};
  if (started.connect_link_id) {
    const { data: link } = await supabase.from("brand_connect_links").select("token").eq("id", started.connect_link_id).maybeSingle();
    if (link?.token) back = { link: link.token };
  }
  if (url.searchParams.get("error") || !code) return finish({ status: "error", reason: "denied", ...back });

  const appId = Deno.env.get("META_APP_ID") ?? "";
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  const first = await swap({ client_id: appId, client_secret: appSecret, redirect_uri: `${SUPABASE_URL}/functions/v1/brand-connect-callback`, code });
  if (!first) return finish({ status: "error", reason: "token", ...back });
  // A long-lived user token gives page tokens with no expiry. A login's business token can't be swapped, and needn't be.
  const token = (await swap({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: first })) ?? first;

  const graph = graphCall(token);
  const { rows, error: listError } = await listAccounts(graph, ASSET_FIELDS);
  const assets = listError ? [] : shapeAssets(rows);
  if (!assets.length) return finish({ status: "error", reason: "no_pages", ...back });

  const [me, permissions] = await Promise.all([graph("me", { fields: "id,name" }), graph("me/permissions", {})]);
  const granted = (Array.isArray(permissions.json?.data) ? permissions.json.data : [])
    .filter((p: { status?: string }) => p.status === "granted")
    .map((p: { permission: string }) => p.permission);
  const { data: pendingId, error } = await supabase.rpc("create_brand_connect_pending", {
    _state: state,
    _client_id: started.client_id,
    _assets: assets,
    _token: token,
    _meta_user_id: me.json?.id ?? null,
    _person_name: me.json?.name ?? null,
    _scopes: granted,
    _started_by: started.started_by,
  });
  if (error || !pendingId) {
    console.error("brand connect: could not hold the login", { message: error?.message });
    return finish({ status: "error", reason: "token", ...back });
  }
  return finish({ p: pendingId as string, s: state });
});
