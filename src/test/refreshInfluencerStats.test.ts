import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Edge functions can't run here, so this runs the real handler with Deno, the database and the network stood in for:
// what it calls, what it writes and what it logs are all real. The creators and handles are invented.
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const valueAt = (row: Row, path: string) => path.split(".").reduce<unknown>((v, key) => (v as Row | undefined)?.[key], row);

/** The parts of a Supabase client the handler uses, over plain arrays. Writes change the arrays, so tests read the result. */
function fakeDb(tables: Tables) {
  class Query {
    private tests: ((row: Row) => boolean)[] = [];
    private first = Infinity;
    private one = false;
    private change: Row | null = null;
    private adding: Row | null = null;
    constructor(private table: string) {}
    select() { return this; }
    in(col: string, values: unknown[]) { this.tests.push((r) => values.includes(valueAt(r, col))); return this; }
    eq(col: string, value: unknown) { this.tests.push((r) => valueAt(r, col) === value); return this; }
    gte(col: string, value: string) { this.tests.push((r) => Date.parse(String(valueAt(r, col))) >= Date.parse(value)); return this; }
    gt(col: string, value: string) { this.tests.push((r) => Date.parse(String(valueAt(r, col))) > Date.parse(value)); return this; }
    like(col: string, pattern: string) { this.tests.push((r) => String(valueAt(r, col)).startsWith(pattern.replace(/%$/, ""))); return this; }
    not(col: string) { this.tests.push((r) => valueAt(r, col) !== null && valueAt(r, col) !== undefined); return this; }
    order() { return this; }
    limit(n: number) { this.first = n; return this; }
    maybeSingle() { this.one = true; return this; }
    update(change: Row) { this.change = change; return this; }
    insert(row: Row) { this.adding = row; return this; }
    then(done: (result: { data: unknown; error: null }) => unknown) {
      const rows = (tables[this.table] ??= []);
      if (this.adding) rows.push({ created_at: new Date().toISOString(), ...this.adding });
      const hits = rows.filter((r) => this.tests.every((test) => test(r))).slice(0, this.first);
      if (this.change) hits.forEach((r) => Object.assign(r, this.change));
      return Promise.resolve({ data: this.one ? hits[0] ?? null : hits, error: null }).then(done);
    }
  }
  return {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: { _name: string; _seconds?: number }) => {
      const locks = (tables.job_locks ??= []);
      if (name === "release_job_lock") {
        tables.job_locks = locks.filter((l) => l.name !== args._name);
        return { data: null, error: null };
      }
      const held = locks.some((l) => l.name === args._name && Date.parse(String(l.locked_until)) > Date.now());
      if (!held) locks.push({ name: args._name, locked_until: new Date(Date.now() + (args._seconds ?? 0) * 1000).toISOString() });
      return { data: !held, error: null };
    },
  };
}

const state = vi.hoisted(() => ({
  db: null as unknown,
  caller: { kind: "job" } as Record<string, unknown>,
  handler: null as null | ((req: Request) => Promise<Response>),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2.45.0", () => ({ createClient: () => state.db }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ requireCaller: async () => state.caller }));

// The function runs on Deno, which has AbortSignal.timeout; jsdom's AbortSignal doesn't.
Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: () => new AbortController().signal });
vi.stubGlobal("Deno", {
  env: { get: (name: string) => (name === "SCRAPECREATORS_API_KEY" ? "test-key" : undefined) },
  serve: (handler: (req: Request) => Promise<Response>) => { state.handler = handler; },
});
// By a variable, so the type-check stays out of a file that only type-checks with Deno's imports.
const entry = "../../supabase/functions/refresh-influencer-stats/index";
await import(/* @vite-ignore */ entry);
afterAll(() => vi.unstubAllGlobals());

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `fixtures/scrapecreators/${name}.json`), "utf8"));

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const creator = (id: string, over: Row = {}): Row => ({
  id, handle: id, primary_platform: "tiktok", last_metrics_sync: null, agency_id: "agency-a", follower_count: 111, engagement_rate: 3.5, ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => creator(`creator${i}`));

let tables: Tables;
let providerCalls: string[];
let otherCalls: string[];
let scAnswer: (url: URL) => { status: number; json: unknown };

const live = (url: URL) => {
  const name = url.pathname.includes("tiktok") ? "tiktok-profile" : url.pathname.includes("instagram") ? "instagram-profile" : "facebook-profile";
  return { status: 200, json: { ...fixture(name), credits_remaining: 5000 } };
};

beforeEach(() => {
  tables = { influencers: [], scraper_credit_log: [], job_locks: [], instagram_accounts: [], facebook_accounts: [], tiktok_accounts: [], campaign_influencers: [], user_roles: [] };
  state.db = fakeDb(tables);
  state.caller = { kind: "job" };
  providerCalls = [];
  otherCalls = [];
  scAnswer = live;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "api.scrapecreators.com") {
      providerCalls.push(url.pathname + url.search);
      const { status, json } = scAnswer(url);
      return new Response(JSON.stringify(json), { status });
    }
    otherCalls.push(url.hostname);
    if (url.hostname === "graph.facebook.com") {
      return new Response(JSON.stringify(url.pathname.endsWith("/media") ? { data: [{ like_count: 90, comments_count: 10 }] } : { username: "connected", followers_count: 2000 }));
    }
    return new Response("{}", { status: 500 });
  }));
});

