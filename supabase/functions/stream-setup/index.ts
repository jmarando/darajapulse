import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { accountId, streamApi, streamConfigured } from "../_shared/stream.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * One-time bootstrap / diagnostics for the Stream pipeline:
 *  - GET  { action: "check" }   → token health + current webhook
 *  - POST { action: "webhook" } → point Cloudflare's webhook at our function (returns its secret once)
 *  - POST { action: "key" }     → create a signed-playback key (returns the key once; store as secret)
 * Deleted after setup.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!streamConfigured()) return json({ error: "missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_TOKEN" }, 503);

  const body = await req.json().catch(() => ({}));
  const action = String((body as any)?.action ?? "check");

  if (action === "check") {
    // Raw calls to separate "bad token" from "token lacks Stream access".
    const raw = async (url: string, init: RequestInit = {}) => {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${Deno.env.get("CLOUDFLARE_STREAM_TOKEN") ?? ""}`, ...(init.headers ?? {}) },
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON */ }
      return { status: res.status, errors: data?.errors ?? null, result: data?.result ?? null };
    };
    const verify = await raw("https://api.cloudflare.com/client/v4/user/tokens/verify");
    const accounts = await raw("https://api.cloudflare.com/client/v4/accounts?per_page=5");
    const configured = accountId();
    const listed = (accounts.result ?? []).map((a: any) => a.id);
    const accountMatch = configured ? listed.includes(configured) : null;
    const list = await streamApi("/stream?per_page=1");
    const hook = await streamApi("/stream/webhook");
    return json({
      tokenVerify: { status: verify.status, errors: verify.errors, valid: verify.result?.status ?? null },
      accountsListed: accounts.status === 200 ? listed : accounts.errors,
      configuredAccountId: configured ? `${configured.slice(0, 6)}…${configured.slice(-4)}` : null,
      accountMatch,
      tokenWorks: list.ok,
      listError: list.ok ? null : list.data?.errors ?? list.status,
      webhook: hook.ok ? hook.data?.result : hook.data?.errors ?? hook.status,
    });
  }

  if (action === "webhook") {
    const url = String((body as any)?.url ?? "");
    if (!/^https:\/\//.test(url)) return json({ error: "https url required" }, 400);
    const { ok, data } = await streamApi("/stream/webhook", {
      method: "PUT",
      body: JSON.stringify({ url, notificationEmail: "justin@glab.africa" }),
    });
    return json(ok ? { ok: true, result: data?.result } : { ok: false, errors: data?.errors ?? data }, ok ? 200 : 502);
  }

  if (action === "key") {
    const { ok, data } = await streamApi("/stream/keys", { method: "POST" });
    return json(ok ? { ok: true, result: data?.result } : { ok: false, errors: data?.errors ?? data }, ok ? 200 : 502);
  }

  if (action === "keys-list") {
    const { ok, data } = await streamApi("/stream/keys");
    return json(ok ? { ok: true, result: data?.result } : { ok: false, errors: data?.errors ?? data });
  }

  return json({ error: "unknown action" }, 400);
});
