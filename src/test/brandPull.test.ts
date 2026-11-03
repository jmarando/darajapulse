import { describe, expect, it, vi } from "vitest";
import { applyPull, pullPublic, snapshotRow, type PullResult, type ScCall } from "../../supabase/functions/_shared/brand-pull";

const now = Date.parse("2026-11-03T02:00:00Z");
const daysAgo = (n: number) => Math.floor((now - n * 86_400_000) / 1000);
const ok = (json: unknown) => ({ status: 200, json: { success: true, ...(json as object) } });

const ttProfile = ok({ user: { id: "1", nickname: "Acme" }, stats: { followerCount: 10 } });
const igProfile = ok({ data: { user: { id: "2", full_name: "Acme", edge_followed_by: { count: 20 } } } });
const fbProfile = ok({ id: "3", name: "Acme", followerCount: 30 });

const tt = (id: string, age: number) => ({ aweme_id: id, create_time: daysAgo(age), statistics: { play_count: 5 } });
const ttPage = (posts: unknown[], max_cursor: number | null = 9) => ok({ aweme_list: posts, ...(max_cursor ? { max_cursor } : { has_more: false }) });
const ig = (code: string, age: number) => ({ code, media_type: 1, taken_at: daysAgo(age) });
const igPage = (posts: unknown[], next: string | null = "n") => ok({ items: posts, ...(next ? { next_max_id: next } : { more_available: false }) });
const fb = (id: string, age: number) => ({ id, publishTime: daysAgo(age), reactionCount: 1 });

/** Plays back answers in order, and records what it was asked. */
function player(answers: { status: number; json: unknown }[]) {
  const call = vi.fn<ScCall>(async () => answers.shift() ?? { status: 500, json: {} });
  return call;
}
const public_ = (platform: "tiktok" | "instagram" | "facebook", call: ScCall, mode: "first" | "deep" | "nightly" = "first") =>
  pullPublic({ platform, handle: "acme", mode, now, call });

describe("pullPublic: what it asks for", () => {
  it("asks TikTok for the latest videos without pinned ones, and passes the cursor on", async () => {
    const call = player([ttProfile, ttPage([tt("a", 1)]), ttPage([], null)]);
    await public_("tiktok", call);
    expect(call.mock.calls[0]).toEqual(["/v1/tiktok/profile", { handle: "acme" }]);
    expect(call.mock.calls[1]).toEqual(["/v3/tiktok/profile/videos", { handle: "acme", sort_by: "latest", include_pinned: "false" }]);
    expect(call.mock.calls[2][1]).toMatchObject({ max_cursor: "9" });
  });

  it("asks Instagram by handle and passes its cursor on", async () => {
    const call = player([igProfile, igPage([ig("a", 1)]), igPage([], null)]);
    await public_("instagram", call);
    expect(call.mock.calls[0]).toEqual(["/v1/instagram/profile", { handle: "acme" }]);
    expect(call.mock.calls[1]).toEqual(["/v2/instagram/user/posts", { handle: "acme" }]);
    expect(call.mock.calls[2][1]).toMatchObject({ next_max_id: "n" });
  });

  it("asks Facebook by the page's address, and gives reels both their cursors", async () => {
    const call = player([
      fbProfile,
      ok({ posts: [fb("a", 1)] }),
      ok({ reels: [], cursor: "c", next_page_id: "p" }),
      ok({ reels: [] }),
    ]);
    await public_("facebook", call);
    expect(call.mock.calls[0]).toEqual(["/v1/facebook/profile", { url: "https://www.facebook.com/acme" }]);
    expect(call.mock.calls[1]).toEqual(["/v1/facebook/profile/posts", { url: "https://www.facebook.com/acme" }]);
    expect(call.mock.calls[2]).toEqual(["/v1/facebook/profile/reels", { url: "https://www.facebook.com/acme" }]);
    expect(call.mock.calls[3][1]).toMatchObject({ cursor: "c", next_page_id: "p" });
  });
});

