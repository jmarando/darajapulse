import { describe, expect, it } from "vitest";
import {
  candidateFromInventory,
  candidateFromListed,
  candidateFromProfiles,
  candidateFromRow,
  defaultBreakdown,
  groupProfiles,
  planRosterWrite,
  resolveCandidate,
} from "@/lib/creatorCandidates";

const profile = (over: Record<string, unknown> = {}) => ({
  id: "p1", full_name: "Jane Cooks", handle: "janecooks", platform: "tiktok", follower_count: 12000, engagement_rate: 3.5,
  niche: ["food"], city: "Nairobi", region: "Kenya", country_code: "KE", avatar_url: "https://img/a.jpg", ...over,
});
const contact = (over: Record<string, unknown> = {}) => ({ creator_id: "p1", kind: "email", value: " Jane@Example.com ", is_public: true, ...over });

describe("candidateFromProfiles: what Discovery knows about a person", () => {
  it("keeps every platform, biggest first, instead of only the biggest", () => {
    const c = candidateFromProfiles([
      profile({ id: "p2", platform: "instagram", handle: "jane.ig", follower_count: 800 }),
      profile(),
      profile({ id: "p3", platform: "twitter", handle: "jane_x", follower_count: 50 }),
    ], []);
    expect(c.accounts.map((a) => [a.platform, a.handle, a.followers, a.on])).toEqual([
      ["tiktok", "janecooks", 12000, true],
      ["instagram", "jane.ig", 800, true],
      ["twitter", "jane_x", 50, true],
    ]);
  });

  it("carries the contact details the old + button dropped", () => {
    const c = candidateFromProfiles([profile()], [contact(), contact({ kind: "whatsapp", value: "254700000000" })]);
    expect(c).toMatchObject({ email: "jane@example.com", phone: "254700000000", avatar_url: "https://img/a.jpg", city: "Nairobi", country_code: "KE", niche: "food" });
  });

  it("falls back to a manager's email and a plain phone", () => {
    const c = candidateFromProfiles([profile()], [contact({ kind: "manager_email", value: "boss@example.com" }), contact({ kind: "phone", value: "254711111111" })]);
    expect(c).toMatchObject({ email: "boss@example.com", phone: "254711111111" });
  });

  it("leaves a second account on one platform unticked, because names can group the wrong person", () => {
    const c = candidateFromProfiles([profile(), profile({ id: "p2", handle: "jane_two", follower_count: 90 })], []);
    expect(c.accounts.map((a) => [a.handle, a.on])).toEqual([["janecooks", true], ["jane_two", false]]);
  });

  it("makes the biggest account on a tracked platform the main one", () => {
    const c = candidateFromProfiles([profile({ platform: "linkedin", handle: "jane-li", follower_count: 99999 }), profile()], []);
    expect(planRosterWrite(c, null)?.values).toMatchObject({ handle: "janecooks", primary_platform: "tiktok", alt_handles: ["linkedin:jane-li"] });
  });

  it("doesn't treat a WhatsApp row as an account: its number is a contact", () => {
    const c = candidateFromProfiles([profile(), profile({ id: "w", platform: "whatsapp", handle: "254700000000", follower_count: 0 })], [contact({ creator_id: "w", kind: "whatsapp", value: "254700000000" })]);
    expect(c.accounts.map((a) => a.platform)).toEqual(["tiktok"]);
    expect(c.phone).toBe("254700000000");
  });

  it("merges niches across the person's profiles", () => {
    const c = candidateFromProfiles([profile(), profile({ id: "p2", platform: "instagram", handle: "jane.ig", niche: ["food", "travel"] })], []);
    expect(c.niche).toBe("food, travel");
  });
});