const run = async (body: Row = { limit: 150, stale_hours: 20 }) => {
  const response = await state.handler!(new Request("https://example.test/refresh", { method: "POST", body: JSON.stringify(body) }));
  return response.json();
};
const byId = (id: string) => tables.influencers.find((r) => r.id === id)!;
const spentToday = () => tables.scraper_credit_log.filter((l) => l.context === "influencer_stats").reduce((sum, l) => sum + Number(l.credits), 0);

describe("refresh-influencer-stats: a night's run", () => {
  it("writes each platform's follower number from ScrapeCreators", async () => {
    tables.influencers.push(
      creator("tt"),
      creator("ig", { primary_platform: "instagram" }),
      creator("fb", { primary_platform: "facebook" }),
    );
    const result = await run();
    expect(byId("tt").follower_count).toBe(4100);
    expect(byId("ig").follower_count).toBe(24555);
    expect(byId("fb").follower_count).toBe(3200);
    expect(result).toMatchObject({ ok: true, checked: 3, updated: 3 });
  });

  it("stamps a refreshed creator, and leaves one with no number unstamped", async () => {
    tables.influencers.push(creator("good"), creator("dead"));
    scAnswer = (url) => (url.search.includes("dead") ? { status: 404, json: { success: false } } : live(url));
    await run();
    expect(Date.parse(String(byId("good").last_metrics_sync))).toBeGreaterThan(Date.now() - 60_000);
    expect(byId("dead").last_metrics_sync).toBeNull();
    expect(byId("dead").follower_count).toBe(111);
  });

  it("writes the rate where the source measures it, and keeps the stored rate where it doesn't", async () => {
    tables.influencers.push(creator("tt"), creator("fb", { primary_platform: "facebook" }));
    await run();
    expect(byId("tt").engagement_rate).toBe(232.2);
    expect(byId("fb").engagement_rate).toBe(3.5);
  });

  it("dates a cached answer by when it was read, so the screen doesn't claim it's newer", async () => {
    tables.influencers.push(creator("tt"));
    scAnswer = (url) => ({ status: 200, json: { ...(live(url).json as object), credits_charged: 0, cached: true, cached_at: "2026-11-01T06:00:00Z" } });
    await run();
    expect(byId("tt").last_metrics_sync).toBe("2026-11-01T06:00:00.000Z");
  });

  it("makes no call for a creator whose handle is a name, or on a platform with no route", async () => {
    tables.influencers.push(creator("name", { handle: "Jane Doe" }), creator("yt", { primary_platform: "youtube" }), creator("none", { handle: null }));
    const result = await run();
    expect(providerCalls).toEqual([]);
    expect(result).toMatchObject({ checked: 0, updated: 0 });
  });

  it("leaves a creator looked up in the last fortnight alone, and says so", async () => {
    tables.influencers.push(creator("recent", { last_metrics_sync: daysAgo(5) }));
    const result = await run();
    expect(providerCalls).toEqual([]);
    expect(result.note).toMatch(/fortnight/);
  });

  it("no longer calls the suspended providers", async () => {
    tables.influencers.push(creator("tt"), creator("dead"));
    scAnswer = (url) => (url.search.includes("dead") ? { status: 500, json: {} } : live(url));
    await run();
    expect(otherCalls.filter((host) => /apify|ensembledata/.test(host))).toEqual([]);
  });
});

