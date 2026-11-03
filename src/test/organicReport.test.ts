import { describe, expect, it } from "vitest";
import { buildOrganicReport, lastFullMonth, monthlyEmailData, type ReportChannel, type ReportDoc, type ReportPost } from "../../supabase/functions/_shared/organic-report";

const now = Date.parse("2026-11-04T09:00:00Z");

const channel = (over: Partial<ReportChannel>): ReportChannel => ({
  id: "fb", platform: "facebook", handle: "acme", display_name: "Acme", avatar_url: null, source: "connected", status: "ok",
  last_good_pull_at: "2026-11-03T02:00:00Z", audience: null, ...over,
});

const post = (id: string, channel_id: string, format: ReportPost["format"], m: Partial<ReportPost["snapshot"]>, over: Partial<ReportPost> = {}): ReportPost => ({
  id, channel_id, period: "current", url: `https://example.test/${id}`, posted_at: "2026-10-10T08:00:00Z", format, caption: null, thumbnail_url: null,
  snapshot: {
    views: null, likes: null, comments: null, shares: null, saves: null, reach: null, views_paid: null,
    source: channel_id === "fb" ? "meta" : "scrapecreators", captured_at: "2026-10-31T02:00:00Z", counted_late: false, ...m,
  },
  ...over,
});

const fb = channel({});
const tt = channel({ id: "tt", platform: "tiktok", handle: "acme.ke", display_name: "Acme KE", source: "public", last_good_pull_at: "2026-11-01T02:00:00Z" });

const doc = (over: Partial<ReportDoc> = {}): ReportDoc => ({
  client: { name: "Acme", logo_url: null },
  from: "2026-10-01",
  to: "2026-10-31",
  previous_from: "2026-08-31",
  previous_to: "2026-09-30",
  channels: [fb, tt],
  days: [
    { channel_id: "fb", day: "2026-09-30", followers: 1000, source: "meta" },
    { channel_id: "fb", day: "2026-10-31", followers: 1100, source: "meta" },
    { channel_id: "tt", day: "2026-10-20", followers: 500, source: "scrapecreators" },
  ],
  posts: [
    post("p1", "fb", "video", { views: 1000, likes: 50, comments: 30, shares: 20, reach: 800, views_paid: 200 }),
    post("p2", "fb", "photo", { views: 400, likes: 10, comments: 0, shares: 0, reach: 300, views_paid: 0, counted_late: true, captured_at: "2026-11-03T02:00:00Z" }),
    post("p3", "tt", "video", { views: 2000, likes: 100, comments: 10, shares: 40, saves: 50 }, { posted_at: "2026-10-13T21:30:00Z" }),
    post("p4", "tt", "photo", { likes: 40, comments: 10 }),
    post("q1", "tt", "video", { views: 500, likes: 20, comments: 5, shares: 5, saves: 0 }, { period: "previous", posted_at: "2026-09-10T08:00:00Z" }),
  ],
  ...over,
});