describe("groupProfiles", () => {
  it("groups by name and keeps nameless rows apart", () => {
    const groups = groupProfiles([
      profile(),
      profile({ id: "p2", full_name: "JANE cooks!", platform: "instagram", handle: "jane.ig" }),
      profile({ id: "p3", full_name: "Brian" }),
      profile({ id: "p4", full_name: "🌸" }),
      profile({ id: "p5", full_name: "🌺" }),
    ]);
    expect(groups.map((g) => g.map((p) => p.id))).toEqual([["p1", "p2"], ["p3"], ["p4"], ["p5"]]);
  });
});

describe("resolveCandidate: is this person already on the roster?", () => {
  const rows = [{ id: "a", full_name: "Jane Cooks", handle: "janecooks", primary_platform: "tiktok", alt_handles: [], agency_id: "ag1" }];

  it("finds them by any account", () => {
    const r = resolveCandidate(candidateFromProfiles([profile({ full_name: "Different Name" })], []), rows);
    expect(r.existing?.id).toBe("a");
    expect(r.certain).toBe(true);
  });

  it("assumes a two-word name match is the same person, but leaves it to be changed", () => {
    const r = resolveCandidate(candidateFromProfiles([profile({ platform: "instagram", handle: "other" })], []), rows);
    expect(r.existing?.id).toBe("a");
    expect(r.certain).toBe(false);
  });

  it("doesn't assume a one-word name is the same person", () => {
    const one = [{ ...rows[0], id: "b", full_name: "Mercy", handle: "mercy1" }];
    const r = resolveCandidate(candidateFromProfiles([profile({ full_name: "Mercy", handle: "mercy2" })], []), one);
    expect(r.existing).toBeNull();
    expect(r.nameMatch?.id).toBe("b");
  });

  it("finds nothing for someone new", () => {
    expect(resolveCandidate(candidateFromProfiles([profile({ full_name: "New Person", handle: "new" })], []), rows).existing).toBeNull();
  });
});

describe("planRosterWrite: what actually gets saved", () => {
  it("inserts someone new with all their ticked accounts and contact details", () => {
    const c = candidateFromProfiles([profile(), profile({ id: "p2", platform: "instagram", handle: "jane.ig", follower_count: 800 })], [contact()]);
    const plan = planRosterWrite(c, null);
    expect(plan?.id).toBeNull();
    expect(plan?.values).toMatchObject({
      full_name: "Jane Cooks", handle: "janecooks", primary_platform: "tiktok", alt_handles: ["instagram:jane.ig"], follower_count: 12000,
      engagement_rate: 3.5, email: "jane@example.com", city: "Nairobi", country_code: "KE", country_source: "imported",
      account_stats: { "instagram:jane.ig": { followers: 800, engagement_rate: 3.5 } }, niche: "food", avatar_url: "https://img/a.jpg",
    });
  });

  it("leaves out an unticked account", () => {
    const c = candidateFromProfiles([profile(), profile({ id: "p2", platform: "instagram", handle: "jane.ig" })], []);
    c.accounts[1].on = false;
    expect(planRosterWrite(c, null)?.values).toMatchObject({ alt_handles: [] });
  });

  it("adds new accounts to someone on the roster, keeping their main account and details", () => {
    const existing = { id: "a", full_name: "Jane C", handle: "janecooks", primary_platform: "tiktok", alt_handles: [], follower_count: 500, engagement_rate: 1, email: "old@example.com", city: null, country_code: null };
    const c = candidateFromProfiles([profile(), profile({ id: "p2", platform: "instagram", handle: "jane.ig", follower_count: 800 })], [contact()]);
    const plan = planRosterWrite(c, existing);
    expect(plan?.id).toBe("a");
    expect(plan?.values).toMatchObject({ handle: "janecooks", alt_handles: ["instagram:jane.ig"], follower_count: 500, engagement_rate: 1, city: "Nairobi", country_code: "KE", country_source: "imported" });
    expect(plan?.values).not.toHaveProperty("email");
    expect(plan?.values).not.toHaveProperty("full_name");
  });

  it("fills in an email the roster row didn't have", () => {
    const existing = { id: "a", full_name: "Jane", handle: "janecooks", primary_platform: "tiktok", alt_handles: [], email: null };
    expect(planRosterWrite(candidateFromProfiles([profile()], [contact()]), existing)?.values).toMatchObject({ email: "jane@example.com" });
  });

  it("writes nothing when the roster row already has it all", () => {
    const existing = { id: "a", full_name: "Jane", handle: "janecooks", primary_platform: "tiktok", alt_handles: [], follower_count: 12000, email: "x@example.com", phone_mpesa: "1", avatar_url: "a", city: "c", country_code: "KE", niche: "food" };
    expect(planRosterWrite(candidateFromRow(existing), existing)).toBeNull();
  });
});

