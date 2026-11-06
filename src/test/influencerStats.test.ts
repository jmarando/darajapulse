import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SC_CREDIT_FLOOR } from "../../supabase/functions/_shared/brand-sources";
import type { ScCall } from "../../supabase/functions/_shared/brand-pull";
import {
  CREDIT_FLOOR, dailyCredits, goneLockName, lookupPublicStats, lookupTarget, nairobiDayStart, pickPublicLookups, runLookups, stopNote, type RosterRow,
} from "../../supabase/functions/_shared/influencer-stats";

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `fixtures/scrapecreators/${name}.json`), "utf8"));
const answer = (json: unknown, status = 200) => vi.fn<ScCall>(async () => ({ status, json }));

const now = Date.parse("2026-11-04T02:15:00Z");
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();
const row = (id: string, over: Partial<RosterRow> = {}): RosterRow => ({ id, handle: id, primary_platform: "tiktok", last_metrics_sync: null, ...over });
const pick = (rows: RosterRow[], over: Partial<Parameters<typeof pickPublicLookups>[1]> = {}) =>
  pickPublicLookups(rows, { now, waiting: new Set(), live: new Set(), explicit: false, limit: 100, ...over }).map((r) => r.id);

describe("lookupTarget: what the roster's handle column can be looked up as", () => {
  it.each([
    ["tiktok", "acmekenya", "tiktok", "acmekenya"],
    ["tiktok", "@AcmeKenya", "tiktok", "acmekenya"],
    ["tiktok", " _.acme", "tiktok", "_.acme"],
    ["TikTok", "acmekenya", "tiktok", "acmekenya"],
    ["tiktok", "https://www.tiktok.com/@acmekenya?_r=1&_t=abc", "tiktok", "acmekenya"],
    ["instagram", "https://www.instagram.com/AcmeKenya/", "instagram", "acmekenya"],
    ["facebook", "https://web.facebook.com/acmekenya", "facebook", "acmekenya"],
    ["facebook", "https://www.facebook.com/profile.php?id=12345&sk=reels_tab", "facebook", "12345"],
  ])("%s %s", (primary_platform, handle, platform, expected) => {
    expect(lookupTarget({ primary_platform, handle })).toEqual({ platform, handle: expected });
  });

  it.each([
    ["a display name", "tiktok", "Jane Doe"],
    ["a name with an emoji", "tiktok", "Jane🌸"],
    ["nothing", "tiktok", ""],
    ["no handle at all", "instagram", null],
    ["a link to another platform", "tiktok", "https://www.instagram.com/acmekenya/"],
    ["a link to a post", "tiktok", "https://www.tiktok.com/@acmekenya/video/123"],
    ["a platform with no route here", "youtube", "acmekenya"],
    ["no platform", null, "acmekenya"],
  ])("%s can't be looked up", (_what, primary_platform, handle) => {
    expect(lookupTarget({ primary_platform, handle })).toBeNull();
  });
});

describe("pickPublicLookups: who is due", () => {
  it("takes a creator never refreshed or last refreshed over a fortnight ago, and leaves a fresher one", () => {
    expect(pick([row("never"), row("old", { last_metrics_sync: daysAgo(15) }), row("recent", { last_metrics_sync: daysAgo(13) })])).toEqual(["never", "old"]);
  });

  it("leaves out a creator whose handle can't be looked up, so they never cost a call", () => {
    expect(pick([row("name", { handle: "Jane Doe" }), row("good")])).toEqual(["good"]);
  });

  it("leaves a handle that wasn't found alone during its wait", () => {
    const waiting = new Set([goneLockName({ platform: "tiktok", handle: "dead" })]);
    expect(pick([row("dead"), row("good")], { waiting })).toEqual(["good"]);
  });

  it("tries again as soon as someone corrects the handle", () => {
    const waiting = new Set([goneLockName({ platform: "tiktok", handle: "dead" })]);
    expect(pick([row("a", { handle: "fixed" })], { waiting })).toEqual(["a"]);
  });

  it("does the same handle on another platform: the wait belongs to one account", () => {
    const waiting = new Set([goneLockName({ platform: "tiktok", handle: "acme" })]);
    expect(pick([row("a", { handle: "acme", primary_platform: "instagram" })], { waiting })).toEqual(["a"]);
  });

  it("goes in order: creators on a live campaign first, then the never refreshed, then the oldest", () => {
    const rows = [
      row("old", { last_metrics_sync: daysAgo(30) }),
      row("older", { last_metrics_sync: daysAgo(60) }),
      row("never"),
      row("live-old", { last_metrics_sync: daysAgo(20) }),
      row("live-never"),
    ];
    expect(pick(rows, { live: new Set(["live-old", "live-never"]) })).toEqual(["live-never", "live-old", "never", "older", "old"]);
  });

  it("stops at the limit", () => {
    expect(pick([row("a"), row("b"), row("c")], { limit: 2 })).toEqual(["a", "b"]);
  });

  it("takes a creator asked for by id even when fresh or waiting, but still not an unreadable handle", () => {
    const waiting = new Set([goneLockName({ platform: "tiktok", handle: "dead" })]);
    const rows = [row("recent", { last_metrics_sync: daysAgo(1) }), row("dead"), row("name", { handle: "Jane Doe" })];
    expect(pick(rows, { waiting, explicit: true })).toEqual(["dead", "recent"]);
  });
});

