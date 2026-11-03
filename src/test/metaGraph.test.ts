import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  READ_SCOPES, assetHandle, classifyMetaError, graphCall, listAccounts, mapMetaFacebookPost, mapMetaMedia, mapMetaPage, mapMetaInstagram, matchChannel, metaDialogUrl,
  normalisePostUrl, parseDemographics, parseMediaInsights, parsePostInsights, parsePostViewsSplit, parseSignedRequest, reconcilePosts, reconnectNote, shapeAssets,
} from "../../supabase/functions/_shared/meta-graph";

// These shapes come from Meta's docs and have not yet been checked against a live answer: see BRAND_CHANNELS_PLAN.md, Task 10.
const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `fixtures/meta/${name}.docs.json`), "utf8"));

describe("metaDialogUrl", () => {
  it("asks for exactly the six read permissions on the standard login", () => {
    const u = new URL(metaDialogUrl({ appId: "1", redirectUri: "https://x/cb", state: "s" }));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(u.searchParams.get("client_id")).toBe("1");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x/cb");
    expect(u.searchParams.get("state")).toBe("s");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights,business_management");
    expect(u.searchParams.has("config_id")).toBe(false);
  });

  it("uses the configuration instead of a scope list on Facebook Login for Business", () => {
    const c = new URL(metaDialogUrl({ appId: "1", redirectUri: "https://x/cb", state: "s", configId: "9" }));
    expect(c.searchParams.get("config_id")).toBe("9");
    expect(c.searchParams.get("response_type")).toBe("code");
    expect(c.searchParams.get("override_default_response_type")).toBe("true");
    expect(c.searchParams.has("scope")).toBe(false);
  });

  it("asks for nothing that can post, comment or read messages", () => {
    for (const scope of READ_SCOPES) expect(scope).not.toMatch(/publish|manage_posts|manage_comments|messaging|manage_messages|create_content/);
  });
});

describe("classifyMetaError", () => {
  it("asks for a reconnect when the token or a permission is gone", () => {
    for (const code of [190, 10, 200]) expect(classifyMetaError({ code })).toBe("reconnect");
  });

  it("tries again tomorrow on rate limits and temporary errors", () => {
    for (const code of [4, 17, 32, 613, 1, 2]) expect(classifyMetaError({ code })).toBe("retry");
  });

  it("treats anything else as neither", () => {
    expect(classifyMetaError({ code: 100 })).toBe("other");
    expect(classifyMetaError(null)).toBe("other");
    expect(classifyMetaError(undefined)).toBe("other");
  });

  it("says why in plain words", () => {
    expect(reconnectNote(190)).toBe("Facebook no longer accepts this connection. Reconnect it to get official numbers back.");
    expect(reconnectNote(10)).toBe("A permission was removed in Facebook. Reconnect to get official numbers back.");
    expect(reconnectNote(200)).toBe("A permission was removed in Facebook. Reconnect to get official numbers back.");
  });
});

describe("parseSignedRequest", () => {
  const secret = "app-secret";
  const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
  const signed = (payload: object, key = secret) => {
    const body = b64url(JSON.stringify(payload));
    return `${b64url(createHmac("sha256", key).update(body).digest())}.${body}`;
  };

  it("reads the user id from a request Meta signed", async () => {
    await expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "777", issued_at: 1 }), secret)).resolves.toEqual({ user_id: "777" });
  });

  it("refuses another secret's signature", async () => {
    await expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "777" }, "other"), secret)).resolves.toBeNull();
  });

  it("refuses a changed payload", async () => {
    const [sig] = signed({ algorithm: "HMAC-SHA256", user_id: "777" }).split(".");
    const forged = b64url(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "888" }));
    await expect(parseSignedRequest(`${sig}.${forged}`, secret)).resolves.toBeNull();
  });

  it("refuses another algorithm, a missing user, junk, and an unset secret", async () => {
    await expect(parseSignedRequest(signed({ algorithm: "none", user_id: "777" }), secret)).resolves.toBeNull();
    await expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256" }), secret)).resolves.toBeNull();
    await expect(parseSignedRequest("junk", secret)).resolves.toBeNull();
    await expect(parseSignedRequest("", secret)).resolves.toBeNull();
    await expect(parseSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "777" }, ""), "")).resolves.toBeNull();
  });
});