describe("other ways in", () => {
  it("candidateFromRow carries a roster row as it is", () => {
    const row = { id: "a", full_name: "Jane", handle: "janecooks", primary_platform: "tiktok", alt_handles: ["instagram:jane.ig"], email: "x@example.com", phone_mpesa: "1" };
    const c = candidateFromRow(row);
    expect(c).toMatchObject({ key: "row:a", full_name: "Jane", email: "x@example.com", phone: "1", existing: row, certain: true });
    expect(c.accounts.map((a) => a.handle)).toEqual(["janecooks", "jane.ig"]);
  });

  it("candidateFromInventory keeps a storefront item's rate as the fee", () => {
    const c = candidateFromInventory({ id: "i1", title: "Jane TV", handle: "@janetv", platform: "youtube", follower_count: 100, base_rate_kes: 5000, cover_url: "u", tags: ["tv"], kind: "influencer", subtitle: "Host" });
    expect(c).toMatchObject({ key: "inv:i1", full_name: "Jane TV", fee: 5000, avatar_url: "u", niche: "tv", notes: "Imported from storefront inventory · influencer · Host" });
    expect(c.accounts[0]).toMatchObject({ platform: "youtube", handle: "janetv", followers: 100, on: true });
  });

  it("candidateFromInventory gives a TV slot no account, rather than an invented YouTube one", () => {
    const c = candidateFromInventory({ id: "i2", title: "Morning Show", handle: null, platform: "tv", kind: "ad_slot" });
    expect(c.accounts).toEqual([]);
  });

  it("candidateFromListed uses the handle as a name when no name was given", () => {
    const c = candidateFromListed({ name: null, email: null, phone: null, problem: null, line: "x", accounts: [{ platform: "tiktok", handle: "janecooks", readable: true, followers: null }] }, null);
    expect(c.full_name).toBe("janecooks");
  });

  it("candidateFromListed adds what Discovery knows to what the list says", () => {
    const known = candidateFromProfiles([profile({ platform: "instagram", handle: "jane.ig" })], [contact()]);
    const c = candidateFromListed({ name: "J", email: null, phone: "254700000000", problem: null, line: "x", accounts: [{ platform: "tiktok", handle: "janecooks", readable: true, followers: null }] }, known);
    expect(c.full_name).toBe("J");
    expect(c.accounts.map((a) => a.platform)).toEqual(["tiktok", "instagram"]);
    expect(c).toMatchObject({ email: "jane@example.com", phone: "254700000000", city: "Nairobi" });
  });
});

describe("defaultBreakdown", () => {
  it("asks for a video on the platforms these creators are on", () => {
    const a = candidateFromProfiles([profile()], []);
    const b = candidateFromProfiles([profile({ platform: "instagram", handle: "b" }), profile({ platform: "linkedin", handle: "c" })], []);
    expect(defaultBreakdown([a, b])).toEqual({ items: [{ type: "video", count: 1, platforms: ["tiktok", "instagram"] }] });
  });

  it("falls back to the usual platforms when they have none", () => {
    expect(defaultBreakdown([])).toEqual({ items: [{ type: "video", count: 1, platforms: ["tiktok", "instagram", "facebook"] }] });
  });
});
