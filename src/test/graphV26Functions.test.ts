import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Edge functions can't run here, so this runs the nine real handlers that read Meta, with Deno, the database and the network
// stood in for. What they ask Meta for is real. What Meta answers is shaped from its docs, not from a live call.
type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as { table: string; kind: string; row: Record<string, unknown> }[],
  handlers: {} as Record<string, (req: Request) => Promise<Response>>,
  loading: "",
  // A Supabase client that doesn't filter: each test holds only the rows its handler should see, and reads what was written.
  client: () => ({
    from(table: string) {
      let one = false;
      const query: object = new Proxy({}, {
        get(_, method: string) {
          if (method === "then") {
            return (done: (r: unknown) => unknown) => {
              const rows = state.tables[table] ?? [];
              return Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(done);
            };
          }
          if (method === "single" || method === "maybeSingle") return () => { one = true; return query; };
          if (method === "insert" || method === "update" || method === "upsert") {
            return (row: Record<string, unknown>) => { state.writes.push({ table, kind: method, row }); return query; };
          }
          return () => query;
        },
      });
      return query;
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: async () => ({ data: true, error: null }),
  }),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2.45.0", () => ({ createClient: state.client }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.95.0", () => ({ createClient: state.client }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.95.0/cors", () => ({ corsHeaders: {} }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  SUPER_ADMIN: ["super_admin"],
  requireCaller: async () => ({ kind: "job" }),
  canManageContest: async () => true,
  canManageCampaign: async () => true,
  denied: (status: number, error: string) => new Response(JSON.stringify({ error }), { status }),
}));

const ENV: Record<string, string> = {
  META_APP_ID: "1234567", META_APP_SECRET: "app-secret-for-tests",
  SUPABASE_URL: "https://project.example.test", SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests", APP_ORIGIN: "https://app.example.test",
};
vi.stubGlobal("Deno", {
  env: { get: (name: string) => ENV[name] },
  serve: (handler: (req: Request) => Promise<Response>) => { state.handlers[state.loading] = handler; },
});
afterAll(() => vi.unstubAllGlobals());

const load = async (name: string) => {
  state.loading = name;
  await import(`../../supabase/functions/${name}/index.ts`);
  return state.handlers[name];
};
const post = (body: Row = {}) => new Request("https://fn.example.test/", { method: "POST", body: JSON.stringify(body) });

type Answer = Row | ((url: URL) => Row);
let calls: { url: URL; authorization: string | null }[] = [];

/** A stand-in for Meta. Each path answers from `routes`, by the part after the version. Anything else is an error, as Meta would. */
function meta(routes: Record<string, Answer>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    const route = routes[url.pathname.replace(/^\/v\d+\.\d+\//, "")];
    const answer = typeof route === "function" ? route(url) : route ?? { error: { code: 803, message: "Unknown path" } };
    return new Response(JSON.stringify(answer), { status: answer.error ? 400 : 200 });
  }));
}

const pathsAsked = () => calls.map(({ url }) => url.pathname);
const asked = (path: string) => calls.filter(({ url }) => url.pathname === `/v26.0/${path}`).map(({ url }) => Object.fromEntries(url.searchParams));