describe("shapeAssets", () => {
  const assets = shapeAssets(fixture("accounts").data);

  it("lists a page and its linked Instagram account, and a page with none", () => {
    expect(assets).toEqual([
      { id: "104359362513119", platform: "facebook", name: "Acme Kenya", username: "AcmeKenya", avatar_url: "https://cdn.example.test/page.jpg", page_id: "104359362513119" },
      { id: "17841402777077586", platform: "instagram", name: "Acme Kenya IG", username: "acme.kenya", avatar_url: "https://cdn.example.test/ig.jpg", page_id: "104359362513119" },
      { id: "200000000000002", platform: "facebook", name: "Acme Foundation", username: null, avatar_url: "https://cdn.example.test/page2.jpg", page_id: "200000000000002" },
    ]);
  });

  it("gives nothing for an account with no pages", () => {
    expect(shapeAssets([])).toEqual([]);
    expect(shapeAssets(undefined)).toEqual([]);
  });

  it("never carries a token", () => {
    const withToken = [{ id: "1", name: "A", access_token: "secret", instagram_business_account: { id: "2", access_token: "secret" } }];
    expect(JSON.stringify(shapeAssets(withToken))).not.toContain("secret");
  });
});

describe("assetHandle and matchChannel", () => {
  const [page, ig, noName] = shapeAssets(fixture("accounts").data);
  const channel = (id: string, platform: string, handle: string, external_id: string | null = null) => ({ id, platform, handle, external_id });

  it("uses the username in lowercase, or the id when there is none", () => {
    expect(assetHandle(page)).toBe("acmekenya");
    expect(assetHandle(ig)).toBe("acme.kenya");
    expect(assetHandle(noName)).toBe("200000000000002");
  });

  it("finds an existing channel by its id on that platform", () => {
    expect(matchChannel(page, [channel("c1", "facebook", "old-name", "104359362513119")])).toBe("c1");
  });

  it("finds an existing channel by platform and handle, in any case", () => {
    expect(matchChannel(page, [channel("c1", "facebook", "acmekenya")])).toBe("c1");
    expect(matchChannel(ig, [channel("c2", "instagram", "acme.kenya")])).toBe("c2");
  });

  it("doesn't match the same handle on another platform", () => {
    expect(matchChannel(page, [channel("c1", "instagram", "acmekenya")])).toBeNull();
    expect(matchChannel(page, [channel("c1", "instagram", "x", "104359362513119")])).toBeNull();
  });

  it("gives null when nothing matches", () => {
    expect(matchChannel(page, [])).toBeNull();
  });
});

describe("Meta page and Instagram profile", () => {
  it("reads a page", () => {
    expect(mapMetaPage(fixture("page"))).toEqual({ external_id: "104359362513119", display_name: "Acme Kenya", avatar_url: "https://cdn.example.test/page.jpg", followers: 3200 });
  });

  it("reads an Instagram account", () => {
    expect(mapMetaInstagram(fixture("ig-user"))).toEqual({ external_id: "17841402777077586", display_name: "Acme Kenya IG", avatar_url: "https://cdn.example.test/ig.jpg", followers: 24555 });
  });
});

describe("mapMetaFacebookPost", () => {
  const [video, photo, words] = fixture("page-posts").data.map(mapMetaFacebookPost);

  it("keys a post the way the public source does, and keeps the full id for insights", () => {
    expect(video.external_id).toBe("1204545088344463");
    expect(video.graph_id).toBe("104359362513119_1204545088344463");
  });

  it("maps every column, with reach and views left for the insights call", () => {
    expect(video).toMatchObject({
      url: "https://www.facebook.com/reel/486651220706068/",
      posted_at: "2026-10-09T08:53:20.000Z",
      format: "video",
      caption: "A reel post",
      thumbnail_url: "https://cdn.example.test/fb1.jpg",
      metrics: { views: null, likes: 133, comments: 12, shares: 7, saves: null, reach: null, views_paid: null },
    });
  });

  it("knows a photo and words alone, and keeps a real 0", () => {
    expect(photo.format).toBe("photo");
    expect(photo.metrics.likes).toBe(0);
    expect(words.format).toBe("text");
  });

  it("leaves shares null when Meta gives none, since it leaves out a post with no shares", () => {
    expect(photo.metrics.shares).toBeNull();
  });
});

