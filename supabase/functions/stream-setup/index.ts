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

  if (action === "probe") {
    const tok = Deno.env.get("CLOUDFLARE_STREAM_TOKEN") ?? "";
    const raw = async (path: string) => {
      const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        headers: { Authorization: `Bearer ${tok.trim()}` },
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* ignore */ }
      return { status: res.status, errors: data?.errors ?? null, result: data?.result ?? null };
    };
    const acc = accountId() ?? "";
    const verify = await raw(`/accounts/${acc}/tokens/verify`);
    const tokenId = (verify.result as any)?.id ?? null;
    const detail = tokenId ? await raw(`/accounts/${acc}/tokens/${tokenId}`) : null;
    const subs = await raw(`/accounts/${acc}/subscriptions`);
    return json({
      tokenShape: {
        length: tok.length,
        prefix: tok.slice(0, 5),
        hasWhitespace: /\s/.test(tok),
        trimmedDiffers: tok.trim().length !== tok.length,
      },
      tokenId,
      tokenName: (detail?.result as any)?.name ?? null,
      tokenPolicies: (detail?.result as any)?.policies ?? detail?.errors ?? null,
      subscriptions: (subs.result ?? []).map((s: any) => s?.rate_plan?.id ?? s?.product?.name ?? null),
      streamList: await raw(`/accounts/${acc}/stream?per_page=1`),
      streamKeys: await raw(`/accounts/${acc}/stream/keys`),
    });
  }

  if (action === "audit") {
    // Recent uploads with their real state — pending uploads that never finished,
    // and conversion errors (duration cap, unsupported codec) show up here.
    const { ok, data } = await streamApi("/stream?per_page=60");
    if (!ok) return json({ ok: false, errors: data?.errors ?? data }, 502);
    const rows = (data?.result ?? []).map((v: any) => ({
      uid: v.uid,
      created: v.created,
      name: v?.meta?.name ?? null,
      size: v.size,
      duration: v.duration,
      state: v?.status?.state ?? null,
      step: v?.status?.pctComplete ?? null,
      errorCode: v?.status?.errorReasonCode ?? null,
      errorText: v?.status?.errorReasonText ?? null,
      uploadExpiry: v.uploadExpiry ?? null,
      maxDurationSeconds: v.maxDurationSeconds ?? null,
    }));
    const byState: Record<string, number> = {};
    for (const r of rows) byState[String(r.state)] = (byState[String(r.state)] ?? 0) + 1;
    return json({ ok: true, byState, rows });
  }

  if (action === "webhook") {
    const url = String((body as any)?.url ?? "");
    if (!/^https:\/\//.test(url)) return json({ error: "https url required" }, 400);
    const { ok, data } = await streamApi("/stream/webhook", {
      method: "PUT",
      body: JSON.stringify({ notificationUrl: url }),
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