describe("refresh-influencer-stats: the daily cap", () => {
  it("stops at 40 paid lookups however many are due", async () => {
    tables.influencers.push(...many(60));
    const result = await run();
    expect(providerCalls).toHaveLength(40);
    expect(result.updated).toBe(40);
    expect(result.note).toMatch(/tomorrow/);
  });

  it("logs what it spent, with the balance, under its own context", async () => {
    tables.influencers.push(...many(7));
    await run();
    expect(spentToday()).toBe(7);
    expect(tables.scraper_credit_log.every((l) => l.provider === "scrapecreators" && l.credits_remaining === 5000)).toBe(true);
  });

  it("spends only what's left of today's credits", async () => {
    tables.influencers.push(...many(10));
    tables.scraper_credit_log.push({ provider: "scrapecreators", context: "influencer_stats", credits: 38, credits_remaining: 5000, created_at: new Date().toISOString() });
    await run();
    expect(providerCalls).toHaveLength(2);
    expect(spentToday()).toBe(40);
  });

  it("holds across runs: a second run the same day spends nothing", async () => {
    tables.influencers.push(...many(60));
    await run();
    providerCalls.length = 0;
    await run();
    expect(providerCalls).toEqual([]);
  });

  it("starts again the next day", async () => {
    tables.influencers.push(...many(10));
    tables.scraper_credit_log.push({ provider: "scrapecreators", context: "influencer_stats", credits: 40, credits_remaining: 5000, created_at: daysAgo(2) });
    await run();
    expect(providerCalls).toHaveLength(10);
  });

  it("doesn't count what other jobs spent against this job's credits", async () => {
    tables.influencers.push(...many(3));
    tables.scraper_credit_log.push({ provider: "scrapecreators", context: "listening:agency-a", credits: 400, credits_remaining: null, created_at: new Date().toISOString() });
    await run();
    expect(providerCalls).toHaveLength(3);
  });

  it("can't be pushed past the cap by the roster's Refresh button", async () => {
    tables.influencers.push(...many(60), creator("recent", { last_metrics_sync: daysAgo(5) }));
    state.caller = { kind: "user", userId: "someone", roles: ["super_admin"], isSuperAdmin: true };
    await run({ force: true, limit: 200 });
    expect(providerCalls).toHaveLength(40);
    expect(providerCalls.filter((path) => path.includes("recent"))).toEqual([]);
  });

  it("spends nothing while the last balance seen is under the floor, and says why", async () => {
    tables.influencers.push(...many(3));
    tables.scraper_credit_log.push({ provider: "scrapecreators", context: "campaign_refresh", credits: 5, credits_remaining: 499, created_at: new Date().toISOString() });
    const result = await run();
    expect(providerCalls).toEqual([]);
    expect(result.note).toMatch(/balance/);
  });

  it("stops when the provider says the account is empty, and doesn't mark anyone as gone", async () => {
    tables.influencers.push(...many(12));
    scAnswer = () => ({ status: 402, json: { success: false, message: "Gotta purchase more credits" } });
    const result = await run();
    expect(providerCalls).toHaveLength(5);
    expect(tables.job_locks.filter((l) => String(l.name).startsWith("influencer-gone:"))).toEqual([]);
    expect(result.note).toMatch(/out of credits/);
  });

  it("runs one at a time, and gives the lock back", async () => {
    tables.influencers.push(creator("tt"));
    tables.job_locks.push({ name: "refresh-influencer-stats", locked_until: new Date(Date.now() + 60_000).toISOString() });
    const blocked = await run();
    expect(providerCalls).toEqual([]);
    expect(blocked.note).toMatch(/running/);

    tables.job_locks = [];
    await run();
    expect(providerCalls).toHaveLength(1);
    expect(tables.job_locks.filter((l) => l.name === "refresh-influencer-stats")).toEqual([]);
  });
});

describe("refresh-influencer-stats: dead handles", () => {
  const goneAnswer = (url: URL) => (url.search.includes("dead") ? { status: 200, json: { success: true, credits_charged: 1, credits_remaining: 5000, accountDoesNotExist: true } } : live(url));

  it("puts a handle the provider can't find on a wait, so the next run spends nothing on it", async () => {
    tables.influencers.push(creator("dead"));
    scAnswer = goneAnswer;
    await run();
    expect(providerCalls).toHaveLength(1);
    await run();
    expect(providerCalls).toHaveLength(1);
  });

  it("looks up a corrected handle on the next run", async () => {
    tables.influencers.push(creator("dead"));
    scAnswer = goneAnswer;
    await run();
    byId("dead").handle = "fixed";
    await run();
    expect(providerCalls).toHaveLength(2);
    expect(byId("dead").follower_count).toBe(4100);
  });

  it("doesn't put a handle on a wait for a passing provider error", async () => {
    tables.influencers.push(creator("flaky"));
    scAnswer = () => ({ status: 500, json: {} });
    await run();
    scAnswer = live;
    await run();
    expect(byId("flaky").follower_count).toBe(4100);
  });

  it("can't let dead handles starve the rest of the roster", async () => {
    tables.influencers.push(...Array.from({ length: 40 }, (_, i) => creator(`dead${i}`)), creator("good"));
    scAnswer = goneAnswer;
    await run();
    expect(byId("good").follower_count).toBe(111); // the first day's credits went on the dead handles
    tables.scraper_credit_log.forEach((l) => { l.created_at = daysAgo(1); });
    await run();
    expect(byId("good").follower_count).toBe(4100);
  });
});

