// Shared Pesapal v3 helpers
// Pesapal v3 uses a single live endpoint; PESAPAL_ENV is informational only.
declare const Deno: { env: { get(name: string): string | undefined } };

export const PESAPAL_BASE = "https://pay.pesapal.com/v3";

export async function pesapalAuth(): Promise<string> {
  const r = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: Deno.env.get("PESAPAL_CONSUMER_KEY"),
      consumer_secret: Deno.env.get("PESAPAL_CONSUMER_SECRET"),
    }),
  });
  const text = await r.text();
  let j: any;
  try { j = JSON.parse(text); } catch {
    throw new Error(`Pesapal auth non-JSON (status ${r.status}): ${text.slice(0, 200)}`);
  }
  if (!j.token) throw new Error(`Pesapal auth failed (status ${r.status}): ${JSON.stringify(j)}`);
  return j.token as string;
}

export async function pesapalGetStatus(token: string, orderTrackingId: string) {
  const r = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return await r.json();
}

// ---------------------------------------------------------------- storefront bookings: their own keys and callback

/** A Pesapal merchant's keys. The storefront has its own, so booking money lands where the house (for now, Lana) says. */
export type PesapalKeys = { key: string; secret: string };

/** The storefront's Pesapal keys, or null when they aren't set (then only bank transfer is offered). */
export function storefrontPesapalKeys(): PesapalKeys | null {
  const key = Deno.env.get("STOREFRONT_PESAPAL_CONSUMER_KEY");
  const secret = Deno.env.get("STOREFRONT_PESAPAL_CONSUMER_SECRET");
  return key && secret ? { key, secret } : null;
}

type PesapalReply = { token?: string; ipn_id?: string; order_tracking_id?: string; redirect_url?: string; error?: { message?: string } | null };

async function readReply(r: Response): Promise<PesapalReply> {
  const text = await r.text();
  try { return JSON.parse(text) as PesapalReply; } catch { throw new Error(`Pesapal answered ${r.status}: ${text.slice(0, 200)}`); }
}

/** An access token for these keys. */
export async function pesapalTokenFor(keys: PesapalKeys): Promise<string> {
  const r = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: keys.key, consumer_secret: keys.secret }),
  });
  const j = await readReply(r);
  if (!j.token) throw new Error(`Pesapal: ${j.error?.message ?? `sign-in failed (${r.status})`}`);
  return j.token;
}

const ipnIds = new Map<string, string>();
const sameUrl = (url: string) => url.trim().toLowerCase().replace(/\/+$/, "");

/**
 * The id Pesapal knows this notification address by: an existing registration for the same address (ignoring case and
 * a trailing slash), else a new one. Kept for the life of the function instance.
 */
export async function pesapalIpnId(token: string, url: string): Promise<string> {
  const key = sameUrl(url);
  const cached = ipnIds.get(key);
  if (cached) return cached;
  const auth = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const listed = await fetch(`${PESAPAL_BASE}/api/URLSetup/GetIpnList`, { headers: auth });
  const list: unknown = await listed.json().catch(() => []);
  const found = (Array.isArray(list) ? list : []).find(
    (x): x is { url: string; ipn_id: string } => typeof x?.url === "string" && typeof x?.ipn_id === "string" && sameUrl(x.url) === key,
  );
  if (found) {
    ipnIds.set(key, found.ipn_id);
    return found.ipn_id;
  }
  const r = await fetch(`${PESAPAL_BASE}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ url, ipn_notification_type: "POST" }),
  });
  const j = await readReply(r);
  if (!j.ipn_id) throw new Error(`Pesapal: ${j.error?.message ?? "the notification address could not be registered"}`);
  ipnIds.set(key, j.ipn_id);
  return j.ipn_id;
}

export type PesapalOrder = {
  id: string; amount: number; description: string; callback_url: string; notification_id: string;
  email: string; phone: string | null; first_name: string; last_name: string;
};

/** Starts a payment in KES and returns where to send the buyer; throws with Pesapal's own message when it refuses. */
export async function pesapalSubmitOrder(token: string, order: PesapalOrder): Promise<{ order_tracking_id: string; redirect_url: string }> {
  const r = await fetch(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      id: order.id,
      currency: "KES",
      amount: order.amount,
      description: order.description.slice(0, 100),
      callback_url: order.callback_url,
      notification_id: order.notification_id,
      billing_address: {
        email_address: order.email,
        phone_number: order.phone,
        first_name: order.first_name,
        last_name: order.last_name,
      },
    }),
  });
  const j = await readReply(r);
  if (!j.redirect_url || !j.order_tracking_id) throw new Error(`Pesapal: ${j.error?.message ?? `no payment page came back (${r.status})`}`);
  return { order_tracking_id: j.order_tracking_id, redirect_url: j.redirect_url };
}
