import { describe, expect, it } from "vitest";
import { deckOutline } from "@/lib/organicDeck";
import { buildOrganicReport, type ReportDoc } from "../../supabase/functions/_shared/organic-report";

const now = Date.parse("2026-11-04T09:00:00Z");
const snap = (m: object) => ({ views: null, likes: null, comments: null, shares: null, saves: null, reach: null, views_paid: null, source: "meta", captured_at: "2026-10-31T02:00:00Z", counted_late: false, ...m });
const channel = (id: string, platform: string, handle: string, source: "public" | "connected") => ({ id, platform, handle, display_name: `Acme ${platform}`, avatar_url: null, source, status: "ok", last_good_pull_at: "2026-11-03T02:00:00Z", audience: null });
const doc = (over: Partial<ReportDoc> = {}): ReportDoc => ({
  client: { name: "Acme", logo_url: null }, from: "2026-10-01", to: "2026-10-31", previous_from: "2026-08-31", previous_to: "2026-09-30",
  channels: [channel("fb", "facebook", "acme", "connected"), channel("tt", "tiktok", "acme.ke", "public")],
  days: [{ channel_id: "fb", day: "2026-10-31", followers: 1100, source: "meta" }],
  posts: [
    { id: "p1", channel_id: "fb", period: "current", url: "https://example.test/p1", posted_at: "2026-10-13T21:30:00Z", format: "video", caption: "First", thumbnail_url: null, snapshot: snap({ views: 1000, likes: 50, comments: 30, shares: 20 }) },
    { id: "p2", channel_id: "tt", period: "current", url: "https://example.test/p2", posted_at: "2026-10-14T21:30:00Z", format: "photo", caption: "Second", thumbnail_url: null, snapshot: snap({ likes: 3 }) },
  ],
  ...over,
});
const ctx = { brandName: "Acme", rangeLabel: "1–31 Oct 2026", generatedOn: "4 November 2026" };
const outline = (d: ReportDoc) => deckOutline(buildOrganicReport(d, now), ctx);

describe("deckOutline", () => {
  it("runs cover, headline numbers, one slide per account, top posts, what worked", () => {
    expect(outline(doc()).map((s) => s.kind)).toEqual(["cover", "headline", "account", "account", "top_posts", "what_worked"]);
  });

  it("names the brand and the period on the cover", () => {
    expect(outline(doc())[0]).toMatchObject({ title: "Acme", subtitle: "Organic report · 1–31 Oct 2026", footer: "Made 4 November 2026" });
  });

  it("shows the same headline numbers as the page, a dash for what's unknown, never 0", () => {
    const headline = outline(doc())[1];
    if (headline.kind !== "headline") throw new Error("expected the headline slide");
    expect(headline.tiles).toEqual([
      { label: "Followers", value: "1.1K" },
      { label: "Posts", value: "2" },
      { label: "Views", value: "1K" },
      { label: "Interactions", value: "103" },
      { label: "Engagement rate", value: "10.0%" },
    ]);
    const empty = outline(doc({ channels: [], days: [], posts: [] }))[1];
    if (empty.kind !== "headline") throw new Error("expected the headline slide");
    expect(empty.tiles.map((t) => t.value)).toEqual(["—", "—", "—", "—", "—"]);
  });

  it("carries the sources line and the notes on the headline slide", () => {
    const headline = outline(doc({ channels: [{ ...channel("tt", "tiktok", "acme.ke", "public"), last_good_pull_at: "2026-10-01T00:00:00Z" }], posts: [] }))[1];
    if (headline.kind !== "headline") throw new Error("expected the headline slide");
    expect(headline.sourcesLine).toBe("TikTok from public numbers.");
    expect(headline.notes[0]).toMatch(/last updated/);
  });

  it("says where an account's numbers come from, with dashes for what's unknown", () => {
    const account = outline(doc())[3];
    if (account.kind !== "account") throw new Error("expected an account slide");
    expect(account).toMatchObject({ name: "Acme tiktok", handle: "acme.ke", platform: "TikTok", tag: "Public numbers" });
    expect(account.figures).toContainEqual({ label: "Views", value: "—" });
    expect(account.figures).toContainEqual({ label: "Posts", value: "1" });
    const first = outline(doc())[2];
    expect(first).toMatchObject({ tag: "From Meta" });
  });

  it("drops the top posts slide when nothing has views, and what worked with it", () => {
    expect(outline(doc({ posts: [] })).map((s) => s.kind)).toEqual(["cover", "headline", "account", "account"]);
  });

  it("names the best slot in what worked, in Nairobi time", () => {
    const last = outline(doc()).at(-1);
    expect(last).toMatchObject({ kind: "what_worked", bestSlot: "Wed 12am (Nairobi time)" });
  });
});