describe("refresh-influencer-stats: who goes first", () => {
  it("looks up creators on a live campaign first", async () => {
    tables.influencers.push(...many(45), creator("onlive", { last_metrics_sync: daysAgo(100) }));
    tables.campaign_influencers.push({ influencer_id: "onlive", campaigns: { status: "live" } }, { influencer_id: "creator0", campaigns: { status: "draft" } });
    await run();
    expect(providerCalls[0]).toContain("onlive");
  });
});

describe("refresh-influencer-stats: connected creators", () => {
  const connect = (id: string) => tables.instagram_accounts.push({ influencer_id: id, ig_user_id: "1", page_access_token: "t" });

  it("refreshes them from their own account, for free", async () => {
    tables.influencers.push(creator("conn", { primary_platform: "instagram" }));
    connect("conn");
    const result = await run();
    expect(byId("conn").follower_count).toBe(2000);
    expect(byId("conn").engagement_rate).toBe(5);
    expect(providerCalls).toEqual([]);
    expect(spentToday()).toBe(0);
    expect(result).toMatchObject({ checked: 1, updated: 1 });
  });

  it("still refreshes them when today's credits are gone", async () => {
    tables.influencers.push(creator("conn", { primary_platform: "instagram" }));
    connect("conn");
    tables.scraper_credit_log.push({ provider: "scrapecreators", context: "influencer_stats", credits: 40, credits_remaining: 5000, created_at: new Date().toISOString() });
    await run();
    expect(byId("conn").follower_count).toBe(2000);
  });

  it("skips one refreshed in the last 20 hours unless forced", async () => {
    tables.influencers.push(creator("conn", { primary_platform: "instagram", last_metrics_sync: new Date(Date.now() - 3_600_000).toISOString() }));
    connect("conn");
    await run();
    expect(otherCalls).toEqual([]);
    await run({ force: true });
    expect(otherCalls).toContain("graph.facebook.com");
  });

  it("falls back to a paid lookup only when their numbers are over a fortnight old", async () => {
    const failing = () => new Response(JSON.stringify({ error: { message: "expired" } }), { status: 400 });
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => (new URL(input).hostname === "graph.facebook.com" ? failing() : realFetch(input))));
    tables.influencers.push(
      creator("expired-recent", { primary_platform: "instagram", last_metrics_sync: daysAgo(3) }),
      creator("expired-old", { primary_platform: "instagram", last_metrics_sync: daysAgo(30) }),
    );
    connect("expired-recent");
    connect("expired-old");
    const result = await run();
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toContain("expired-old");
    expect(result).toMatchObject({ checked: 2, updated: 1 });
  });
});

describe("refresh-influencer-stats: whose roster", () => {
  beforeEach(() => {
    tables.influencers.push(creator("ours", { agency_id: "agency-a" }), creator("theirs", { agency_id: "agency-b" }));
    tables.user_roles.push({ user_id: "staff", agency_id: "agency-a", role: "agency_admin" });
  });

  it("limits a staff member's press to their own agency, so they neither spend on nor see another's creators", async () => {
    state.caller = { kind: "user", userId: "staff", roles: ["agency_admin"], isSuperAdmin: false };
    const result = await run({ force: true, limit: 200 });
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toContain("ours");
    expect(JSON.stringify(result.results)).not.toContain("theirs");
  });

  it("stops a staff member asking for another agency's creator by id", async () => {
    state.caller = { kind: "user", userId: "staff", roles: ["agency_admin"], isSuperAdmin: false };
    await run({ influencer_ids: ["theirs"] });
    expect(providerCalls).toEqual([]);
  });

  it("leaves a super admin and the nightly job free to go across agencies", async () => {
    state.caller = { kind: "user", userId: "boss", roles: ["super_admin"], isSuperAdmin: true };
    await run();
    expect(providerCalls).toHaveLength(2);
    providerCalls.length = 0;
    tables.influencers.forEach((r) => { r.last_metrics_sync = null; });
    tables.scraper_credit_log = [];
    state.caller = { kind: "job" };
    await run();
    expect(providerCalls).toHaveLength(2);
  });
});

describe("the roster page's Refresh button", () => {
  it("shows why a press stopped short", () => {
    const page = readFileSync(resolve(__dirname, "../pages/app/Influencers.tsx"), "utf8");
    expect(page).toMatch(/toast\.success\(`Refreshed \$\{data\?\.updated[^]*?data\?\.note/);
  });
});
