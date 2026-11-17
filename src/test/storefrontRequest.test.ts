import { describe, expect, it } from "vitest";
import {
  bookingRow, checkRequest, emailData, houseRecipients, LIMITS, pickLines, type StorefrontItem,
} from "../../supabase/functions/_shared/storefront-request";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const good = {
  agency_slug: "radioafrica",
  item_ids: [A, B],
  contact_name: "  Wanjiru Kamau ",
  contact_email: "Wanjiru@Example.com",
  contact_phone: "+254 700 000 000",
  company: "Example Agency",
  budget_kes: "2500000",
  target_start: "2026-12-01",
  target_end: "2026-12-31",
  message: "Festive campaign",
  brief: "Mobile money for youth in Nairobi",
};

const items: StorefrontItem[] = [
  { id: A, kind: "ad_slot", title: "Classic 105: breakfast show sponsorship", platform: "radio", handle: null, deliverable_type: "Show sponsorship, 4 weeks" },
  { id: B, kind: "owned_account", title: "Mpasho on TikTok", platform: "tiktok", handle: "@mpashonews", deliverable_type: "Branded TikTok video" },
];

describe("checking a storefront quote request", () => {
  it("accepts a complete request and tidies it", () => {
    const r = checkRequest(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contactName).toBe("Wanjiru Kamau");
    expect(r.value.contactEmail).toBe("wanjiru@example.com");
    expect(r.value.budgetKes).toBe(2_500_000);
    expect(r.value.itemIds).toEqual([A, B]);
  });

  it("asks for the name, a valid email and at least one item", () => {
    expect(checkRequest({ ...good, contact_name: " " })).toMatchObject({ ok: false, error: "Add your name." });
    expect(checkRequest({ ...good, contact_email: "not-an-email" })).toMatchObject({ ok: false, error: "Add a valid email address." });
    expect(checkRequest({ ...good, item_ids: [] })).toMatchObject({ ok: false, error: "Pick at least one item." });
    expect(checkRequest({ ...good, item_ids: ["not-a-uuid"] })).toMatchObject({ ok: false, error: "Pick at least one item." });
  });

  it("refuses a slug that isn't a plain slug, too many items, a bad budget and dates in the wrong order", () => {
    expect(checkRequest({ ...good, agency_slug: "radio%africa" }).ok).toBe(false);
    const many = Array.from({ length: LIMITS.items + 1 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    expect(checkRequest({ ...good, item_ids: many }).ok).toBe(false);
    expect(checkRequest({ ...good, budget_kes: "lots" })).toMatchObject({ ok: false });
    expect(checkRequest({ ...good, budget_kes: -5 })).toMatchObject({ ok: false });
    expect(checkRequest({ ...good, target_start: "2026-12-31", target_end: "2026-12-01" }))
      .toMatchObject({ ok: false, error: "The end date is before the start date." });
  });

  it("treats a filled hidden field as a bot, quietly", () => {
    expect(checkRequest({ ...good, website: "http://spam.example" })).toMatchObject({ ok: false, spam: true });
  });

  it("drops duplicate items, NUL characters and empty optional fields", () => {
    const r = checkRequest({ ...good, item_ids: [A, A, B], message: "hi\u0000 there", company: "  ", budget_kes: "", target_end: "31/12/2026" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.itemIds).toEqual([A, B]);
    expect(r.value.message).toBe("hi there");
    expect(r.value.company).toBeNull();
    expect(r.value.budgetKes).toBeNull();
    expect(r.value.targetEnd).toBeNull();
  });
});

describe("what gets stored and sent", () => {
  it("keeps only items the storefront still offers, in the order picked", () => {
    const lines = [B, C, A].map((id) => ({ id, option: null, qty: 1 }));
    expect(pickLines(lines, items).map((p) => p.item.id)).toEqual([B, A]);
  });

  it("stores a snapshot of the items and joins the planner's brief to the note", () => {
    const r = checkRequest(good);
    if (!r.ok) throw new Error("expected ok");
    const row = bookingRow("agency-1", r.value, pickLines(r.value.lines, items));
    expect(row).toMatchObject({ agency_id: "agency-1", inventory_item_id: A, status: "new", budget_kes: 2_500_000 });
    expect(row.items).toHaveLength(2);
    expect(row.items[1]).toMatchObject({ title: "Mpasho on TikTok", kind: "owned_account", handle: "@mpashonews" });
    expect(row.message).toBe("Festive campaign\n\nBrief: Mobile money for youth in Nairobi");
  });

  it("emails the media house's own address first, then its admins, then the platform inbox", () => {
    expect(houseRecipients("Sales@RadioAfrica.example", ["a@x.com"], "inbox@pulse.example")).toEqual(["sales@radioafrica.example"]);
    expect(houseRecipients(null, ["A@x.com", "a@x.com", "bad"], "inbox@pulse.example")).toEqual(["a@x.com"]);
    expect(houseRecipients("", [], "Inbox@Pulse.example")).toEqual(["inbox@pulse.example"]);
  });

  it("writes the budget, dates and item kinds the way the emails show them", () => {
    const r = checkRequest(good);
    if (!r.ok) throw new Error("expected ok");
    const d = emailData("Radio Africa Group", r.value, pickLines(r.value.lines, items), "https://darajapulse.com/app/inventory?tab=requests");
    expect(d.budget).toBe("KES 2,500,000");
    expect(d.dates).toBe("1 Dec 2026 to 31 Dec 2026");
    expect(d.items.map((i) => i.kind)).toEqual(["On air", "Channel"]);
    expect(d.estimate).toBeNull();
  });
});

describe("picks with a choice and a number", () => {
  const S = "44444444-4444-4444-8444-444444444444";
  const priced: StorefrontItem[] = [
    {
      id: S, kind: "ad_slot", title: "Kiss 100: Spot adverts", platform: "radio", handle: null, deliverable_type: "30-second spot",
      price_kes: 14000, price_unit: "spot", options: [{ label: "6–9 AM", price_kes: 35000 }, { label: "Run of station", price_kes: 14000 }],
    },
    { id: B, kind: "owned_account", title: "Mpasho on TikTok", platform: "tiktok", handle: "@mpashonews", deliverable_type: "Branded TikTok video" },
  ];

  it("reads each line's choice and number, tidied, and falls back to the plain item list", () => {
    const r = checkRequest({
      ...good, item_ids: [S, B],
      lines: [
        { id: S, option: " 6–9 AM ", qty: 10 }, { id: S, option: "6–9 AM", qty: 2 }, { id: B, qty: 0 },
        { id: "not-a-uuid", qty: 3 }, { id: S, option: "Run of station", qty: 5000 }, "junk",
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lines).toEqual([
      { id: S, option: "6–9 AM", qty: 10 }, { id: B, option: null, qty: 1 }, { id: S, option: "Run of station", qty: 999 },
    ]);
    expect(r.value.itemIds).toEqual([S, B]);
    const plain = checkRequest(good);
    if (!plain.ok) throw new Error("expected ok");
    expect(plain.value.lines).toEqual([{ id: A, option: null, qty: 1 }, { id: B, option: null, qty: 1 }]);
    const many = Array.from({ length: LIMITS.items + 1 }, (_, n) => ({ id: S, option: `choice ${n}`, qty: 1 }));
    expect(checkRequest({ ...good, lines: many })).toMatchObject({ ok: false, error: `Pick at most ${LIMITS.items} items.` });
  });

  it("keeps lines whose listing and choice are still offered, with the price shown for each", () => {
    const picked = pickLines([
      { id: S, option: "6–9 AM", qty: 10 }, { id: S, option: "Gone", qty: 1 }, { id: B, option: null, qty: 2 }, { id: C, option: null, qty: 1 },
    ], priced);
    expect(picked.map((p) => [p.item.id, p.option, p.qty, p.unitPrice, p.unit])).toEqual([
      [S, "6–9 AM", 10, 35000, "spot"], [B, null, 2, null, null],
    ]);
  });

  it("stores the choice, number and price, and the emails say them with a rate-card total", () => {
    const r = checkRequest({ ...good, lines: [{ id: S, option: "6–9 AM", qty: 10 }, { id: B, qty: 2 }] });
    if (!r.ok) throw new Error("expected ok");
    const picked = pickLines(r.value.lines, priced);
    const row = bookingRow("agency-1", r.value, picked);
    expect(row.inventory_item_id).toBe(S);
    expect(row.items[0]).toMatchObject({ title: "Kiss 100: Spot adverts", option: "6–9 AM", qty: 10, unit: "spot", price_kes: 35000 });
    expect(row.items[1]).toMatchObject({ title: "Mpasho on TikTok", option: null, qty: 2, unit: null, price_kes: null });
    const d = emailData("Radio Africa Group", r.value, picked, "https://darajapulse.com/app/inventory?tab=requests");
    expect(d.items.map((i) => i.deliverable)).toEqual(["6–9 AM · 10 spots", "Branded TikTok video × 2"]);
    expect(d.estimate).toBe("KES 350,000 at rate-card prices, plus 1 item priced on request");
  });
});
