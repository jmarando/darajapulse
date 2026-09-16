// Shared helpers for the Cloudflare Stream video pipeline.
// Used by stream-upload-url, stream-webhook and stream-sign.

export const CF_API = "https://api.cloudflare.com/client/v4";

export const streamToken = () => Deno.env.get("CLOUDFLARE_STREAM_TOKEN") ?? "";
export const accountId = () => Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
export const streamConfigured = () => Boolean(streamToken() && accountId());

/** Call the Cloudflare Stream API. Returns { ok, status, data } — never throws. */
export async function streamApi(path: string, init: RequestInit = {}) {
  try {
    const res = await fetch(`${CF_API}/accounts/${accountId()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${streamToken()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    return { ok: res.ok && data?.success !== false, status: res.status, data };
  } catch (e) {
    console.error("streamApi network error", path, e);
    return { ok: false, status: 0, data: null as any };
  }
}

const b64urlBytes = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Signed playback token (HS256 JWT) for a Stream video.
 * Returns null when the signing key has not been provisioned yet —
 * callers fall back to plain (unguessable-UID) URLs in that case.
 */
export async function signStreamToken(uid: string, download = false): Promise<string | null> {
  const key = Deno.env.get("STREAM_SIGNING_KEY");
  const kid = Deno.env.get("STREAM_SIGNING_KEY_ID");
  if (!key || !kid) return null;
  const enc = new TextEncoder();
  const b = (o: unknown) => b64urlBytes(enc.encode(JSON.stringify(o)));
  const header = b({ alg: "HS256", kid });
  const claims: Record<string, unknown> = { sub: uid, exp: Math.floor(Date.now() / 1000) + 6 * 3600 };
  if (download) claims.downloadables = ["mp4"];
  const payload = b(claims);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64urlBytes(sig)}`;
}

/** Verify Cloudflare's Webhook-Signature header (t=...,v1=...). */
export async function verifyWebhookSignature(body: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const [k, ...rest] = piece.trim().split("=");
    if (k && rest.length) parts[k.trim()] = rest.join("=").trim();
  }
  const t = parts["t"];
  const given = parts["v1"] ?? parts["s"];
  if (!t || !given) return false;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${t}.${body}`)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = b64urlBytes(mac);
  return given === hex || given === b64 || given === b64.replace(/_/g, "/").replace(/-/g, "+");
}

/** Extract the customer subdomain code (customer-xxxxxxxx) from a Stream URL. */
export const customerCodeFrom = (...urls: (string | null | undefined)[]): string | null => {
  for (const u of urls) {
    const m = u?.match(/customer-([a-z0-9]+)\.cloudflarestream\.com/i);
    if (m) return m[1];
  }
  return null;
};