/** Everything a function sent Meta used this version and kept the account's token out of the address. */
function expectV26WithTokenInHeader(token: string) {
  expect(calls.length).toBeGreaterThan(0);
  for (const { url, authorization } of calls) {
    expect(url.pathname).toMatch(/^\/v26\.0\//);
    expect(url.toString()).not.toContain(token);
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(authorization).toBe(`Bearer ${token}`);
  }
}

const writesTo = (table: string) => state.writes.filter((w) => w.table === table);

beforeEach(() => {
  state.tables = {};
  state.writes = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("one Graph version", () => {
  const FUNCTIONS = resolve(__dirname, "../../supabase/functions");
  // meta-graph.ts is the one place it's allowed. The other isn't moved yet: Meta already answers its v20.0 calls as v21.0, and
  // its two oEmbed reads look for a field Meta removed.
  const ALLOWED = new Set(["_shared/meta-graph.ts", "resolve-post-thumbnail/index.ts"]);

  it("is pinned nowhere but _shared/meta-graph.ts", () => {
    const files = readdirSync(FUNCTIONS, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && !ALLOWED.has(f));
    // In an address, or in a constant such as const VERSION = "v21.0".
    const pinned = files.filter((f) => /facebook\.com\/v\d+\.\d+|["'`]v\d+\.\d+["'`]/.test(readFileSync(resolve(FUNCTIONS, f), "utf8")));
    expect(pinned).toEqual([]);
  });
});

describe("the login addresses", () => {
  // Facebook: without pages_read_user_content Meta refuses a Page's reaction and comment counts ("(#10) This endpoint
  // requires the 'pages_read_user_content' permission", seen on a brand's page on 12 Nov 2026), and read_insights is
  // what a Page's post insights need.
  it.each(["facebook", "instagram"])("%s-oauth-start sends the person to the v26.0 dialog, with the scopes its reads need", async (platform) => {
    const handler = await load(`${platform}-oauth-start`);
    const res = await handler(new Request("https://fn.example.test/?influencer_id=creator-1"));
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(to.searchParams.get("redirect_uri")).toBe(`https://project.example.test/functions/v1/${platform}-oauth-callback`);
    expect(to.searchParams.get("scope")).toBe(platform === "facebook"
      ? "public_profile,email,pages_show_list,pages_read_engagement,pages_read_user_content,read_insights,business_management"
      : "public_profile,pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights");
  });
});

describe("the login callbacks", () => {
  const SWAPS = {
    "oauth/access_token": (url: URL) => (url.searchParams.get("grant_type") === "fb_exchange_token"
      ? { access_token: "long-user-token", expires_in: 5184000 }
      : { access_token: "short-user-token" }),
  };

  /** The token swaps take the app secret in the address, which is how Meta documents them. Everything after them must not. */
  const expectSwapsThenHeader = () => {
    const swaps = asked("oauth/access_token");
    expect(swaps).toHaveLength(2);
    expect(swaps[0]).toMatchObject({ client_id: "1234567", client_secret: "app-secret-for-tests", code: "the-code" });
    expect(swaps[1]).toMatchObject({ grant_type: "fb_exchange_token", fb_exchange_token: "short-user-token" });
    const rest = calls.filter(({ url }) => !url.pathname.endsWith("/oauth/access_token"));
    expect(rest.map(({ url }) => url.pathname)).toEqual(["/v26.0/me/accounts"]);
    expect(rest[0].authorization).toBe("Bearer long-user-token");
    expect(rest[0].url.toString()).not.toContain("long-user-token");
  };

  it("facebook-oauth-callback stores the first page the login shared", async () => {
    state.tables.facebook_oauth_states = [{ state: "s1", influencer_id: "creator-1" }];
    meta({ ...SWAPS, "me/accounts": { data: [{ id: "page-1", name: "A Page", username: "apage", access_token: "page-token", category: "Food" }] } });
    const handler = await load("facebook-oauth-callback");
    const res = await handler(new Request("https://fn.example.test/?code=the-code&state=s1"));

    expect(res.headers.get("location")).toBe("https://app.example.test/connect/facebook/done?status=ok");
    expectSwapsThenHeader();
    expect(asked("me/accounts")[0].fields).toBe("id,name,username,access_token,picture{url},category");
    expect(writesTo("facebook_accounts")[0].row).toMatchObject({ influencer_id: "creator-1", page_id: "page-1", page_access_token: "page-token", user_access_token: "long-user-token" });
  });

  it("instagram-oauth-callback stores the first page with a business account", async () => {
    state.tables.instagram_oauth_states = [{ state: "s1", influencer_id: "creator-1" }];
    meta({
      ...SWAPS,
      "me/accounts": { data: [
        { id: "page-0", name: "No Instagram" },
        { id: "page-1", name: "A Page", access_token: "page-token", instagram_business_account: { id: "ig-1", username: "acreator", name: "A Creator" } },
      ] },
    });
    const handler = await load("instagram-oauth-callback");
    const res = await handler(new Request("https://fn.example.test/?code=the-code&state=s1"));

    expect(res.headers.get("location")).toBe("https://app.example.test/connect/instagram/done?status=ok");
    expectSwapsThenHeader();
    expect(asked("me/accounts")[0].fields).toBe("id,name,access_token,instagram_business_account{id,username,name,profile_picture_url},connected_instagram_account{id,username}");
    expect(writesTo("instagram_accounts")[0].row).toMatchObject({ influencer_id: "creator-1", ig_user_id: "ig-1", username: "acreator", page_access_token: "page-token" });
  });

  it("still ends on the error page when the page list is refused", async () => {
    state.tables.facebook_oauth_states = [{ state: "s1", influencer_id: "creator-1" }];
    meta({ ...SWAPS, "me/accounts": { error: { code: 10, message: "Permission denied" } } });
    const handler = await load("facebook-oauth-callback");
    const res = await handler(new Request("https://fn.example.test/?code=the-code&state=s1"));

    expect(res.headers.get("location")).toBe("https://app.example.test/connect/facebook/done?status=error&reason=pages_permission");
    expect(writesTo("facebook_accounts")).toEqual([]);
  });
});

describe("contest-discover-posts", () => {
  const contest = () => {
    state.tables.contests = [{ id: "contest-1", hashtag: "#OurContest", campaigns: null }];
    state.tables.instagram_accounts = [{ ig_user_id: "ig-1", page_access_token: "page-token", username: "acreator" }];
    state.tables.contestant_sync_runs = [{ id: "run-1" }];
  };

  it("looks the hashtag up on v26.0 with the token in a header", async () => {
    contest();
    meta({
      ig_hashtag_search: { data: [{ id: "tag-1" }] },
      "tag-1/recent_media": { data: [] },
      "tag-1/top_media": { data: [] },
    });
    const handler = await load("contest-discover-posts");
    await handler(post({ contest_id: "contest-1" }));

    expectV26WithTokenInHeader("page-token");
    expect(pathsAsked()).toEqual(["/v26.0/ig_hashtag_search", "/v26.0/tag-1/recent_media", "/v26.0/tag-1/top_media"]);
    expect(asked("ig_hashtag_search")[0]).toEqual({ user_id: "ig-1", q: "OurContest" });
    expect(asked("tag-1/recent_media")[0].user_id).toBe("ig-1");
  });

  it("reports Meta's refusal as today and adds no entries", async () => {
    contest();
    const refused = { error: { code: 100, message: "(#100) Please read documentation for supported fields." } };
    meta({ ig_hashtag_search: { data: [{ id: "tag-1" }] }, "tag-1/recent_media": refused, "tag-1/top_media": refused });
    const handler = await load("contest-discover-posts");
    const res = await handler(post({ contest_id: "contest-1" }));
    const body = await res.json();

    expect(body.errors).toContainEqual({ source: "instagram", tag: "OurContest", endpoint: "recent_media", msg: refused.error.message });
    expect(writesTo("contest_entries")).toEqual([]);
  });

  it("keeps the token out of the run log when the network fails, because Deno's error message quotes the whole address", async () => {
    contest();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => { throw new Error(`error sending request for url (${input})`); }));
    const handler = await load("contest-discover-posts");
    const res = await handler(post({ contest_id: "contest-1" }));

    expect(JSON.stringify(await res.json())).not.toContain("page-token");
    expect(JSON.stringify(writesTo("contestant_sync_runs"))).not.toContain("page-token");
  });
});

describe("contest-refresh-metrics-meta", () => {
  it("reads Instagram through business discovery and Facebook by post id, each with its own token in a header", async () => {
    state.tables.instagram_accounts = [{ ig_user_id: "ig-1", page_access_token: "viewer-token", username: "aviewer" }];
    state.tables.facebook_accounts = [{ page_id: "111", page_username: "apage", page_access_token: "page-token" }];
    state.tables.contest_entries = [
      { id: "e-ig", platform: "instagram", post_url: "https://www.instagram.com/p/ABC123/", handle: "acreator" },
      { id: "e-fb", platform: "facebook", post_url: "https://www.facebook.com/apage/posts/1234567", handle: "apage" },
    ];
    meta({
      "ig-1": { business_discovery: { media: { data: [{ shortcode: "ABC123", like_count: 9, comments_count: 2 }] } } },
      apage: { id: "111" },
      "111_1234567": { reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 3 } }, shares: { count: 1 } },
    });
    const handler = await load("contest-refresh-metrics-meta");
    const res = await handler(post({ contest_id: "contest-1" }));
    const body = await res.json();

    expect(body).toMatchObject({ total: 2, updated: 2, failed: 0 });
    for (const { url, authorization } of calls) {
      expect(url.pathname).toMatch(/^\/v26\.0\//);
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(authorization).toBe(url.pathname === "/v26.0/ig-1" ? "Bearer viewer-token" : "Bearer page-token");
    }
    expect(asked("ig-1")[0].fields).toContain("business_discovery.username(acreator){media.limit(50){shortcode,");
    expect(writesTo("contest_entries").map((w) => w.row)).toEqual(expect.arrayContaining([
      expect.objectContaining({ likes: 9, comments: 2, source: "meta_graph" }),
      expect.objectContaining({ likes: 5, comments: 3, shares: 1, source: "meta_graph" }),
    ]));
  });

  it("gives Meta's refusal back as the entry's error, without the token", async () => {
    state.tables.instagram_accounts = [{ ig_user_id: "ig-1", page_access_token: "viewer-token", username: "aviewer" }];
    state.tables.contest_entries = [{ id: "e-ig", platform: "instagram", post_url: "https://www.instagram.com/p/ABC123/", handle: "acreator" }];
    meta({ "ig-1": { error: { code: 110, message: "Cannot find user" } } });
    const handler = await load("contest-refresh-metrics-meta");
    const text = await (await handler(post({ contest_id: "contest-1" }))).text();

    expect(JSON.parse(text)).toMatchObject({ updated: 0, failed: 1 });
    expect(text).toContain("Cannot find user");
    expect(text).not.toContain("viewer-token");
  });

  it("gives a Page's refused reaction and comment counts back as the entry's error, and writes no zeros over its numbers", async () => {
    state.tables.facebook_accounts = [{ page_id: "111", page_username: "apage", page_access_token: "page-token" }];
    state.tables.contest_entries = [{ id: "e-fb", platform: "facebook", post_url: "https://www.facebook.com/apage/posts/1234567", handle: "apage", likes: 12, comments: 4 }];
    meta({
      apage: { id: "111" },
      "111_1234567": { error: { code: 10, type: "OAuthException", message: "(#10) This endpoint requires the 'pages_read_user_content' permission or the 'Page Public Content Access' feature" } },
    });
    const handler = await load("contest-refresh-metrics-meta");
    const text = await (await handler(post({ contest_id: "contest-1" }))).text();

    expect(JSON.parse(text)).toMatchObject({ updated: 0, failed: 1 });
    expect(text).toContain("pages_read_user_content");
    expect(text).not.toContain("page-token");
    expect(writesTo("contest_entries")).toEqual([]);
  });
});

describe("ig-insights-test", () => {
  it("asks for no metric Meta removed, on v26.0, with the token in a header", async () => {
    state.tables.instagram_accounts = [{ ig_user_id: "ig-1", username: "acreator", page_access_token: "page-token", scope: "x" }];
    meta({ "ig-1/insights": { data: [] }, "ig-1/media": { data: [{ id: "m1" }] }, "m1/insights": { data: [] } });
    const handler = await load("ig-insights-test");
    const text = await (await handler(post())).text();

    expectV26WithTokenInHeader("page-token");
    expect(text).not.toContain("page-token");
    const account = asked("ig-1/insights");
    expect(account.map((q) => q.metric)).toEqual(["views,accounts_engaged", "reach", "follower_count", "follower_demographics"]);
    expect(account.map((q) => q.period)).toEqual(["day", "day", "day", "lifetime"]);
    expect(account[3]).toMatchObject({ timeframe: "this_month", metric_type: "total_value", breakdown: "country" });
    expect(asked("m1/insights")[0].metric).toBe("reach,likes,comments,shares,saved");
  });
});

describe("refresh-influencer-stats", () => {
  it("reads connected accounts on v26.0, with the same fields and the token in a header", async () => {
    state.tables.influencers = [{ id: "creator-1", handle: "acreator", primary_platform: "instagram", last_metrics_sync: null }];
    state.tables.instagram_accounts = [{ influencer_id: "creator-1", ig_user_id: "ig-1", page_access_token: "page-token" }];
    state.tables.facebook_accounts = [{ influencer_id: "creator-1", page_id: "page-1", page_access_token: "page-token" }];
    meta({
      "ig-1": { username: "acreator", followers_count: 1000 },
      "ig-1/media": { data: [{ like_count: 90, comments_count: 10 }] },
      "page-1": { username: "apage", followers_count: 500, fan_count: 400 },
      "page-1/posts": { data: [{ likes: { summary: { total_count: 40 } }, comments: { summary: { total_count: 5 } }, shares: { count: 5 } }] },
    });
    const handler = await load("refresh-influencer-stats");
    await handler(post({ influencer_ids: ["creator-1"] }));

    expectV26WithTokenInHeader("page-token");
    expect(asked("ig-1")[0]).toEqual({ fields: "username,followers_count" });
    expect(asked("ig-1/media")[0]).toEqual({ fields: "like_count,comments_count", limit: "12" });
    expect(asked("page-1")[0]).toEqual({ fields: "username,followers_count,fan_count" });
    expect(asked("page-1/posts")[0]).toEqual({ fields: "likes.summary(true),comments.summary(true),shares", limit: "12" });
    expect(writesTo("influencers")[0].row).toMatchObject({ follower_count: 1000 });
  });
});

describe("stories-sync", () => {
  const navigation = JSON.parse(readFileSync(resolve(__dirname, "fixtures/meta/story-navigation.docs.json"), "utf8"));
  const totals = JSON.parse(readFileSync(resolve(__dirname, "fixtures/meta/story-insights.docs.json"), "utf8"));
  const connected = () => {
    state.tables.campaign_influencers = [{ campaign_id: "campaign-1", influencer_id: "creator-1" }];
    state.tables.instagram_accounts = [{ influencer_id: "creator-1", ig_user_id: "ig-1", page_access_token: "page-token", username: "acreator" }];
  };
  const insights = (url: URL) => (url.searchParams.get("breakdown") ? navigation : totals);

  it("asks for the metrics that replaced impressions, exits and taps, and saves them in the existing columns", async () => {
    connected();
    meta({ "ig-1/stories": { data: [{ id: "s1", timestamp: "2026-11-01T08:00:00+0000" }] }, "s1/insights": insights });
    const handler = await load("stories-sync");
    await handler(post({ campaign_id: "campaign-1" }));

    expectV26WithTokenInHeader("page-token");
    expect(asked("s1/insights")).toEqual([
      { metric: "views,reach,replies" },
      { metric: "navigation", breakdown: "story_navigation_action_type" },
    ]);
    expect(writesTo("stories")[0].row).toMatchObject({
      campaign_id: "campaign-1", external_id: "s1", source: "instagram_api",
      impressions: 310, reach: 240, replies: 0, taps_forward: 19, taps_back: 4, exits: 1,
    });
  });

  it("still saves a story too small for Meta to share its numbers, with the numbers empty", async () => {
    connected();
    meta({
      "ig-1/stories": { data: [{ id: "s1", timestamp: "2026-11-01T08:00:00+0000" }] },
      "s1/insights": { error: { code: 10, message: "(#10) Not enough viewers for the media to show insights" } },
    });
    const handler = await load("stories-sync");
    await handler(post({ campaign_id: "campaign-1" }));

    expect(writesTo("stories")[0].row).toMatchObject({ external_id: "s1", impressions: null, reach: null, replies: null, taps_forward: null, taps_back: null, exits: null });
  });

  it("reports a refused story list against that account, without the token", async () => {
    connected();
    meta({ "ig-1/stories": { error: { code: 190, message: "Session has expired" } } });
    const handler = await load("stories-sync");
    const text = await (await handler(post({ campaign_id: "campaign-1" }))).text();

    expect(JSON.parse(text).results[0]).toMatchObject({ account: "acreator", ok: false });
    expect(text).toContain("Session has expired");
    expect(text).not.toContain("page-token");
  });
});
