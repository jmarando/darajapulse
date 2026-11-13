import { describe, expect, it } from "vitest";
import {
  bookingRow, checkRequest, emailData, houseRecipients, LIMITS, pickItems, type StorefrontItem,
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
    expect(pickItems([B, C, A], items).map((i) => i.id)).toEqual([B, A]);
  });

  it("stores a snapshot of the items and joins the planner's brief to the note", () => {
    const r = checkRequest(good);
    if (!r.ok) throw new Error("expected ok");
    const row = bookingRow("agency-1", r.value, items);
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
    const d = emailData("Radio Africa Group", r.value, items, "https://darajapulse.com/app/inventory?tab=requests");
    expect(d.budget).toBe("KES 2,500,000");
    expect(d.dates).toBe("1 Dec 2026 to 31 Dec 2026");
    expect(d.items.map((i) => i.kind)).toEqual(["On air", "Channel"]);
  });
});