describe("parsePostInsights and parsePostViewsSplit", () => {
  it("reads views and unique views", () => {
    expect(parsePostInsights(fixture("post-insights"))).toEqual({ views: 1000, reach: 800 });
  });

  it("leaves what Meta didn't answer null, never 0", () => {
    expect(parsePostInsights({ data: [] })).toEqual({ views: null, reach: null });
    expect(parsePostInsights({})).toEqual({ views: null, reach: null });
  });

  it("reads paid views from the breakdown", () => {
    expect(parsePostViewsSplit(fixture("post-views-breakdown"))).toBe(200);
  });

  it("reads a breakdown with no paid row as 0, because Meta returns only non-zero rows", () => {
    const json = fixture("post-views-breakdown");
    json.data[0].total_value.breakdowns[0].results = [{ dimension_values: ["false"], value: 800 }];
    expect(parsePostViewsSplit(json)).toBe(0);
  });

  it("also reads a breakdown given as an object", () => {
    expect(parsePostViewsSplit({ data: [{ name: "post_media_view", values: [{ value: { true: 50, false: 950 } }] }] })).toBe(50);
  });

  it("gives null when no breakdown came back, rather than guessing 0", () => {
    expect(parsePostViewsSplit({ data: [] })).toBeNull();
    expect(parsePostViewsSplit({ data: [{ name: "post_media_view", values: [{ value: 1000 }] }] })).toBeNull();
  });
});

describe("mapMetaMedia and parseMediaInsights", () => {
  const [reel, photo, carousel] = fixture("ig-media").data.map(mapMetaMedia);

  it("keys a post by its shortcode, the same key as the public source", () => {
    expect(reel.external_id).toBe("DKSMEpKRd6h");
    expect(reel.graph_id).toBe("17900000000000001");
  });

  it("reads the shortcode from the link when Meta leaves it out", () => {
    expect(photo.external_id).toBe("DKSMEpKRd6i");
  });

  it("maps every column, with views and reach left for the insights call", () => {
    expect(reel).toMatchObject({
      url: "https://www.instagram.com/reel/DKSMEpKRd6h/",
      posted_at: "2026-10-09T08:53:20.000Z",
      format: "video",
      caption: "A reel",
      thumbnail_url: "https://cdn.example.test/igr.jpg",
      metrics: { views: null, likes: 29, comments: 7, shares: null, saves: null, reach: null, views_paid: null },
    });
  });

  it("knows a photo and a carousel, and uses the media link as the picture", () => {
    expect(photo.format).toBe("photo");
    expect(photo.thumbnail_url).toBe("https://cdn.example.test/igp.jpg");
    expect(carousel.format).toBe("carousel");
    expect(carousel.caption).toBeNull();
  });

  it("reads insights, keeping a real 0", () => {
    expect(parseMediaInsights(fixture("media-insights"))).toEqual({ views: 2647, reach: 2000, saves: 15, shares: 0 });
  });

  it("leaves an absent metric null, never 0", () => {
    expect(parseMediaInsights({ data: [{ name: "views", values: [{ value: 5 }] }] })).toEqual({ views: 5, reach: null, saves: null, shares: null });
    expect(parseMediaInsights({ data: [] })).toEqual({ views: null, reach: null, saves: null, shares: null });
  });

  it("also reads a metric given as a total", () => {
    expect(parseMediaInsights({ data: [{ name: "views", total_value: { value: 9 } }] }).views).toBe(9);
  });
});