describe("lookupPublicStats: what it asks for", () => {
  it("asks TikTok by handle and accepts a week-old copy, which is free", async () => {
    const call = answer(fixture("tiktok-profile"));
    await lookupPublicStats({ platform: "tiktok", handle: "acmekenya" }, call);
    expect(call).toHaveBeenCalledWith("/v1/tiktok/profile", { handle: "acmekenya", cache_max_age: "7d" });
  });

  it("asks Instagram by handle", async () => {
    const call = answer(fixture("instagram-profile"));
    await lookupPublicStats({ platform: "instagram", handle: "acmekenya" }, call);
    expect(call).toHaveBeenCalledWith("/v1/instagram/profile", { handle: "acmekenya", cache_max_age: "7d" });
  });

  it("asks Facebook by the page's address", async () => {
    const call = answer(fixture("facebook-profile"));
    await lookupPublicStats({ platform: "facebook", handle: "acmekenya" }, call);
    expect(call).toHaveBeenCalledWith("/v1/facebook/profile", { url: "https://www.facebook.com/acmekenya", cache_max_age: "7d" });
  });

  it("asks for a Facebook page with no username by its id", async () => {
    const call = answer(fixture("facebook-profile"));
    await lookupPublicStats({ platform: "facebook", handle: "12345" }, call);
    expect(call).toHaveBeenCalledWith("/v1/facebook/profile", { url: "https://www.facebook.com/profile.php?id=12345", cache_max_age: "7d" });
  });
});