describe("pullPublic: when it stops", () => {
  it("stops at the page cap", async () => {
    const posts = Array.from({ length: 12 }, () => ok({ posts: [fb(String(Math.random()), 1)], cursor: "c" }));
    const call = vi.fn<ScCall>(async (path) => {
      if (path === "/v1/facebook/profile") return fbProfile;
      if (path === "/v1/facebook/profile/reels") return ok({ reels: [], cursor: "c", next_page_id: "p" });
      return posts.shift()!;
    });
    const result = await public_("facebook", call, "nightly");
    expect(call).toHaveBeenCalledTimes(7); // profile, 5 post pages, 1 reel page
    expect(result).toMatchObject({ ok: true, calls: 7 });
  });

  it("stops at a page where every post is older than the window, but not at one old post among new ones", async () => {
    const call = player([ttProfile, ttPage([tt("new", 1), tt("old1", 200)]), ttPage([tt("old2", 200), tt("old3", 201)]), ttPage([tt("never", 1)])]);
    const result = await public_("tiktok", call);
    expect(call).toHaveBeenCalledTimes(3);
    expect(result.ok && result.posts.map((p) => p.external_id)).toEqual(["new"]);
  });

  it("goes on past an empty page that has a cursor", async () => {
    const call = player([ttProfile, ttPage([]), ttPage([tt("a", 1)], null)]);
    const result = await public_("tiktok", call);
    expect(call).toHaveBeenCalledTimes(3);
    expect(result.ok && result.posts).toHaveLength(1);
  });

  it("stops when there is no cursor", async () => {
    const call = player([igProfile, igPage([ig("a", 1)], null), igPage([ig("never", 1)])]);
    await public_("instagram", call);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("keeps only posts inside the window, and drops posts with no date", async () => {
    const call = player([ttProfile, ttPage([tt("in", 44), tt("out", 46), { aweme_id: "nodate", statistics: {} }], null)]);
    const result = await public_("tiktok", call, "nightly");
    expect(result.ok && result.posts.map((p) => p.external_id)).toEqual(["in"]);
  });

  it("keeps one copy of a post the provider returned twice, so the write can't fail on it", async () => {
    const call = player([ttProfile, ttPage([tt("a", 1)]), ttPage([tt("a", 1), tt("b", 2)], null)]);
    const result = await public_("tiktok", call);
    expect(result.ok && result.posts.map((p) => p.external_id)).toEqual(["a", "b"]);
  });

  it("puts reel views on the Facebook posts", async () => {
    const call = player([
      fbProfile,
      ok({ posts: [{ ...fb("a", 1), url: "https://www.facebook.com/reel/77/" }] }),
      ok({ reels: [{ video_id: "77", view_count: 900, creation_time: new Date(now - 86_400_000).toISOString() }] }),
    ]);
    const result = await public_("facebook", call);
    expect(result.ok && result.posts[0].metrics).toMatchObject({ views: 900, likes: 1 });
  });
});

describe("pullPublic: when something goes wrong", () => {
  const failure = (r: PullResult) => (r.ok === true ? "ok" : r.kind);

  it("answers out_of_credits on a 402 at any call", async () => {
    expect(failure(await public_("tiktok", player([{ status: 402, json: {} }])))).toBe("out_of_credits");
    expect(failure(await public_("tiktok", player([ttProfile, ttPage([tt("a", 1)]), { status: 402, json: {} }])))).toBe("out_of_credits");
    expect(failure(await public_("facebook", player([fbProfile, ok({ posts: [fb("a", 1)] }), { status: 402, json: {} }])))).toBe("out_of_credits");
  });

  it("answers not_found on a 404 profile, and on a 200 that names nobody", async () => {
    expect(failure(await public_("tiktok", player([{ status: 404, json: { accountDoesNotExist: true } }])))).toBe("not_found");
    expect(failure(await public_("tiktok", player([ok({})])))).toBe("not_found");
  });

  it("answers private when the profile says so", async () => {
    expect(failure(await public_("facebook", player([{ status: 200, json: { success: true, isPrivate: true, account_status: "private" } }])))).toBe("private");
    expect(failure(await public_("instagram", player([{ status: 404, json: { success: true, error: "not_found", message: "Profile is private" } }])))).toBe("private");
    expect(failure(await public_("instagram", player([{ status: 403, json: { success: true, message: "Profile is age restricted" } }])))).toBe("private");
  });

  it("fails when the profile call fails, keeping nothing", async () => {
    const result = await public_("tiktok", player([{ status: 500, json: {} }]));
    expect(failure(result)).toBe("failed");
  });

  it("fails with nothing kept when the first posts page fails", async () => {
    expect(failure(await public_("tiktok", player([ttProfile, { status: 500, json: {} }])))).toBe("failed");
    expect(failure(await public_("tiktok", player([ttProfile, { status: 200, json: { success: false } }])))).toBe("failed");
  });

  it("treats a network error as a failed read", async () => {
    const call = vi.fn<ScCall>(async () => { throw new Error("connection reset"); });
    expect(failure(await public_("tiktok", call))).toBe("failed");
  });

  it("reads a 404 on posts after a good profile as an account with no posts", async () => {
    const result = await public_("instagram", player([igProfile, { status: 404, json: { success: true, message: "Posts not found" } }]));
    expect(result).toMatchObject({ ok: true, posts: [] });
  });

  it("keeps what it read when a later page fails", async () => {
    const result = await public_("tiktok", player([ttProfile, ttPage([tt("a", 1)]), { status: 500, json: {} }]));
    expect(result.ok && result.posts.map((p) => p.external_id)).toEqual(["a"]);
  });

  it("carries on without reel views when the reel call fails", async () => {
    const result = await public_("facebook", player([fbProfile, ok({ posts: [fb("a", 1)] }), { status: 500, json: {} }]));
    expect(result.ok && result.posts).toHaveLength(1);
  });
});

describe("applyPull", () => {
  const at = Date.parse("2026-11-03T22:00:00Z");
  const iso = new Date(at).toISOString();
  const row = (over: object = {}) => ({ platform: "tiktok", source: "public", status: "ok", last_good_pull_at: "2026-11-01T00:00:00Z", ...over });
  const good = (followers: number | null = 100, source: "scrapecreators" | "meta" = "scrapecreators"): PullResult => ({
    ok: true, source, calls: 2, posts: [], channel: { external_id: "1", display_name: "Acme", avatar_url: "https://x/a.jpg", followers },
  });
  const bad = (kind: Extract<PullResult, { ok: false }>["kind"], note = "x"): PullResult => ({ ok: false, kind, note, calls: 1 });

  it("marks a good read, fills in the name and writes the day's line in Nairobi's date", () => {
    const { channel, day } = applyPull(row(), good(), at);
    expect(channel).toEqual({ status: "ok", status_note: null, last_pull_at: iso, last_good_pull_at: iso, external_id: "1", display_name: "Acme", avatar_url: "https://x/a.jpg" });
    expect(day).toEqual({ day: "2026-11-04", followers: 100, source: "scrapecreators" });
  });

  it("writes no line when no follower count came back, so there is no zero", () => {
    expect(applyPull(row(), good(null), at).day).toBeNull();
  });

  it("does not blank a name it already has when the source left it out", () => {
    const result: PullResult = { ok: true, source: "scrapecreators", calls: 1, posts: [], channel: { external_id: null, display_name: null, avatar_url: null, followers: 5 } };
    const { channel } = applyPull(row(), result, at);
    expect(channel).not.toHaveProperty("display_name");
    expect(channel).not.toHaveProperty("external_id");
  });

  it("writes nothing but the attempt and a note when a read fails", () => {
    const { channel, day } = applyPull(row(), bad("failed"), at);
    expect(channel).toEqual({ last_pull_at: iso, status_note: "Couldn't read this account last night. Showing the last good numbers." });
    expect(day).toBeNull();
  });

  it("says something different when a brand-new channel can't be read", () => {
    expect(applyPull(row({ last_good_pull_at: null }), bad("failed"), at).channel.status_note).toBe("Couldn't read this account yet. Tries again tonight.");
  });

  it("calls a handle never found an error, and tells people to check it", () => {
    expect(applyPull(row({ last_good_pull_at: null }), bad("not_found"), at).channel).toMatchObject({ status: "error", status_note: "Not found on TikTok. Check the handle." });
  });

  it("says an account that has gone may have been renamed", () => {
    expect(applyPull(row(), bad("not_found"), at).channel).toMatchObject({ status: "error", status_note: "Not found on TikTok any more. It may have been renamed." });
  });

  it("says a private account can't be read", () => {
    expect(applyPull(row(), bad("private"), at).channel).toMatchObject({ status: "error", status_note: "This account is private, so its public numbers can't be read." });
  });

  it("pauses when the provider is out of credits", () => {
    expect(applyPull(row(), bad("out_of_credits"), at).channel).toMatchObject({ status: "paused", status_note: "Public numbers are paused: the data provider is out of credits." });
  });

  it("leaves the status alone when today's allowance is used", () => {
    const { channel } = applyPull(row(), bad("cap"), at);
    expect(channel).toEqual({ last_pull_at: iso, status_note: "Today's allowance for public numbers is used. Tries again tonight." });
  });

  it("brings a paused or missing channel back on a good read", () => {
    expect(applyPull(row({ status: "paused" }), good(), at).channel).toMatchObject({ status: "ok", status_note: null });
    expect(applyPull(row({ status: "error" }), good(), at).channel).toMatchObject({ status: "ok", status_note: null });
  });

  it("does not clear needs_reconnect on a public read, but still moves the time", () => {
    const { channel } = applyPull(row({ source: "connected", status: "needs_reconnect" }), good(), at);
    expect(channel).not.toHaveProperty("status");
    expect(channel).not.toHaveProperty("status_note");
    expect(channel.last_good_pull_at).toBe(iso);
  });
});

describe("snapshotRow", () => {
  const blank = { views: null, likes: null, comments: null, shares: null, saves: null, reach: null, views_paid: null };

  it("writes the numbers it has, leaving the rest null", () => {
    const at = Date.parse("2026-11-03T22:00:00Z");
    expect(snapshotRow("p1", { ...blank, views: 5, comments: 0 }, "scrapecreators", at)).toEqual({
      ...blank, post_id: "p1", views: 5, comments: 0, source: "scrapecreators", captured_at: new Date(at).toISOString(),
    });
  });

  it("writes no row when nothing is known", () => {
    expect(snapshotRow("p1", blank, "scrapecreators", 0)).toBeNull();
  });
});

describe("pullPublic: running out of time", () => {
  it("stops paging when time is up and keeps what it read", async () => {
    let left = 2; // the profile and one page
    const call = vi.fn<ScCall>(async (path) => {
      left--;
      return path === "/v1/tiktok/profile" ? ttProfile : ttPage([tt("a", 1)]);
    });
    const result = await pullPublic({ platform: "tiktok", handle: "acme", mode: "first", now, call, outOfTime: () => left <= 0 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, calls: 2 });
  });
});
