import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPull, pullMetaFacebook, pullMetaInstagram, pullPublic, pullRoute, snapshotRow, type GraphCall, type PullResult, type ScCall } from "../../supabase/functions/_shared/brand-pull";

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

  it("leaves out a post another page wrote, because its numbers aren't this brand's", async () => {
    const call = player([
      fbProfile,
      ok({ posts: [
        { ...fb("own", 1), url: "https://www.facebook.com/Acme/posts/pfbid1" },
        { ...fb("other", 1), url: "https://www.facebook.com/SomeoneElse/posts/pfbid2" },
        { ...fb("reel", 1), url: "https://www.facebook.com/reel/77/" },
        { ...fb("nolink", 1) },
      ] }),
      ok({ reels: [] }),
    ]);
    const result = await public_("facebook", call);
    expect(result.ok && result.posts.map((p) => p.external_id)).toEqual(["own", "reel", "nolink"]);
  });

  it("can't tell whose post it is on a page with no username, so it keeps them all", async () => {
    const call = player([fbProfile, ok({ posts: [{ ...fb("a", 1), url: "https://www.facebook.com/SomeoneElse/posts/pfbid2" }] }), ok({ reels: [] })]);
    const result = await pullPublic({ platform: "facebook", handle: "61551234567890", mode: "first", now, call });
    expect(result.ok && result.posts).toHaveLength(1);
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

  it("reads a bare 403 as a failed read, not a private account, since it can be the provider refusing us", async () => {
    expect(failure(await public_("tiktok", player([{ status: 403, json: { message: "Forbidden" } }])))).toBe("failed");
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

  it("says a private or age-restricted account can't be read", () => {
    expect(applyPull(row(), bad("private"), at).channel).toMatchObject({ status: "error", status_note: "This account is private or age-restricted, so its public numbers can't be read." });
  });

  it("pauses when the provider is out of credits", () => {
    expect(applyPull(row(), bad("out_of_credits"), at).channel).toMatchObject({ status: "paused", status_note: "Public numbers are paused: the data provider is out of credits." });
  });

  it("keeps saying a page needs reconnecting, whatever happens to the public read standing in", () => {
    for (const kind of ["out_of_credits", "cap", "failed", "not_found", "private"] as const) {
      const { channel } = applyPull(row({ source: "connected", status: "needs_reconnect" }), bad(kind), at);
      expect(channel).toEqual({ last_pull_at: iso });
    }
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

  it("keeps the page id Meta knows when public numbers stand in", () => {
    const { channel } = applyPull(row({ source: "connected", status: "needs_reconnect" }), good(), at);
    expect(channel).not.toHaveProperty("external_id");
  });

  it("clears needs_reconnect on a read from Meta", () => {
    expect(applyPull(row({ source: "connected", status: "needs_reconnect" }), good(100, "meta"), at).channel).toMatchObject({ status: "ok", status_note: null });
  });

  it("marks a rejected token and writes no line", () => {
    const { channel, day } = applyPull(row({ source: "connected" }), bad("reconnect", "Reconnect it."), at);
    expect(channel).toEqual({ last_pull_at: iso, status: "needs_reconnect", status_note: "Reconnect it." });
    expect(day).toBeNull();
  });

  it("leaves the status alone when Facebook asks us to slow down", () => {
    expect(applyPull(row({ source: "connected" }), bad("retry"), at).channel).toEqual({ last_pull_at: iso, status_note: "Facebook asked us to slow down. Tries again tonight." });
  });

  it("saves an audience when a read brings one, and keeps the old one when it doesn't", () => {
    const audience = { country: [{ key: "KE", value: 1 }], age: [], gender: [] };
    const result: PullResult = { ok: true, source: "meta", calls: 1, posts: [], audience, channel: { external_id: "1", display_name: null, avatar_url: null, followers: 5 } };
    expect(applyPull(row({ source: "connected" }), result, at).channel).toMatchObject({ audience, audience_at: iso });
    expect(applyPull(row({ source: "connected" }), { ...result, audience: null }, at).channel).not.toHaveProperty("audience");
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

const metaFixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `fixtures/meta/${name}.docs.json`), "utf8"));

/** Answers by path and params, and records every call. */
function graphStub(answer: (path: string, params: Record<string, string>) => { ok: boolean; json?: unknown; error?: { code?: number } }) {
  return vi.fn<GraphCall>(async (path, params) => ({ json: null, ...answer(path, params) }));
}

describe("pullMetaFacebook", () => {
  const healthy = (path: string, params: Record<string, string>) => {
    if (path === "104359362513119") return { ok: true, json: metaFixture("page") };
    if (path.endsWith("/posts")) return { ok: true, json: { data: metaFixture("page-posts").data.map((p: object) => ({ ...p, created_time: new Date(now - 86_400_000).toISOString() })) } };
    if (params.breakdown) return { ok: true, json: metaFixture("post-views-breakdown") };
    return { ok: true, json: metaFixture("post-insights") };
  };
  const pull = (graph: GraphCall, mode: "first" | "deep" | "nightly" = "nightly") => pullMetaFacebook({ pageId: "104359362513119", mode, now, graph });

  it("reads followers, posts, views, reach and paid views from Meta", async () => {
    const result = await pull(graphStub(healthy));
    expect(result).toMatchObject({ ok: true, source: "meta", channel: { followers: 3200 } });
    expect(result.ok && result.posts[0].metrics).toMatchObject({ views: 1000, reach: 800, views_paid: 200, likes: 133, comments: 12, shares: 7 });
  });

  it("asks for the window it needs, and for insights by the post's full id", async () => {
    const graph = graphStub(healthy);
    await pull(graph);
    const posts = graph.mock.calls.find(([path]) => path.endsWith("/posts"));
    expect(posts?.[1].since).toBe(String(Math.floor((now - 45 * 86_400_000) / 1000)));
    expect(graph).toHaveBeenCalledWith("104359362513119_1204545088344463/insights", { metric: "post_media_view,post_total_media_view_unique" });
    expect(graph).toHaveBeenCalledWith("104359362513119_1204545088344463/insights", { metric: "post_media_view", breakdown: "is_from_ads" });
  });

  it("follows the after cursor while Meta says there is more, and never a link holding a token", async () => {
    let page = 0;
    const graph = graphStub((path, params) => {
      if (path.endsWith("/posts")) {
        page++;
        return { ok: true, json: { data: [], paging: page < 3 ? { cursors: { after: `c${page}` }, next: "https://graph.facebook.com/next?access_token=x" } : { cursors: { after: "end" } } } };
      }
      return healthy(path, params);
    });
    await pull(graph);
    expect(page).toBe(3);
    const after = graph.mock.calls.filter(([path]) => path.endsWith("/posts")).map(([, params]) => params.after);
    expect(after).toEqual([undefined, "c1", "c2"]);
  });

  it("asks for a reconnect when the token is rejected", async () => {
    const result = await pull(graphStub(() => ({ ok: false, error: { code: 190 } })));
    expect(result).toMatchObject({ ok: false, kind: "reconnect", note: "Facebook no longer accepts this connection. Reconnect it to get official numbers back." });
  });

  it("tries again tomorrow when told to slow down", async () => {
    expect(await pull(graphStub(() => ({ ok: false, error: { code: 4 } })))).toMatchObject({ ok: false, kind: "retry" });
  });

  it("treats a network error or anything else as a failed read", async () => {
    expect(await pull(vi.fn<GraphCall>(async () => { throw new Error("reset"); }))).toMatchObject({ ok: false, kind: "failed" });
    expect(await pull(graphStub(() => ({ ok: false, error: { code: 100 } })))).toMatchObject({ ok: false, kind: "failed" });
  });

  it("leaves one post's numbers null when its insights fail, and the rest fine", async () => {
    const graph = graphStub((path, params) => (path.startsWith("104359362513119_1204545088344464") ? { ok: false, error: { code: 100 } } : healthy(path, params)));
    const result = await pull(graph);
    expect(result.ok && result.posts[1].metrics).toMatchObject({ views: null, reach: null, views_paid: null, likes: 0 });
    expect(result.ok && result.posts[0].metrics.views).toBe(1000);
  });

  it("keeps the channel fine when one post answers code 10, which Meta also uses for too few viewers", async () => {
    const graph = graphStub((path, params) => (path.startsWith("104359362513119_1204545088344464") ? { ok: false, error: { code: 10 } } : healthy(path, params)));
    expect(await pull(graph)).toMatchObject({ ok: true });
  });

  it("asks for a reconnect when every post refuses its insights", async () => {
    const graph = graphStub((path, params) => (path.endsWith("/insights") ? { ok: false, error: { code: 10 } } : healthy(path, params)));
    expect(await pull(graph)).toMatchObject({ ok: false, kind: "reconnect", note: "Facebook isn't sharing this page's insights any more. Reconnect to see views and reach." });
  });

  it("keeps views when only the paid split fails", async () => {
    const graph = graphStub((path, params) => (params.breakdown ? { ok: false, error: { code: 100 } } : healthy(path, params)));
    const result = await pull(graph);
    expect(result.ok && result.posts[0].metrics).toMatchObject({ views: 1000, views_paid: null });
  });
});

describe("pullMetaInstagram", () => {
  const demographics = (breakdown: string) => ({
    data: [{ name: "follower_demographics", total_value: { breakdowns: [{ results: [{ dimension_values: [breakdown], value: 5 }] }] } }],
  });
  const healthy = (path: string, params: Record<string, string>) => {
    if (path === "17841402777077586") return { ok: true, json: metaFixture("ig-user") };
    if (path.endsWith("/media")) return { ok: true, json: { data: metaFixture("ig-media").data.map((m: object) => ({ ...m, timestamp: new Date(now - 86_400_000).toISOString() })) } };
    if (params.metric === "follower_demographics") return { ok: true, json: demographics(params.breakdown) };
    return { ok: true, json: metaFixture("media-insights") };
  };
  const pull = (graph: GraphCall, mode: "first" | "deep" | "nightly" = "nightly") => pullMetaInstagram({ igUserId: "17841402777077586", mode, now, graph });

  it("reads followers, posts and insights, with saved as saves", async () => {
    const result = await pull(graphStub(healthy));
    expect(result).toMatchObject({ ok: true, source: "meta", channel: { followers: 24555 } });
    expect(result.ok && result.posts[0].metrics).toMatchObject({ views: 2647, reach: 2000, saves: 15, shares: 0, likes: 29, comments: 7 });
    expect(result.ok && result.posts[0].external_id).toBe("DKSMEpKRd6h");
  });

  it("reads the audience only on first and weekly reads", async () => {
    const nightly = graphStub(healthy);
    await pull(nightly);
    expect(nightly.mock.calls.some(([, params]) => params.metric === "follower_demographics")).toBe(false);
    const deep = graphStub(healthy);
    const result = await pull(deep, "deep");
    expect(result.ok && result.audience).toEqual({ country: [{ key: "country", value: 5 }], age: [{ key: "age", value: 5 }], gender: [{ key: "gender", value: 5 }] });
    expect(deep).toHaveBeenCalledWith("17841402777077586/insights", { metric: "follower_demographics", period: "lifetime", timeframe: "this_month", metric_type: "total_value", breakdown: "country" });
  });

  it("gives no audience for an account too small for one, without failing the read", async () => {
    const graph = graphStub((path, params) => (params.metric === "follower_demographics" ? { ok: true, json: { data: [] } } : healthy(path, params)));
    const result = await pull(graph, "first");
    expect(result).toMatchObject({ ok: true, audience: null });
  });

  it("asks for a reconnect when the token is rejected, or every post refuses its insights", async () => {
    expect(await pull(graphStub(() => ({ ok: false, error: { code: 190 } })))).toMatchObject({ ok: false, kind: "reconnect" });
    const graph = graphStub((path, params) => (path.endsWith("/insights") ? { ok: false, error: { code: 200 } } : healthy(path, params)));
    expect(await pull(graph)).toMatchObject({ ok: false, kind: "reconnect" });
  });

  it("leaves a post with no insights null, never 0", async () => {
    const graph = graphStub((path, params) => (path === "17900000000000002/insights" ? { ok: true, json: { data: [] } } : healthy(path, params)));
    const result = await pull(graph);
    expect(result.ok && result.posts[1].metrics).toMatchObject({ views: null, reach: null, saves: null, shares: null, likes: 12 });
  });
});

describe("pullRoute", () => {
  it("reads a connected channel from Meta, and from public numbers once its token is rejected", () => {
    expect(pullRoute({ source: "connected", status: "ok" })).toBe("meta");
    expect(pullRoute({ source: "connected", status: "paused" })).toBe("meta");
    expect(pullRoute({ source: "connected", status: "needs_reconnect" })).toBe("public");
    expect(pullRoute({ source: "public", status: "ok" })).toBe("public");
  });
});