describe("buildOrganicReport: the tiles", () => {
  const { tiles } = buildOrganicReport(doc(), now);

  it("adds up followers, and counts a change only where an earlier line exists", () => {
    expect(tiles.followers).toMatchObject({ value: 1600, change: 100 });
  });

  it("counts the period's posts, with the period before apart", () => {
    expect(tiles.posts).toEqual({ value: 4, previous: 1, change: 3 });
  });

  it("adds up views", () => {
    expect(tiles.views).toEqual({ value: 3400, previous: 500, change: 2900 });
  });

  it("counts interactions even from a post with no views", () => {
    expect(tiles.interactions.value).toBe(360);
    expect(tiles.interactions.previous).toBe(30);
  });

  it("leaves a post with no views out of the engagement rate", () => {
    expect(tiles.rate.value).toBeCloseTo(9.12, 2); // 310 ÷ 3400
    expect(tiles.rate.previous).toBeCloseTo(6, 2);
    expect(tiles.rate.change).toBeCloseTo(3.12, 2);
  });

  it("leaves a post with views but no reaction counts out of the rate, as Facebook's reel list gives", () => {
    const report = buildOrganicReport(doc({ channels: [fb], posts: [
      post("a", "fb", "video", { views: 10_000 }),
      post("b", "fb", "video", { views: 100, likes: 10 }),
    ] }), now);
    expect(report.tiles.rate.value).toBeCloseTo(10, 2);
    expect(report.platforms[0].rate).toBeCloseTo(10, 2);
    expect(report.tiles.views.value).toBe(10_100); // its views still count
  });

  it("gives no rate when no post has both views and reactions", () => {
    const report = buildOrganicReport(doc({ channels: [fb], posts: [post("a", "fb", "video", { views: 10_000 })] }), now);
    expect(report.tiles.rate.value).toBeNull();
  });

  it("gives no follower change when no channel has an earlier line", () => {
    const report = buildOrganicReport(doc({ channels: [tt], posts: [] }), now);
    expect(report.tiles.followers).toMatchObject({ value: 500, change: null });
  });

  it("uses the latest line on or before the period's end, ignoring later ones", () => {
    const days = [
      { channel_id: "fb", day: "2026-10-30", followers: 1050, source: "meta" },
      { channel_id: "fb", day: "2026-11-02", followers: 9999, source: "meta" },
    ];
    const report = buildOrganicReport(doc({ channels: [fb], days, posts: [] }), now);
    expect(report.tiles.followers.value).toBe(1050);
  });

  it("uses the last line before the period's start for the change", () => {
    const days = [
      { channel_id: "fb", day: "2026-09-29", followers: 900, source: "meta" },
      { channel_id: "fb", day: "2026-09-30", followers: 950, source: "meta" },
      { channel_id: "fb", day: "2026-10-01", followers: 1000, source: "meta" },
      { channel_id: "fb", day: "2026-10-31", followers: 1200, source: "meta" },
    ];
    expect(buildOrganicReport(doc({ channels: [fb], days, posts: [] }), now).tiles.followers.change).toBe(250);
  });

  it("skips a line with no follower number, rather than reading it as 0", () => {
    const days = [
      { channel_id: "fb", day: "2026-10-30", followers: 1050, source: "meta" },
      { channel_id: "fb", day: "2026-10-31", followers: null, source: "meta" },
    ];
    expect(buildOrganicReport(doc({ channels: [fb], days, posts: [] }), now).tiles.followers.value).toBe(1050);
  });
});

describe("buildOrganicReport: nothing to show", () => {
  it("shows every tile as unknown when the brand has no channels", () => {
    const report = buildOrganicReport(doc({ channels: [], days: [], posts: [] }), now);
    expect(report.isEmpty).toBe(true);
    for (const tile of Object.values(report.tiles)) expect(tile.value).toBeNull();
    expect(report.sourcesLine).toBe("");
    expect(report.notes).toEqual([]);
  });

  it("counts 0 posts as a real number, and leaves views, interactions and rate unknown", () => {
    const report = buildOrganicReport(doc({ posts: [] }), now);
    expect(report.isEmpty).toBe(false);
    expect(report.tiles.posts.value).toBe(0);
    expect(report.tiles.views.value).toBeNull();
    expect(report.tiles.interactions.value).toBeNull();
    expect(report.tiles.rate.value).toBeNull();
    expect(report.picks).toEqual([]);
  });

  it("counts a post with no reading as a post, adding no views", () => {
    const report = buildOrganicReport(doc({ posts: [{ ...post("p9", "fb", "text", {}), snapshot: null }] }), now);
    expect(report.tiles.posts.value).toBe(1);
    expect(report.tiles.views.value).toBeNull();
  });
});

describe("buildOrganicReport: by account", () => {
  const { platforms } = buildOrganicReport(doc(), now);

  it("gives one row per channel, tagged by where the numbers come from", () => {
    const [a, b] = platforms;
    expect(a).toMatchObject({ channel_id: "fb", platform: "facebook", name: "Acme", handle: "acme", followers: 1100, change: 100, posts: 2, views: 1400, tag: "Connected" });
    expect(a.rate).toBeCloseTo(7.86, 2);
    expect(b).toMatchObject({ channel_id: "tt", followers: 500, change: null, posts: 2, views: 2000, rate: 10, tag: "Public" });
  });
});

