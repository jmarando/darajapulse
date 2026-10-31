import { describe, expect, it } from "vitest";
import {
  FIXED_DONT,
  agencyProblem,
  campaignColumns,
  checkBriefRequest,
  clientColumns,
  fixedDo,
  newCampaignRow,
  slugFor,
  slugify,
} from "../../supabase/functions/_shared/groundwork-link";

// Every name and id below is invented.
const GW_ID = "ca000000-0000-4000-8000-000000000004";
const AGENCY = "a0000000-0000-4000-8000-000000000001";
const CLIENT = "c0000000-0000-4000-8000-000000000002";
const CAMPAIGN = "d0000000-0000-4000-8000-000000000003";

const goodBrief = {
  groundwork_campaign_id: GW_ID,
  client_name: "Example Candidate for Exampleville",
  campaign_name: "Exampleville 2027: dairy and bursaries",
  objective: "Win over first-time voters on dairy prices.",
  brief: "Talk about what the new milk plant means for farmers here.",
  tone: "Warm and plain",
  hashtag: "#Exampleville2027",
  hashtags_extra: ["#Fresha"],
  mandatory_mentions: ["@example_candidate"],
  dos: ["Show the plant"],
  donts: ["Don't name rivals"],
  start_date: "2026-11-02",
  end_date: "2026-11-30",
  budget_kes: 600000,
  paid_for_by: "Paid for by the Friends of Example Candidate",
};

const ok = (raw: unknown) => {
  const r = checkBriefRequest(raw);
  if (r.ok === false) throw new Error(`expected a good brief, got: ${r.error}`);
  return r.value;
};

