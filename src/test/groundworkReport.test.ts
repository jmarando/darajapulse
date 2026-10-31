import { describe, expect, it } from "vitest";
import { checkReportRequest, shapeReport } from "../../supabase/functions/_shared/groundwork-link";

// Every name and id below is invented.
const GW_ID = "ca000000-0000-4000-8000-000000000004";

// Groundwork reads Pulse's answer with a reader that drops what it cannot trust. These are its rules,
// so the tests can check that nothing Pulse sends gets dropped: creators need an id and a name; posts
// an id and a creator; payouts an id, a creator and a gross above zero; a link must be https; a count
// that is not a JSON number is read as missing.
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
function groundworkReads(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!str(r["pulse_campaign_id"])) return null;
  return {
    creators: rows(r["creators"]).filter((c) => str(c["id"]) && str(c["name"])),
    posts: rows(r["posts"])
      .filter((p) => str(p["id"]) && str(p["creator_id"]))
      .map((p) => ({
        id: p["id"],
        url: typeof p["url"] === "string" && /^https:\/\//i.test(p["url"]) ? p["url"] : null,
        views: num(p["views"]),
        likes: num(p["likes"]),
        comments: num(p["comments"]),
        shares: num(p["shares"]),
        reach: num(p["reach"]),
      })),
    payouts: rows(r["payouts"])
      .filter((p) => str(p["id"]) && str(p["creator_id"]) && (num(p["gross_kes"]) ?? 0) > 0)
      .map((p) => ({ id: p["id"], gross_kes: num(p["gross_kes"]), wht_kes: num(p["wht_kes"]), net_kes: num(p["net_kes"]) })),
  };
}

// The rows as the database hands them back: numeric columns come as text, an embedded creator as an object.
const roster = [
  {
    fee_kes: "40000.00",
    status: "confirmed",
    influencers: { id: "i1", full_name: "Amina Example", handle: "amina_example", primary_platform: "tiktok", follower_count: 120000 },
  },
  {
    fee_kes: null,
    status: "invited",
    influencers: { id: "i2", full_name: "Brian Sample", handle: null, primary_platform: null, follower_count: null },
  },
];
const posts = [
  { id: "p1", influencer_id: "i1", platform: "tiktok", post_url: "https://www.tiktok.com/@amina_example/video/1", posted_at: "2026-11-05T09:00:00+00:00", status: "live" },
  { id: "p2", influencer_id: "i1", platform: "instagram", post_url: null, posted_at: null, status: "drafted" },
  { id: "p3", influencer_id: "i2", platform: "youtube", post_url: "https://youtu.be/abc", posted_at: "2026-11-06T10:00:00+00:00", status: "live" },
];
const peaks = [
  { post_id: "p1", captured_at: "2026-11-06T09:00:00+00:00", views: "51000", likes: 4200, comments: 310, shares: 190, saves: 5, reach: 0, impressions: 60000 },
  { post_id: "p2", captured_at: null, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 },
  { post_id: "p3", captured_at: "2026-11-07T10:00:00+00:00", views: 900, likes: 80, comments: 4, shares: 1, saves: 0, reach: 12000, impressions: 0 },
];
const payouts = [
  { id: "pay1", influencer_id: "i1", gross_kes: "40000.00", wht_kes: "2000.00", net_kes: "38000.00", status: "paid", paid_at: "2026-11-10T08:00:00+00:00", mpesa_ref: "QX12AB34CD" },
  { id: "pay2", influencer_id: "i2", gross_kes: 25000, wht_kes: null, net_kes: 25000, status: "pending", paid_at: null, mpesa_ref: null },
];
const prospects = [{ id: "pr1", status: "approached" }];

const report = (over: Record<string, unknown> = {}) =>
  shapeReport({ campaign: { id: "c1", status: "live" }, roster, posts, peaks, payouts, prospects, ...over } as never);

describe("groundwork-report: the request", () => {
  it("takes the Groundwork campaign's id", () => {
    expect(checkReportRequest({ groundwork_campaign_id: GW_ID })).toEqual({ ok: true, value: GW_ID });
  });

  it.each([
    ["no id", {}],
    ["an id that is not a uuid", { groundwork_campaign_id: "4" }],
    ["an id that is not text", { groundwork_campaign_id: 4 }],
    ["a body that is not an object", null],
  ])("refuses %s", (_what, raw) => {
    const r = checkReportRequest(raw);
    expect(r.ok).toBe(false);
  });
});