describe("buildOrganicReport: top posts and what worked", () => {
  const report = buildOrganicReport(doc(), now);

  it("picks the most viewed post of the period, named after its channel", () => {
    const top = report.picks.find((p) => p.kind === "views");
    expect(top?.post).toMatchObject({ id: "p3", post_url: "https://example.test/p3", platform: "tiktok", influencers: { full_name: "Acme KE", handle: "acme.ke" } });
    expect(report.picks.map((p) => p.post.id)).not.toContain("q1");
  });

  it("averages views per format, over posts that have views", () => {
    expect(report.formats.find((f) => f.format === "video")).toEqual({ format: "video", posts: 2, avgViews: 1500 });
    expect(report.formats.find((f) => f.format === "photo")).toEqual({ format: "photo", posts: 2, avgViews: 400 });
    expect(report.formats.map((f) => f.format)).toEqual(["video", "photo"]);
  });

  it("leaves out the engagement pick when no source reported any reactions, rather than showing 0%", () => {
    const { picks } = buildOrganicReport(doc({ channels: [fb], posts: [post("a", "fb", "video", { views: 500 })] }), now);
    expect(picks.map((p) => p.kind)).toEqual(["views"]);
  });

  it("leaves out the saves-and-shares pick when no source reported either, rather than showing 0", () => {
    const { picks } = buildOrganicReport(doc({ channels: [tt], posts: [post("a", "tt", "video", { views: 500, likes: 5 })] }), now);
    expect(picks.map((p) => p.kind)).toEqual(["views", "engagement"]);
  });

  it("gives a format with no views a blank average, and sorts it last", () => {
    const { formats } = buildOrganicReport(doc({ posts: [post("a", "tt", "text", { likes: 1 }), post("b", "tt", "photo", { views: 5 })] }), now);
    expect(formats).toEqual([{ format: "photo", posts: 1, avgViews: 5 }, { format: "text", posts: 1, avgViews: null }]);
  });

  it("finds the best slot in Nairobi time, whatever the viewer's time zone", () => {
    expect(report.cadence.best).toMatchObject({ day: 2, hour: 0 }); // Tuesday 21:30 UTC is Wednesday 00:30 in Nairobi
  });
});

describe("buildOrganicReport: connected extras", () => {
  it("averages reach and splits views paid and organic, from connected channels only", () => {
    expect(buildOrganicReport(doc(), now).connected).toEqual({ any: true, avgReach: 550, organicViews: 1200, paidViews: 200, audience: null });
  });

  it("says nothing is connected when nothing is", () => {
    const report = buildOrganicReport(doc({ channels: [tt], posts: [post("p3", "tt", "video", { views: 10, reach: 9 })] }), now);
    expect(report.connected).toEqual({ any: false, avgReach: null, organicViews: null, paidViews: null, audience: null });
  });

  it("takes the audience from a connected channel that has one", () => {
    const audience = { country: [{ key: "KE", value: 90 }], age: [], gender: [] };
    const report = buildOrganicReport(doc({ channels: [fb, channel({ id: "ig", platform: "instagram", audience })] }), now);
    expect(report.connected.audience).toEqual(audience);
  });

  it("ignores an audience on a channel that was disconnected", () => {
    const audience = { country: [{ key: "KE", value: 90 }], age: [], gender: [] };
    const report = buildOrganicReport(doc({ channels: [{ ...tt, audience }], posts: [] }), now);
    expect(report.connected.audience).toBeNull();
  });
});

describe("buildOrganicReport: the sources line", () => {
  const ig = channel({ id: "ig", platform: "instagram", handle: "acme.ig" });

  it("says where each platform's numbers come from", () => {
    expect(buildOrganicReport(doc(), now).sourcesLine).toBe("Facebook from Meta. TikTok from public numbers.");
    expect(buildOrganicReport(doc({ channels: [fb, ig, tt] }), now).sourcesLine).toBe("Facebook and Instagram from Meta. TikTok from public numbers.");
    expect(buildOrganicReport(doc({ channels: [tt], posts: [] }), now).sourcesLine).toBe("TikTok from public numbers.");
  });

  it("calls a connected channel with a rejected token public, since public numbers are standing in", () => {
    const report = buildOrganicReport(doc({ channels: [{ ...fb, status: "needs_reconnect" }], posts: [] }), now);
    expect(report.sourcesLine).toBe("Facebook from public numbers.");
    expect(report.platforms[0].tag).toBe("Public");
  });
});

describe("buildOrganicReport: notes", () => {
  it("says when views were counted after the period ended", () => {
    expect(buildOrganicReport(doc(), now).notes).toContain("Views for posts before 3 Nov were counted on 3 Nov.");
  });

  it("names a channel more than two days stale, and not one that is fresh", () => {
    const { notes } = buildOrganicReport(doc(), now);
    expect(notes).toContain("TikTok (@acme.ke) was last updated 3 days ago.");
    expect(notes.some((n) => n.includes("@acme)"))).toBe(false);
  });

  it("counts a channel stale from just over two days, not three", () => {
    const { notes } = buildOrganicReport(doc({ channels: [{ ...tt, last_good_pull_at: "2026-11-01T21:00:00Z" }], posts: [] }), now);
    expect(notes).toContain("TikTok (@acme.ke) was last updated 2 days ago.");
  });

  it("names a channel never read", () => {
    const { notes } = buildOrganicReport(doc({ channels: [{ ...tt, last_good_pull_at: null }], posts: [] }), now);
    expect(notes).toContain("TikTok (@acme.ke) hasn't been read yet.");
  });

  it("says a rejected token needs reconnecting", () => {
    const { notes } = buildOrganicReport(doc({ channels: [{ ...fb, status: "needs_reconnect" }], posts: [] }), now);
    expect(notes).toContain("Facebook (@acme) needs reconnecting. Public numbers are showing until then.");
  });

  it("says when public numbers are paused", () => {
    const { notes } = buildOrganicReport(doc({ channels: [{ ...tt, status: "paused" }], posts: [] }), now);
    expect(notes).toContain("Public numbers for TikTok (@acme.ke) are paused.");
  });

  it("leaves out a handle that was never found, from rows, the sources line and notes", () => {
    const missing = { ...tt, status: "error", last_good_pull_at: null };
    const report = buildOrganicReport(doc({ channels: [fb, missing], posts: [] }), now);
    expect(report.platforms.map((p) => p.channel_id)).toEqual(["fb"]);
    expect(report.sourcesLine).toBe("Facebook from Meta.");
    expect(report.notes.some((n) => n.includes("acme.ke"))).toBe(false);
  });
});