describe("groundwork-brief: the request", () => {
  it("takes the brief Groundwork sends, whole", () => {
    expect(ok(goodBrief)).toEqual(goodBrief);
  });

  it("trims what it is given", () => {
    const v = ok({ ...goodBrief, campaign_name: "  Exampleville 2027  ", dos: ["  Show the plant  ", "   "] });
    expect(v.campaign_name).toBe("Exampleville 2027");
    expect(v.dos).toEqual(["Show the plant"]);
  });

  it("lets the tone and the hashtag be empty", () => {
    const v = ok({ ...goodBrief, tone: "", hashtag: "", hashtags_extra: [] });
    expect(v.tone).toBe("");
    expect(v.hashtag).toBe("");
  });

  it("lets the lists be left out", () => {
    const { dos, donts, hashtags_extra, mandatory_mentions, ...rest } = goodBrief;
    const v = ok(rest);
    expect([v.dos, v.donts, v.hashtags_extra, v.mandatory_mentions]).toEqual([[], [], [], []]);
  });

  it.each([
    ["no Groundwork campaign id", { groundwork_campaign_id: undefined }, /groundwork_campaign_id/],
    ["a Groundwork campaign id that is not a uuid", { groundwork_campaign_id: "campaign-4" }, /groundwork_campaign_id/],
    ["no client name", { client_name: " " }, /client_name/],
    ["no campaign name", { campaign_name: "" }, /campaign_name/],
    ["no objective", { objective: "" }, /objective/],
    ["no brief", { brief: undefined }, /brief/],
    ["a date that does not exist", { start_date: "2026-13-01" }, /start_date/],
    ["a date in the wrong shape", { end_date: "30/11/2026" }, /end_date/],
    ["an end before the start", { start_date: "2026-12-01", end_date: "2026-11-30" }, /end_date/],
    ["a budget of nothing", { budget_kes: 0 }, /budget_kes/],
    ["a budget with cents", { budget_kes: 600000.5 }, /budget_kes/],
    ["a budget sent as text", { budget_kes: "600000" }, /budget_kes/],
    ["a paid-for-by line that is too short", { paid_for_by: "ab" }, /paid_for_by/],
    ["a hashtag with no # or @", { hashtag: "Exampleville2027" }, /hashtag/],
    ["an extra hashtag with no # or @", { hashtags_extra: ["Fresha"] }, /hashtags_extra/],
  ])("refuses %s", (_what, change, field) => {
    const r = checkBriefRequest({ ...goodBrief, ...change });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(field);
  });

  it.each([
    ["an objective over 600 characters", { objective: "x".repeat(601) }, /objective/],
    ["a brief over 4000 characters", { brief: "x".repeat(4001) }, /brief/],
    ["a tone over 200 characters", { tone: "x".repeat(201) }, /tone/],
    ["a campaign name over 120 characters", { campaign_name: "x".repeat(121) }, /campaign_name/],
    ["ten extra hashtags", { hashtags_extra: Array.from({ length: 10 }, (_, i) => `#t${i}`) }, /hashtags_extra/],
    ["seven mandatory mentions", { mandatory_mentions: Array.from({ length: 7 }, (_, i) => `@m${i}`) }, /mandatory_mentions/],
    ["thirteen dos", { dos: Array.from({ length: 13 }, (_, i) => `do ${i}`) }, /dos/],
    ["thirteen don'ts", { donts: Array.from({ length: 13 }, (_, i) => `dont ${i}`) }, /donts/],
    ["a do over 200 characters", { dos: ["x".repeat(201)] }, /dos/],
  ])("refuses %s", (_what, change, field) => {
    const r = checkBriefRequest({ ...goodBrief, ...change });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(field);
  });

  it("refuses a body that is not an object", () => {
    for (const raw of [null, undefined, "brief", 7, []]) expect(checkBriefRequest(raw).ok).toBe(false);
  });

  it("never repeats what it was sent in the sentence it answers with", () => {
    const r = checkBriefRequest({ ...goodBrief, paid_for_by: "zz" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).not.toContain("zz");
  });
});

describe("groundwork-brief: the two lines a campaign cannot remove", () => {
  it("words them as the link spec has them", () => {
    expect(fixedDo("Paid for by the Friends of Example Candidate")).toBe(
      "Label every post as a paid partnership and carry the line: Paid for by the Friends of Example Candidate.",
    );
    expect(FIXED_DONT).toBe("Never appeal to or target anyone by tribe or community.");
  });

  it("does not double the full stop when the line already ends with one", () => {
    expect(fixedDo("Paid for by Example Friends.")).toBe(
      "Label every post as a paid partnership and carry the line: Paid for by Example Friends.",
    );
  });

  it("puts both ahead of whatever the campaign wrote", () => {
    const c = campaignColumns(ok(goodBrief));
    expect(c.dos).toEqual([fixedDo(goodBrief.paid_for_by), "Show the plant"]);
    expect(c.donts).toEqual([FIXED_DONT, "Don't name rivals"]);
  });

  it("is still there when the campaign sends no dos or don'ts", () => {
    const c = campaignColumns(ok({ ...goodBrief, dos: [], donts: [] }));
    expect(c.dos).toEqual([fixedDo(goodBrief.paid_for_by)]);
    expect(c.donts).toEqual([FIXED_DONT]);
  });

  it("is written once when the campaign sends the same line back", () => {
    const echoed = ok({
      ...goodBrief,
      dos: [fixedDo(goodBrief.paid_for_by), "Show the plant"],
      donts: ["  never appeal to or target anyone by tribe or community.  "],
    });
    const c = campaignColumns(echoed);
    expect(c.dos.filter((d) => d === fixedDo(goodBrief.paid_for_by))).toHaveLength(1);
    expect(c.donts).toEqual([FIXED_DONT]);
  });

  it("follows a changed paid-for-by line instead of keeping the old one", () => {
    const c = campaignColumns(ok({ ...goodBrief, paid_for_by: "Paid for by Example Friends, Exampleville" }));
    expect(c.dos[0]).toContain("Paid for by Example Friends, Exampleville");
    expect(c.dos.join(" ")).not.toContain("Friends of Example Candidate");
  });

  it("never adds the default no-politics line a brand campaign gets", () => {
    const c = campaignColumns(ok({ ...goodBrief, donts: [] }));
    expect(c.donts.join(" ")).not.toMatch(/politic|polaris/i);
  });
});

describe("groundwork-brief: the campaign row", () => {
  it("marks the campaign political, with its paid-for-by line, and keeps draft approval on", () => {
    const c = campaignColumns(ok(goodBrief));
    expect(c).toMatchObject({
      political: true,
      paid_for_by: goodBrief.paid_for_by,
      require_draft_approval: true,
    });
  });

  it("copies the brief into the columns Pulse already has", () => {
    expect(campaignColumns(ok(goodBrief))).toMatchObject({
      name: goodBrief.campaign_name,
      objective: goodBrief.objective,
      brief: goodBrief.brief,
      tone: goodBrief.tone,
      hashtag: goodBrief.hashtag,
      hashtags_extra: goodBrief.hashtags_extra,
      mandatory_mentions: goodBrief.mandatory_mentions,
      start_date: goodBrief.start_date,
      end_date: goodBrief.end_date,
      budget_kes: goodBrief.budget_kes,
    });
  });

  it("stores an empty hashtag or tone as nothing", () => {
    const c = campaignColumns(ok({ ...goodBrief, hashtag: "", tone: "" }));
    expect(c.hashtag).toBeNull();
    expect(c.tone).toBeNull();
  });

  it("starts as a draft in the named agency, and names that agency itself", () => {
    const row = newCampaignRow(ok(goodBrief), { id: CAMPAIGN, agencyId: AGENCY, clientId: CLIENT });
    expect(row).toMatchObject({ id: CAMPAIGN, agency_id: AGENCY, client_id: CLIENT, status: "draft" });
  });

  it("does not touch the status when the brief is sent again", () => {
    expect(campaignColumns(ok(goodBrief))).not.toHaveProperty("status");
    expect(campaignColumns(ok(goodBrief))).not.toHaveProperty("agency_id");
    expect(campaignColumns(ok(goodBrief))).not.toHaveProperty("client_id");
  });
});

describe("groundwork-brief: the client and the slugs", () => {
  it("makes a slug the way the database's slugify does", () => {
    expect(slugify("Exampleville 2027: dairy & bursaries!")).toBe("exampleville-2027-dairy-bursaries");
    expect(slugify("  --Ünï Café--  ")).toBe("n-caf");
  });

  it("keeps the plain slug for a name, and gives a retry the campaign's id so it cannot clash", () => {
    expect(slugFor("Exampleville 2027", GW_ID)).toBe("exampleville-2027");
    expect(slugFor("Exampleville 2027", GW_ID, true)).toBe("exampleville-2027-ca000000");
  });

  it("still has a slug when the name has no letters or digits", () => {
    expect(slugFor("!!!", GW_ID)).toBe("groundwork");
    expect(slugFor("!!!", GW_ID, true)).toBe("groundwork-ca000000");
  });

  it("names the agency on the client row, and the plain slug for its name", () => {
    expect(clientColumns(ok(goodBrief), AGENCY)).toEqual({
      agency_id: AGENCY,
      name: "Example Candidate for Exampleville",
      slug: "example-candidate-for-exampleville",
    });
  });

  it("gives a new campaign its slug, and the retry slug when the plain one is taken", () => {
    const ids = { id: CAMPAIGN, agencyId: AGENCY, clientId: CLIENT };
    expect(newCampaignRow(ok(goodBrief), ids).slug).toBe("exampleville-2027-dairy-and-bursaries");
    expect(newCampaignRow(ok(goodBrief), ids, true).slug).toBe("exampleville-2027-dairy-and-bursaries-ca000000");
  });

  it("can write the client row again with the retry slug", () => {
    expect(clientColumns(ok(goodBrief), AGENCY, true).slug).toBe("example-candidate-for-exampleville-ca000000");
  });
});

describe("the agency the link works in", () => {
  const active = { is_active: true, is_suspended: false };

  it("is fine when the slug names an active agency", () => {
    expect(agencyProblem("example-agency", active)).toBeNull();
  });

  it.each([undefined, null, "", "   "])("says the secret is not set when the slug is %j", (slug) => {
    expect(agencyProblem(slug, active)).toMatch(/GROUNDWORK_AGENCY_SLUG is not set/);
  });

  it("says so when no agency has the slug, and never falls back to another", () => {
    expect(agencyProblem("example-agency", null)).toMatch(/no agency/i);
  });

  it("refuses an agency that is switched off or suspended", () => {
    expect(agencyProblem("example-agency", { is_active: false, is_suspended: false })).toMatch(/not active/);
    expect(agencyProblem("example-agency", { is_active: true, is_suspended: true })).toMatch(/suspended/);
  });
});