describe("groundwork-report: the answer", () => {
  it("names the Pulse campaign and where it stands", () => {
    expect(report()).toMatchObject({ pulse_campaign_id: "c1", status: "live" });
  });

  it("lists the creators on the roster with their fee and status", () => {
    expect(report().creators).toEqual([
      { id: "i1", name: "Amina Example", handle: "amina_example", platform: "tiktok", followers: 120000, fee_kes: 40000, status: "confirmed" },
      { id: "i2", name: "Brian Sample", handle: null, platform: null, followers: null, fee_kes: null, status: "invited" },
    ]);
  });

  it("skips a roster row whose creator is gone", () => {
    expect(report({ roster: [...roster, { fee_kes: 1, status: "invited", influencers: null }] }).creators).toHaveLength(2);
  });

  it("reads a creator the database embedded as a one-item list", () => {
    const r = report({ roster: [{ fee_kes: 1, status: "invited", influencers: [roster[0]!.influencers] }] });
    expect(r.creators.map((c) => c.id)).toEqual(["i1"]);
  });

  it("gives each post its peak numbers, as numbers", () => {
    expect(report().posts[0]).toEqual({
      id: "p1",
      creator_id: "i1",
      platform: "tiktok",
      url: "https://www.tiktok.com/@amina_example/video/1",
      posted_at: "2026-11-05T09:00:00+00:00",
      status: "live",
      views: 51000,
      likes: 4200,
      comments: 310,
      shares: 190,
      reach: null,
    });
  });

  it("gives the reach when the platform reports one", () => {
    expect(report().posts[2]!.reach).toBe(12000);
  });

  it("leaves a post with no snapshot missing, not at zero", () => {
    expect(report().posts[1]).toMatchObject({ url: null, views: null, likes: null, comments: null, shares: null, reach: null });
  });

  it("leaves a post missing when no peak row came back for it", () => {
    expect(report({ peaks: [] }).posts[0]).toMatchObject({ views: null, likes: null, reach: null });
  });

  it("gives each payout with its own id, as numbers, and the M-Pesa reference", () => {
    expect(report().payouts).toEqual([
      { id: "pay1", creator_id: "i1", gross_kes: 40000, wht_kes: 2000, net_kes: 38000, status: "paid", paid_at: "2026-11-10T08:00:00+00:00", mpesa_ref: "QX12AB34CD" },
      { id: "pay2", creator_id: "i2", gross_kes: 25000, wht_kes: null, net_kes: 25000, status: "pending", paid_at: null, mpesa_ref: null },
    ]);
  });

  it("gives the prospects as an id and a status, nothing more", () => {
    expect(report().prospects).toEqual([{ prospect_id: "pr1", status: "approached" }]);
  });

  it("is still a report when the campaign has nothing yet", () => {
    expect(report({ roster: [], posts: [], peaks: [], payouts: [], prospects: [] })).toEqual({
      pulse_campaign_id: "c1",
      status: "live",
      creators: [],
      posts: [],
      payouts: [],
      prospects: [],
    });
  });

  it("sends no number as text", () => {
    const r = report();
    for (const c of r.creators) for (const v of [c.followers, c.fee_kes]) expect(["number", "object"]).toContain(typeof v);
    for (const p of r.posts) for (const v of [p.views, p.likes, p.comments, p.shares, p.reach]) expect(["number", "object"]).toContain(typeof v);
    for (const p of r.payouts) for (const v of [p.gross_kes, p.wht_kes, p.net_kes]) expect(["number", "object"]).toContain(typeof v);
  });

  it("is read by Groundwork without dropping a creator, a post or a payout", () => {
    const read = groundworkReads(JSON.parse(JSON.stringify(report())));
    expect(read).not.toBeNull();
    expect(read!.creators).toHaveLength(2);
    expect(read!.posts).toHaveLength(3);
    expect(read!.payouts.map((p) => p.id)).toEqual(["pay1", "pay2"]);
    expect(read!.posts.map((p) => p.views)).toEqual([51000, null, 900]);
    expect(read!.posts.map((p) => p.url)).toEqual(["https://www.tiktok.com/@amina_example/video/1", null, "https://youtu.be/abc"]);
    expect(read!.payouts[0]).toMatchObject({ gross_kes: 40000, wht_kes: 2000, net_kes: 38000 });
  });
});
