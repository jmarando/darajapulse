import { afterEach, describe, expect, it, vi } from "vitest";
import { pesapalIpnId, pesapalSubmitOrder } from "../../supabase/functions/_shared/pesapal";
import { settleFromPesapal, type Mailer } from "../../supabase/functions/_shared/storefront-booking-actions";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("Pesapal's callback address", () => {
  it("reuses a registration for the same address", async () => {
    const fetch = vi.fn(async (_url: string) => json([{ url: "https://x.supabase.co/functions/v1/storefront-pesapal-ipn/", ipn_id: "ipn-old" }]));
    vi.stubGlobal("fetch", fetch);
    expect(await pesapalIpnId("tok", "https://X.supabase.co/functions/v1/storefront-pesapal-ipn")).toBe("ipn-old");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain("/api/URLSetup/GetIpnList");
  });

  it("registers the address when Pesapal doesn't know it", async () => {
    const fetch = vi.fn(async (url: string) => (String(url).includes("GetIpnList") ? json([]) : json({ ipn_id: "ipn-new" })));
    vi.stubGlobal("fetch", fetch);
    expect(await pesapalIpnId("tok", "https://y.supabase.co/functions/v1/storefront-pesapal-ipn")).toBe("ipn-new");
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toContain("/api/URLSetup/RegisterIPN");
    expect(JSON.parse(String(init.body))).toEqual({ url: "https://y.supabase.co/functions/v1/storefront-pesapal-ipn", ipn_notification_type: "POST" });
  });
});

describe("submitting an order", () => {
  const order = {
    id: "BK-7F3K2Q-1", amount: 481400, description: "Radio Africa Group booking BK-7F3K2Q",
    callback_url: "https://radioafrica.darajapulse.com/booking/tok", notification_id: "ipn-1",
    email: "wanjiku@example.com", phone: "0712345678", first_name: "Wanjiku", last_name: "Kamau",
  };

  it("sends the amount in KES with the buyer's details", async () => {
    const fetch = vi.fn(async () => json({ order_tracking_id: "trk-1", redirect_url: "https://pay.pesapal.com/iframe/x" }));
    vi.stubGlobal("fetch", fetch);
    expect(await pesapalSubmitOrder("tok", order)).toEqual({ order_tracking_id: "trk-1", redirect_url: "https://pay.pesapal.com/iframe/x" });
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({
      id: "BK-7F3K2Q-1", currency: "KES", amount: 481400, notification_id: "ipn-1",
      billing_address: { email_address: "wanjiku@example.com", phone_number: "0712345678", first_name: "Wanjiku", last_name: "Kamau" },
    });
  });

  it("says what Pesapal refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "Invalid amount" } })));
    await expect(pesapalSubmitOrder("tok", order)).rejects.toThrow("Pesapal: Invalid amount");
  });
});

/** A stand-in for the service-role client: guarded booking updates and event inserts. */
function fakeDb(dbStatus: string) {
  const updates: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  let status = dbStatus;
  const client = {
    from(table: string) {
      if (table === "storefront_booking_events") {
        return { insert: async (row: Record<string, unknown>) => { events.push(row); return { error: null }; } };
      }
      return {
        update(patch: Record<string, unknown>) {
          const guards: [string, unknown][] = [];
          const chain = {
            eq(col: string, val: unknown) { guards.push([col, val]); return chain; },
            async select() {
              const blocked = guards.some(([col, val]) => col === "status" && val !== status);
              if (blocked) return { data: [], error: null };
              updates.push(patch);
              if (typeof patch.status === "string") status = patch.status;
              return { data: [{ id: "b1" }], error: null };
            },
          };
          return chain;
        },
      };
    },
  };
  return { client, updates, events };
}

describe("settling a booking from Pesapal's answer", () => {
  const paidStatus = { status_code: 1, amount: 481400, currency: "KES", confirmation_code: "QK12", payment_method: "MpesaKE" };
  const mailer = () => {
    const sent: string[] = [];
    const mail: Mailer = { buyer: async (e) => { sent.push(`buyer:${e}`); }, house: async (e) => { sent.push(`house:${e}`); } };
    return { mail, sent };
  };

  it("marks it paid once, logs it and tells both sides", async () => {
    const db = fakeDb("awaiting_payment");
    const { mail, sent } = mailer();
    expect(await settleFromPesapal(db.client as never, { id: "b1", status: "awaiting_payment", total_kes: 481400 }, paidStatus, mail)).toBe("paid");
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({ status: "paid", payment_ref: "QK12" });
    expect(db.events).toEqual([expect.objectContaining({ booking_id: "b1", actor: "system", kind: "paid" })]);
    expect(sent).toEqual(["buyer:paid", "house:paid"]);
  });

  it("does nothing the second time", async () => {
    const db = fakeDb("paid");
    const { mail, sent } = mailer();
    expect(await settleFromPesapal(db.client as never, { id: "b1", status: "paid", total_kes: 481400 }, paidStatus, mail)).toBe("already");
    expect(db.updates).toHaveLength(0);
    expect(db.events).toHaveLength(0);
    expect(sent).toEqual([]);
  });

  it("does nothing when another call got there first", async () => {
    const db = fakeDb("paid");
    const { mail, sent } = mailer();
    expect(await settleFromPesapal(db.client as never, { id: "b1", status: "awaiting_payment", total_kes: 481400 }, paidStatus, mail)).toBe("already");
    expect(db.events).toHaveLength(0);
    expect(sent).toEqual([]);
  });

  it("leaves a failed payment unpaid", async () => {
    const db = fakeDb("awaiting_payment");
    const { mail, sent } = mailer();
    expect(await settleFromPesapal(db.client as never, { id: "b1", status: "awaiting_payment", total_kes: 481400 }, { status_code: 2, amount: 481400, currency: "KES" }, mail)).toBe("not_paid");
    expect(db.updates.every((u) => u.status === undefined)).toBe(true);
    expect(sent).toEqual([]);
  });
});
