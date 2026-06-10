// Shared Pesapal v3 helpers
export const PESAPAL_BASE = (Deno.env.get("PESAPAL_ENV") ?? "sandbox").toLowerCase() === "live"
  ? "https://pay.pesapal.com/v3"
  : "https://cybqa.pesapal.com/pesapalv3";

export async function pesapalAuth(): Promise<string> {
  const r = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: Deno.env.get("PESAPAL_CONSUMER_KEY"),
      consumer_secret: Deno.env.get("PESAPAL_CONSUMER_SECRET"),
    }),
  });
  const j = await r.json();
  if (!j.token) throw new Error(`Pesapal auth failed: ${JSON.stringify(j)}`);
  return j.token as string;
}

export async function pesapalGetStatus(token: string, orderTrackingId: string) {
  const r = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return await r.json();
}