describe("lookupPublicStats: what it reads", () => {
  it("reads TikTok's followers and works out likes per video against followers, as the connected route does", async () => {
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acmekenya" }, answer(fixture("tiktok-profile")));
    expect(found).toMatchObject({ outcome: "found", charged: 1, balance: 900 });
    expect(found.outcome === "found" && found.stats).toMatchObject({ platform: "tiktok", username: "acmekenya", followers: 4100, engagement_rate: 232.2, posts_sampled: 20 });
  });

  it("leaves TikTok's rate unmeasured for an account with no videos, instead of calling it 0", async () => {
    const json = { success: true, stats: { followerCount: 50, heartCount: 0, videoCount: 0 } };
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acme" }, answer(json));
    expect(found.outcome === "found" && found.stats).toMatchObject({ followers: 50, engagement_rate: null });
  });

  it("leaves a rate the column can't hold unmeasured, because storing it would fail the row's whole update", async () => {
    const json = { success: true, stats: { followerCount: 10, heartCount: 100_000, videoCount: 10 } };
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acme" }, answer(json));
    expect(found.outcome === "found" && found.stats).toMatchObject({ followers: 10, engagement_rate: null });
  });

  it("reads Instagram's followers and works out likes and comments per recent post against followers", async () => {
    const node = (likes: number, comments: number) => ({ node: { edge_liked_by: { count: likes }, edge_media_to_comment: { count: comments } } });
    const json = { success: true, data: { user: { edge_followed_by: { count: 1000 }, edge_owner_to_timeline_media: { edges: [node(50, 10), node(30, 10)] } } } };
    const found = await lookupPublicStats({ platform: "instagram", handle: "acme" }, answer(json));
    expect(found.outcome === "found" && found.stats).toMatchObject({ followers: 1000, engagement_rate: 5, posts_sampled: 2 });
  });

  it("leaves out Instagram posts whose likes are hidden", async () => {
    const shown = { node: { edge_liked_by: { count: 40 }, edge_media_to_comment: { count: 10 } } };
    const hidden = { node: { edge_liked_by: { count: -1 }, edge_media_to_comment: { count: 10 } } };
    const flagged = { node: { like_and_view_counts_disabled: true, edge_liked_by: { count: 0 }, edge_media_to_comment: { count: 0 } } };
    const json = { success: true, data: { user: { edge_followed_by: { count: 1000 }, edge_owner_to_timeline_media: { edges: [shown, hidden, flagged] } } } };
    const found = await lookupPublicStats({ platform: "instagram", handle: "acme" }, answer(json));
    expect(found.outcome === "found" && found.stats).toMatchObject({ engagement_rate: 5, posts_sampled: 1 });
  });

  it("leaves Instagram's rate unmeasured when the answer carries no posts", async () => {
    const found = await lookupPublicStats({ platform: "instagram", handle: "acmekenya" }, answer(fixture("instagram-profile")));
    expect(found.outcome === "found" && found.stats).toMatchObject({ followers: 24555, engagement_rate: null, posts_sampled: 0 });
  });

  it("reads Facebook's followers, with the rate unmeasured", async () => {
    const found = await lookupPublicStats({ platform: "facebook", handle: "acmekenya" }, answer(fixture("facebook-profile")));
    expect(found).toMatchObject({ outcome: "found", charged: 1, balance: 896 });
    expect(found.outcome === "found" && found.stats).toMatchObject({ followers: 3200, engagement_rate: null });
  });

  it("falls back to a Facebook page's likes when it gives no follower count", async () => {
    const found = await lookupPublicStats({ platform: "facebook", handle: "acme" }, answer({ success: true, likeCount: 77 }));
    expect(found.outcome === "found" && found.stats).toMatchObject({ followers: 77 });
  });

  it("dates a free cached copy by when it was read, and costs nothing", async () => {
    const json = { ...fixture("tiktok-profile"), credits_charged: 0, cached: true, cached_at: "2026-11-01T06:00:00Z" };
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acmekenya" }, answer(json));
    expect(found).toMatchObject({ outcome: "found", charged: 0 });
    expect(found.outcome === "found" && found.stats.measured_at).toBe("2026-11-01T06:00:00.000Z");
  });

  it("leaves a live answer undated, so it counts as read now", async () => {
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acmekenya" }, answer(fixture("tiktok-profile")));
    expect(found.outcome === "found" && found.stats.measured_at).toBeNull();
  });

  it("counts a good answer with no charge on it as one credit, so the cap can't undercount", async () => {
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acme" }, answer({ success: true, stats: { followerCount: 5 } }));
    expect(found.charged).toBe(1);
  });
});

describe("lookupPublicStats: when there's no number", () => {
  it("says out of credits on a 402, and charges nothing", async () => {
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acme" }, answer({ success: false, message: "Gotta purchase more credits" }, 402));
    expect(found).toEqual({ outcome: "out_of_credits", charged: 0, balance: null });
  });

  it.each([
    ["a 404", { success: false }, 404, 0],
    ["an account that doesn't exist, which is charged", { success: true, credits_charged: 1, accountDoesNotExist: true }, 200, 1],
    ["a private-account placeholder, which is charged", { success: true, credits_charged: 1, message: "This account is private" }, 200, 1],
    ["an answer with no follower number", { success: true, credits_charged: 1 }, 200, 1],
    ["zero followers, which must not overwrite a real number", { success: true, credits_charged: 1, stats: { followerCount: 0 } }, 200, 1],
  ])("calls %s gone, so it waits", async (_what, json, status, charged) => {
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acme" }, answer(json, status));
    expect(found).toMatchObject({ outcome: "gone", charged });
  });

  it.each([
    ["a provider error", { message: "Server Error" }, 500],
    ["a scraping failure", { success: false }, 200],
    ["a bad key", { message: "Invalid API key" }, 401],
    ["a broken body", null, 502],
  ])("calls %s failed, so it's tried again on the next run", async (_what, json, status) => {
    const found = await lookupPublicStats({ platform: "tiktok", handle: "acme" }, answer(json, status));
    expect(found).toMatchObject({ outcome: "failed", charged: 0 });
  });

  it("calls a network failure failed too", async () => {
    const call = vi.fn<ScCall>(async () => { throw new Error("timed out"); });
    await expect(lookupPublicStats({ platform: "tiktok", handle: "acme" }, call)).resolves.toMatchObject({ outcome: "failed", charged: 0 });
  });
});

