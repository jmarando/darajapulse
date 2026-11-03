// The choosing page behind a brand connect login. Holding the pending id and its state is what lets a person in, so no
// Pulse login is needed. Only what they tick is stored; the brand always comes from the pending row.
//   { action: "read" }    what was shared, for the page to show
//   { action: "confirm", asset_ids }    connects the ticked accounts
//   { action: "cancel" }    forgets the login
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assetHandle, graphCall, listAccounts, matchChannel, type SharedAsset } from "../_shared/meta-graph.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const GONE = "This step is finished or has expired. Open the link again if you still need to connect.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Pending = {
  id: string;
  client_id: string;
  state: string;
  assets: SharedAsset[];
  meta_user_id: string | null;
  person_name: string | null;
  scopes: string[];
  started_by: string | null;
  expires_at: string;
};

function firstRead(channelIds: string[]) {
  const reading = fetch(`${SUPABASE_URL}/functions/v1/brand-channels-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({ channel_ids: channelIds }),
  }).catch((e) => console.error("brand connect: first read did not start", (e as Error).message));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(reading);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const pendingId = typeof body?.pending_id === "string" && UUID.test(body.pending_id) ? body.pending_id : null;
    const state = typeof body?.state === "string" ? body.state : null;
    if (!pendingId || !state) return json({ error: GONE }, 410);
    const { data } = await supabase.from("brand_connect_pending").select("*").eq("id", pendingId).eq("state", state).maybeSingle();
    const pending = data as Pending | null;
    if (!pending || Date.parse(pending.expires_at) <= Date.now()) return json({ error: GONE }, 410);

    if (body?.action === "read") {
      const { data: client } = await supabase.from("clients").select("name, agencies(name, display_name)").eq("id", pending.client_id).maybeSingle();
      const agency = (client as { agencies?: { name: string; display_name: string | null } } | null)?.agencies;
      return json({ brand_name: client?.name ?? "this brand", agency_name: agency?.display_name ?? agency?.name ?? null, assets: pending.assets });
    }

    if (body?.action === "cancel") {
      await supabase.from("brand_connect_pending").delete().eq("id", pending.id);
      return json({ cancelled: true });
    }

    if (body?.action !== "confirm") return json({ error: "Unknown action." }, 400);
    const wanted = new Set<string>(Array.isArray(body?.asset_ids) ? body.asset_ids.filter((id: unknown) => typeof id === "string") : []);
    const assets = pending.assets ?? [];
    const picked = assets.filter((a) => wanted.has(a.id));
    if (!picked.length || picked.length !== wanted.size) return json({ error: "Tick at least one of the accounts Facebook shared." }, 400);

    const { data: loginToken } = await supabase.rpc("brand_connect_pending_token", { _pending_id: pending.id, _state: state });
    if (!loginToken) return json({ error: GONE }, 410);
    const { rows, error: listError } = await listAccounts(graphCall(loginToken as string), "id,access_token");
    if (listError) return json({ error: "Facebook didn't answer. Please try again." }, 502);
    const pageTokens = new Map<string, string>(rows.map((r: { id: string; access_token: string }) => [r.id, r.access_token]));

    const { data: channels, error: channelError } = await supabase.from("brand_channels").select("id, platform, handle, external_id").eq("client_id", pending.client_id);
    if (channelError) throw channelError;

    const connected: { name: string | null; username: string | null; platform: string }[] = [];
    const channelIds: string[] = [];
    for (const asset of picked) {
      const pageToken = pageTokens.get(asset.page_id);
      if (!pageToken) continue; // the person took this page away between the two steps
      const fields = { external_id: asset.id, display_name: asset.name, avatar_url: asset.avatar_url };
      let channelId = matchChannel(asset, channels ?? []);
      if (channelId) {
        const { error } = await supabase.from("brand_channels").update(fields).eq("id", channelId);
        if (error) throw error;
      } else {
        const { data: added, error } = await supabase
          .from("brand_channels")
          .insert({ client_id: pending.client_id, platform: asset.platform, handle: assetHandle(asset), created_by: pending.started_by, ...fields })
          .select("id")
          .single();
        if (error) throw error;
        channelId = added.id as string;
      }
      const { error: tokenError } = await supabase.rpc("set_brand_channel_token", {
        _channel_id: channelId,
        _token: pageToken,
        _kind: "page",
        _scopes: pending.scopes,
        _meta_user_id: pending.meta_user_id,
        _business_id: null,
        _connected_by: pending.started_by,
        _connected_by_name: pending.person_name,
      });
      if (tokenError) throw tokenError;
      connected.push({ name: asset.name, username: asset.username, platform: asset.platform });
      channelIds.push(channelId);
    }
    if (!connected.length) return json({ error: "Facebook no longer shares those accounts. Please try again." }, 502);

    await supabase.from("brand_connect_pending").delete().eq("id", pending.id);
    firstRead(channelIds);
    return json({ connected, signed_in: !!pending.started_by });
  } catch (e) {
    console.error("brand connect: confirm failed", (e as Error).message);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
