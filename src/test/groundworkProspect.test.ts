import { describe, expect, it } from "vitest";
import {
  PROSPECT_STATUSES,
  checkProspectRequest,
  prospectRow,
} from "../../supabase/functions/_shared/groundwork-link";

// Every name and id below is invented.
const GW_ID = "ca000000-0000-4000-8000-000000000004";
const AGENCY = "a0000000-0000-4000-8000-000000000001";
const CAMPAIGN = "d0000000-0000-4000-8000-000000000003";

const good = {
  groundwork_campaign_id: GW_ID,
  prospect: { platform: "X", handle: "@Example_One", name: "Example One", url: "https://x.com/example_one", followers: 48200 },
  invitation: "Hello, we are looking for voices on dairy prices. Would you join the Exampleville campaign?",
  why: ["48,200 followers", "posted about milk prices three times this week"],
  paid_for_by: "Paid for by the Friends of Example Candidate",
};

const ok = (raw: unknown) => {
  const r = checkProspectRequest(raw);
  if (r.ok === false) throw new Error(`expected a good prospect, got: ${r.error}`);
  return r.value;
};
const withProspect = (change: Record<string, unknown>) => ({ ...good, prospect: { ...good.prospect, ...change } });

describe("groundwork-prospect: the request", () => {
  it("takes the prospect Groundwork sends, with the platform and handle in one plain form", () => {
    expect(ok(good)).toEqual({
      groundwork_campaign_id: GW_ID,
      platform: "x",
      handle: "example_one",
      name: "Example One",
      url: "https://x.com/example_one",
      followers: 48200,
      invitation: good.invitation,
      why: good.why,
      paid_for_by: good.paid_for_by,
    });
  });

  it("reads the same account the same way however its handle is written", () => {
    const a = ok(withProspect({ handle: "@Example_One" }));
    const b = ok(withProspect({ handle: "example_one" }));
    const c = ok(withProspect({ handle: "  @@EXAMPLE_ONE " }));
    expect([a.handle, b.handle, c.handle]).toEqual(["example_one", "example_one", "example_one"]);
  });

  it("keeps a platform Pulse has no enum for as plain text", () => {
    expect(ok(withProspect({ platform: "Threads" })).platform).toBe("threads");
  });

  it("lets the name, link, followers, invitation and reasons be left out", () => {
    const v = ok({
      groundwork_campaign_id: GW_ID,
      prospect: { platform: "tiktok", handle: "example_two" },
      paid_for_by: good.paid_for_by,
    });
    expect(v).toMatchObject({ name: "", url: null, followers: null, invitation: "", why: [] });
  });

  it("drops a link that is not https instead of refusing the prospect", () => {
    expect(ok(withProspect({ url: "http://x.com/example_one" })).url).toBeNull();
    expect(ok(withProspect({ url: "javascript:alert(1)" })).url).toBeNull();
  });

  it.each([
    ["no prospect", { prospect: undefined }, /prospect/],
    ["a Groundwork campaign id that is not a uuid", { groundwork_campaign_id: "4" }, /groundwork_campaign_id/],
    ["no paid-for-by line", { paid_for_by: "" }, /paid_for_by/],
    ["an invitation over 4000 characters", { invitation: "x".repeat(4001) }, /invitation/],
    ["thirteen reasons", { why: Array.from({ length: 13 }, (_, i) => `reason ${i}`) }, /why/],
    ["a reason over 300 characters", { why: ["x".repeat(301)] }, /why/],
  ])("refuses %s", (_what, change, field) => {
    const r = checkProspectRequest({ ...good, ...change });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(field);
  });

  it.each([
    ["no platform", { platform: " " }, /platform/],
    ["a platform over 20 characters", { platform: "x".repeat(21) }, /platform/],
    ["no handle", { handle: "" }, /handle/],
    ["a handle that is only an @", { handle: "@" }, /handle/],
    ["a handle with a space in it", { handle: "example one" }, /handle/],
    ["a handle over 100 characters", { handle: "h".repeat(101) }, /handle/],
    ["a name over 120 characters", { name: "n".repeat(121) }, /name/],
    ["followers below zero", { followers: -1 }, /followers/],
    ["followers with a fraction", { followers: 10.5 }, /followers/],
    ["followers as text", { followers: "48,200" }, /followers/],
  ])("refuses %s", (_what, change, field) => {
    const r = checkProspectRequest(withProspect(change));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(field);
  });

  it("refuses a body that is not an object", () => {
    for (const raw of [null, undefined, "x", 3, []]) expect(checkProspectRequest(raw).ok).toBe(false);
  });
});

describe("groundwork-prospect: what Pulse keeps", () => {
  it("uses exactly the status words Groundwork keeps", () => {
    expect([...PROSPECT_STATUSES]).toEqual(["approached", "invited", "on_roster", "declined"]);
  });

  it("files a voice in the named agency and campaign, with its details", () => {
    expect(prospectRow(ok(good), { agencyId: AGENCY, campaignId: CAMPAIGN })).toEqual({
      agency_id: AGENCY,
      campaign_id: CAMPAIGN,
      platform: "x",
      handle: "example_one",
      name: "Example One",
      url: "https://x.com/example_one",
      followers: 48200,
      invitation: good.invitation,
      why: good.why,
      paid_for_by: good.paid_for_by,
    });
  });

  it("leaves the status out, so a repeat send updates the details and cannot move a status already filed", () => {
    expect(prospectRow(ok(good), { agencyId: AGENCY, campaignId: CAMPAIGN })).not.toHaveProperty("status");
  });

  it("files what was left out as nothing", () => {
    const bare = ok({ groundwork_campaign_id: GW_ID, prospect: { platform: "tiktok", handle: "example_two" }, paid_for_by: good.paid_for_by });
    expect(prospectRow(bare, { agencyId: AGENCY, campaignId: CAMPAIGN })).toMatchObject({
      name: null,
      url: null,
      followers: null,
      invitation: null,
      why: [],
    });
  });
});