describe("parseDemographics", () => {
  it("reads the breakdown's rows", () => {
    expect(parseDemographics(fixture("demographics"))).toEqual([{ key: "KE", value: 900 }, { key: "UG", value: 100 }]);
  });

  it("gives nothing when Meta gives nothing, as under 100 followers", () => {
    expect(parseDemographics({ data: [] })).toEqual([]);
  });
});

describe("normalisePostUrl and reconcilePosts", () => {
  it("makes two spellings of one link equal", () => {
    expect(normalisePostUrl("https://www.facebook.com/reel/486/?s=single_unit")).toBe("facebook.com/reel/486");
    expect(normalisePostUrl("https://m.facebook.com/reel/486/")).toBe("facebook.com/reel/486");
    expect(normalisePostUrl("https://WWW.Facebook.com/Acme/posts/pfbidAbC")).toBe("facebook.com/Acme/posts/pfbidAbC");
    expect(normalisePostUrl(null)).toBeNull();
    expect(normalisePostUrl("not a link")).toBeNull();
  });

  const row = (id: string, external_id: string, url: string | null) => ({ id, external_id, url });

  it("re-keys a stored post with the same link and another id, so a page's posts don't count twice", () => {
    expect(reconcilePosts([row("r1", "public-id", "https://www.facebook.com/reel/486/")], [{ external_id: "meta-id", url: "https://facebook.com/reel/486" }]))
      .toEqual([{ id: "r1", external_id: "meta-id" }]);
  });

  it("leaves a post with the same id alone", () => {
    expect(reconcilePosts([row("r1", "same", "https://facebook.com/reel/486")], [{ external_id: "same", url: "https://facebook.com/reel/486" }])).toEqual([]);
  });

  it("leaves posts with no link, or another link, alone", () => {
    expect(reconcilePosts([row("r1", "a", null)], [{ external_id: "b", url: null }])).toEqual([]);
    expect(reconcilePosts([row("r1", "a", "https://facebook.com/reel/1")], [{ external_id: "b", url: "https://facebook.com/reel/2" }])).toEqual([]);
  });

  it("doesn't re-key onto an id another stored post already has", () => {
    const existing = [row("r1", "old", "https://facebook.com/reel/1"), row("r2", "new", "https://facebook.com/reel/9")];
    expect(reconcilePosts(existing, [{ external_id: "new", url: "https://facebook.com/reel/1" }])).toEqual([]);
  });
});

describe("graphCall", () => {
  it("sends the token in a header, never in the address", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const answer = await graphCall("secret-token")("me", { fields: "id,name" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://graph.facebook.com/v26.0/me?fields=id%2Cname");
    expect(url).not.toContain("secret-token");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(answer).toEqual({ ok: true, json: { id: "1" } });
    vi.unstubAllGlobals();
  });

  it("hands back Meta's error, even on a 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: "expired" } }), { status: 400 })));
    expect(await graphCall("t")("me", {})).toMatchObject({ ok: false, error: { code: 190 } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 4 } }), { status: 200 })));
    expect(await graphCall("t")("me", {})).toMatchObject({ ok: false, error: { code: 4 } });
    vi.unstubAllGlobals();
  });

  it("copes with an answer that isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await graphCall("t")("me", {})).toMatchObject({ ok: false, json: null });
    vi.unstubAllGlobals();
  });
});

describe("listAccounts", () => {
  it("reads every page of accounts up to five", async () => {
    let n = 0;
    const graph = vi.fn(async () => { n++; return { ok: true, json: { data: [{ id: String(n) }], paging: { cursors: { after: `c${n}` }, next: "x" } } }; });
    const { rows, error } = await listAccounts(graph, "id");
    expect(rows).toHaveLength(5);
    expect(error).toBeNull();
    expect(graph.mock.calls[1]).toEqual(["me/accounts", { fields: "id", limit: "100", after: "c1" }]);
  });

  it("hands back an error from the first page", async () => {
    const graph = vi.fn(async () => ({ ok: false, json: null, error: { code: 200 } }));
    expect(await listAccounts(graph, "id")).toEqual({ rows: [], error: { code: 200 } });
  });
});