describe("runLookups: the daily allowance", () => {
  const good = { success: true, credits_charged: 1, credits_remaining: 5000, stats: { followerCount: 10 } };
  const queue = (n: number) => Array.from({ length: n }, (_, i) => row(`creator${i}`));
  const spend = (over = {}) => ({ allowance: 40, used: 0, balance: 5000 as number | null, outOfCredits: false, ...over });
  const run = (rows: RosterRow[], s: ReturnType<typeof spend>, call: ScCall, onBatch = vi.fn(async () => {}), outOfTime = () => false) =>
    runLookups({ queue: rows, spend: s, atOnce: 5, call, outOfTime, onBatch });

  it("makes exactly as many paid calls as the allowance, however long the queue", async () => {
    const call = answer(good);
    const s = spend({ allowance: 7 });
    await run(queue(20), s, call);
    expect(call).toHaveBeenCalledTimes(7);
    expect(s.used).toBe(7);
  });

  it("makes no call with nothing left today", async () => {
    const call = answer(good);
    await run(queue(5), spend({ allowance: 0 }), call);
    expect(call).not.toHaveBeenCalled();
  });

  it("keeps going past the allowance while answers are free, because they cost nothing", async () => {
    const call = answer({ ...good, credits_charged: 0, cached: true });
    const s = spend({ allowance: 2 });
    await run(queue(9), s, call);
    expect(call).toHaveBeenCalledTimes(9);
    expect(s.used).toBe(0);
  });

  it("stops after the batch that hears the account is empty", async () => {
    const call = answer({ success: false }, 402);
    const s = spend();
    await run(queue(20), s, call);
    expect(call).toHaveBeenCalledTimes(5);
    expect(s.outOfCredits).toBe(true);
  });

  it("makes no call when the last balance seen is under the floor", async () => {
    const call = answer(good);
    await run(queue(5), spend({ balance: CREDIT_FLOOR - 1 }), call);
    expect(call).not.toHaveBeenCalled();
  });

  it("starts when no balance has been seen, and stops once an answer shows it under the floor", async () => {
    const call = answer({ ...good, credits_remaining: CREDIT_FLOOR - 1 });
    await run(queue(20), spend({ balance: null }), call);
    expect(call).toHaveBeenCalledTimes(5);
  });

  it("goes by the lowest balance a batch reports, whichever answer came last", async () => {
    const balances = [CREDIT_FLOOR - 50, 5000, 5000, 5000, 5000];
    const call = vi.fn<ScCall>(async () => ({ status: 200, json: { ...good, credits_remaining: balances.shift() ?? 5000 } }));
    await run(queue(20), spend(), call);
    expect(call).toHaveBeenCalledTimes(5);
  });

  it("hands over every batch as it finishes, with what it cost, so a run cut short has saved what it paid for", async () => {
    const onBatch = vi.fn(async () => {});
    await run(queue(7), spend(), answer(good), onBatch);
    const batches = onBatch.mock.calls as unknown as [{ row: RosterRow }[], number][];
    expect(batches.map(([done, charged]) => [done.length, charged])).toEqual([[5, 5], [2, 2]]);
  });

  it("says how many it left when time ran out", async () => {
    let batches = 0;
    const result = await run(queue(12), spend(), answer(good), vi.fn(async () => { batches++; }), () => batches >= 1);
    expect(result.skippedForTime).toBe(7);
  });
});

describe("the job's limits", () => {
  it.each([
    [undefined, 40],
    ["", 40],
    ["25", 25],
    ["0", 0],
    ["many", 40],
    ["-3", 40],
    ["2.5", 40],
  ])("a daily setting of %s means %i", (setting, credits) => {
    expect(dailyCredits(setting)).toBe(credits);
  });

  it("stops before brand channels do, so the numbers that change least give way first", () => {
    expect(CREDIT_FLOOR).toBeGreaterThan(SC_CREDIT_FLOOR);
  });

  it("starts the day at Nairobi's midnight", () => {
    expect(nairobiDayStart(Date.parse("2026-11-03T21:30:00Z"))).toBe("2026-11-03T21:00:00.000Z");
    expect(nairobiDayStart(Date.parse("2026-11-03T20:59:00Z"))).toBe("2026-11-02T21:00:00.000Z");
  });

  it("explains why lookups stopped, and stays quiet when none were left waiting", () => {
    const spend = { allowance: 40, used: 0, balance: 5000, outOfCredits: false };
    expect(stopNote({ ...spend, used: 40 }, 3)).toMatch(/tomorrow/);
    expect(stopNote({ ...spend, balance: 100 }, 3)).toMatch(/balance/);
    expect(stopNote({ ...spend, outOfCredits: true }, 3)).toMatch(/out of credits/);
    expect(stopNote({ ...spend, used: 40 }, 0)).toBeNull();
    expect(stopNote(spend, 3)).toBeNull();
  });
});