describe("lastFullMonth", () => {
  it("is the month before, in Nairobi time", () => {
    expect(lastFullMonth(Date.parse("2026-11-01T05:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-31", label: "October 2026" });
    expect(lastFullMonth(Date.parse("2027-01-01T05:00:00Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31", label: "December 2026" });
    expect(lastFullMonth(Date.parse("2026-03-15T05:00:00Z")).to).toBe("2026-02-28");
  });

  it("turns over at midnight in Nairobi, not UTC", () => {
    expect(lastFullMonth(Date.parse("2026-10-31T21:30:00Z")).to).toBe("2026-10-31"); // 00:30 on 1 Nov in Nairobi
    expect(lastFullMonth(Date.parse("2026-10-31T20:30:00Z")).to).toBe("2026-09-30"); // still 31 Oct in Nairobi
  });
});

describe("monthlyEmailData", () => {
  const ctx = { brandName: "Acme", monthLabel: "October 2026" };
  const data = monthlyEmailData(buildOrganicReport(doc(), now), ctx);

  it("names the month and the headline numbers in the subject", () => {
    expect(data.subject).toBe("Acme in October 2026: 3.4k views on 4 posts");
    expect(data.brand_name).toBe("Acme");
    expect(data.month_label).toBe("October 2026");
  });

  it("leaves views out of the subject when none are known", () => {
    const noViews = monthlyEmailData(buildOrganicReport(doc({ posts: [post("a", "tt", "photo", { likes: 2 })] }), now), ctx);
    expect(noViews.subject).toBe("Acme in October 2026: 1 post");
  });

  it("gives the tiles as words, with a dash for what's unknown and never 0", () => {
    expect(data.tiles).toEqual([
      { label: "Followers", value: "1.6k", change: "+100" },
      { label: "Posts", value: "4", change: "+3" },
      { label: "Views", value: "3.4k", change: "+2.9k" },
      { label: "Interactions", value: "360", change: "+330" },
      { label: "Engagement rate", value: "9.1%", change: "+3.1%" },
    ]);
    const empty = monthlyEmailData(buildOrganicReport(doc({ posts: [], days: [] }), now), ctx);
    expect(empty.tiles.find((t) => t.label === "Views")).toEqual({ label: "Views", value: "—", change: null });
    expect(empty.tiles.find((t) => t.label === "Followers")).toEqual({ label: "Followers", value: "—", change: null });
  });

  it("picks the most viewed post", () => {
    expect(data.top_post).toEqual({ title: "A post", platform: "TikTok", views: "2k", url: "https://example.test/p3" }); // p3 has no caption
  });

  it("gives no top post when nothing has views", () => {
    expect(monthlyEmailData(buildOrganicReport(doc({ posts: [] }), now), ctx).top_post).toBeNull();
  });

  it("carries the notes and the sources line", () => {
    expect(data.notes).toContain("TikTok (@acme.ke) was last updated 3 days ago.");
    expect(data.sources_line).toBe("Facebook from Meta. TikTok from public numbers.");
  });

  it("sends nothing for a brand with no channels, or with nothing read for the month", () => {
    expect(data.skip).toBe(false);
    expect(monthlyEmailData(buildOrganicReport(doc({ channels: [], days: [], posts: [] }), now), ctx).skip).toBe(true);
    expect(monthlyEmailData(buildOrganicReport(doc({ days: [], posts: [] }), now), ctx).skip).toBe(true);
    expect(monthlyEmailData(buildOrganicReport(doc({ posts: [] }), now), ctx).skip).toBe(false); // followers alone are news
  });
});
