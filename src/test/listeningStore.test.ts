import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clip } from "../../supabase/functions/_shared/clip";
import { type MentionRow, storeMentions } from "../../supabase/functions/_shared/listening-store";

// A Listening scan stored nothing when one post's text held half an emoji. Cutting a caption with .slice() can split
// an emoji's two UTF-16 halves; supabase-js then sends the lone half as "\ud83d", and Postgres refuses the whole batch
// with "invalid input syntax for type json" (a NUL character fails the batch too, as "unsupported Unicode escape
// sequence"). Both messages were reproduced on the live database with json_populate_recordset, the parse PostgREST
// runs for an insert. These tests run the real search readers and the real listening-sweep handler, with Deno,
// ScrapeCreators and the database stood in. The stand-in database refuses text the way Postgres does.

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  /** Why Postgres would refuse this row's text, judged by V8's own check rather than by the code under test. */
  const textRefusal = (row: Record<string, unknown>): string | null => {
    for (const v of Object.values(row)) {
      if (typeof v !== "string") continue;
      if (!(v as unknown as { isWellFormed(): boolean }).isWellFormed()) return "invalid input syntax for type json";
      if (v.includes("\u0000")) return "unsupported Unicode escape sequence";
    }
    return null;
  };
  const state = {
    topics: [] as Record<string, unknown>[],
    /** Rows the database took, in order. */
    mentions: [] as Record<string, unknown>[],
    topicUpdates: [] as Record<string, unknown>[],
    /** A post the database refuses for a reason other than its text, such as a constraint. */
    refuseUrl: "",
  };
  // One statement takes all its rows or none, as in Postgres.
  const answer = (table: string, op: string, payload: unknown) => {
    if (table === "listening_mentions" && op === "upsert") {
      const rows = payload as Record<string, unknown>[];
      for (const row of rows) {
        const why = row.url === state.refuseUrl ? 'new row for relation "listening_mentions" violates check constraint' : textRefusal(row);
        if (why) return { data: null, error: { message: why } };
      }
      state.mentions.push(...rows);
      return { data: rows.map((r) => ({ id: `id-${r.url}` })), error: null };
    }
    if (table === "listening_topics" && op === "update") {
      state.topicUpdates.push(payload as Record<string, unknown>);
      return { data: null, error: null };
    }
    if (table === "listening_topics" && op === "select") return { data: state.topics, error: null };
    return { data: op === "select" ? [] : null, error: null };
  };
  const client = () => ({
    from(table: string) {
      let op = "select";
      let payload: unknown = null;
      const query: object = new Proxy({}, {
        get(_, method: string) {
          if (method === "then") return (done: (r: unknown) => unknown) => Promise.resolve(answer(table, op, payload)).then(done);
          if (method === "insert" || method === "update" || method === "upsert") {
            return (body: unknown) => { op = method; payload = body; return query; };
          }
          return () => query;
        },
      });
      return query;
    },
    // The job lock and the day's credits are always free here.
    rpc: async () => ({ data: true, error: null }),
  });
  return { state, client };
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.45.0", () => ({ createClient: db.client }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  requireCaller: async () => ({ kind: "job" }),
  denied: (status: number, error: string) => new Response(JSON.stringify({ error }), { status }),
}));

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.example.test", SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests", SCRAPECREATORS_API_KEY: "test-key",
};
let sweepHandler: ((req: Request) => Promise<Response>) | undefined;
vi.stubGlobal("Deno", {
  env: { get: (name: string) => ENV[name] },
  serve: (handler: (req: Request) => Promise<Response>) => { sweepHandler = handler; },
});
// The search runs on Deno, which has AbortSignal.timeout; jsdom's AbortSignal doesn't.
Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: () => new AbortController().signal });
afterAll(() => vi.unstubAllGlobals());

type Found = { title: string | null; snippet: string | null };
const search = (await import("../../supabase/functions/_shared/social-search")) as unknown as Record<string, (query: string) => Promise<Found[]>>;

/** Runs the real listening-sweep handler once, as the hourly job. */
async function sweep() {
  // Not a literal path, so the app's type check doesn't read a Deno file.
  if (!sweepHandler) await import(`../../supabase/functions/${"listening-sweep"}/index.ts`);
  const res = await sweepHandler!(new Request("https://fn.example.test/", { method: "POST", body: "{}" }));
  return res.json();
}

/** ScrapeCreators answering each of the four searches with these posts, in each platform's own shape. */
function scrapeCreators(found: { tiktok?: Row[]; youtube?: Row[]; reddit?: Row[]; instagram?: Row[] }) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const path = new URL(input).pathname;
    const body = path === "/v1/tiktok/search/keyword" ? { search_item_list: (found.tiktok ?? []).map((v) => ({ aweme_info: v })) }
      : path === "/v1/youtube/search" ? { videos: found.youtube ?? [], shorts: [] }
      : path === "/v1/reddit/search" ? { posts: found.reddit ?? [] }
      : path === "/v2/instagram/reels/search" ? { reels: found.instagram ?? [] }
      : null;
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("Not found", { status: 404 });
  }));
}

// 299 letters, an emoji across the 300 cut (a title), 898 letters, an emoji across the 1,200 cut (a snippet).
const CAPTION = `${"a".repeat(299)}😀${"b".repeat(898)}😀 tail`;
const TITLE = "a".repeat(299);
const SNIPPET = `${"a".repeat(299)}😀${"b".repeat(898)}`;

describe("clip", () => {
  it("cuts to the limit, leaving out an emoji that would not fit whole", () => {
    expect(clip("ab😀cd", 3)).toBe("ab");
    expect(clip("ab😀cd", 4)).toBe("ab😀");
    expect(clip("abcdef", 4)).toBe("abcd");
  });

  it("keeps text within the limit as it is, emoji, skin tones and Kiswahili included", () => {
    expect(clip("Asante sana 🙏🏾 #Nairobi", 300)).toBe("Asante sana 🙏🏾 #Nairobi");
  });

  it("drops half an emoji that arrived already cut, and NUL characters, which Postgres can't hold", () => {
    expect(clip("Shule \ud83d bora\u0000", 300)).toBe("Shule  bora");
    expect(clip("\ude00tail", 300)).toBe("tail");
  });

  it("gives null for empty text or anything that isn't text", () => {
    expect(clip("", 10)).toBeNull();
    expect(clip("\u0000", 10)).toBeNull();
    expect(clip(null, 10)).toBeNull();
    expect(clip(undefined, 10)).toBeNull();
    expect(clip(42, 10)).toBeNull();
  });
});

describe("the search readers", () => {
  it.each([
    ["searchTikTok", { tiktok: [{ aweme_id: "1", desc: CAPTION, author: { unique_id: "mwalimu" }, create_time: 1762900000 }] }],
    ["searchYouTube", { youtube: [{ url: "https://www.youtube.com/watch?v=1", title: CAPTION, description: CAPTION }] }],
    ["searchReddit", { reddit: [{ permalink: "/r/Kenya/comments/1/a/", title: CAPTION, selftext: CAPTION }] }],
    ["searchInstagram", { instagram: [{ shortcode: "abc", caption: CAPTION, owner: { username: "mwalimu" } }] }],
  ])("%s cuts a title at 300 and a snippet at 1,200 without leaving half an emoji", async (name, found) => {
    scrapeCreators(found);
    const [post] = await search[name]("CambriLearn");
    expect(post.title).toBe(TITLE);
    expect(post.snippet).toBe(SNIPPET);
  });
});

describe("storeMentions", () => {
  const row = (url: string, extra: Partial<MentionRow> = {}): MentionRow => ({
    client_id: "c1", topic_id: "t1", source: "tiktok", url, title: null, snippet: null, author: null,
    reach: null, shares: null, published_at: null, ...extra,
  });

  it("stores the whole scan in one go when the database takes it", async () => {
    const batches: string[][] = [];
    const out = await storeMentions([row("1"), row("2")], async (b) => {
      batches.push(b.map((r) => r.url));
      return { count: b.length, error: null };
    });
    expect(out).toEqual({ stored: 2, skipped: 0, problem: null });
    expect(batches).toEqual([["1", "2"]]);
  });

  it("when the database refuses the scan, stores the posts one by one and skips only the one it refuses", async () => {
    const batches: string[][] = [];
    const out = await storeMentions([row("1"), row("bad"), row("3")], async (b) => {
      batches.push(b.map((r) => r.url));
      return b.some((r) => r.url === "bad") ? { count: 0, error: { message: "violates check constraint" } } : { count: b.length, error: null };
    });
    expect(out).toMatchObject({ stored: 2, skipped: 1 });
    expect(out.problem).toMatch(/1 of 3 .*violates check constraint/);
    expect(batches).toEqual([["1", "bad", "3"], ["1"], ["bad"], ["3"]]);
  });

  it("cleans the text before saving, so half an emoji or a NUL never reaches the database", async () => {
    const saved: MentionRow[] = [];
    const out = await storeMentions([row("1", { title: "Shule \ud83d", snippet: "a\u0000b", author: `@${"x".repeat(130)}` })], async (b) => {
      saved.push(...b);
      return { count: b.length, error: null };
    });
    expect(out.stored).toBe(1);
    expect(saved).toEqual([row("1", { title: "Shule ", snippet: "ab", author: `@${"x".repeat(119)}` })]);
  });
});

describe("listening-sweep storing a scan", () => {
  const TOPIC = {
    id: "t1", client_id: "c1", kind: "competitor", label: "CambriLearn", query: "CambriLearn", exclude_terms: [],
    clients: { name: "Lana Tutors", agency_id: "a1" },
  };
  const video = (id: string, desc: string) => ({
    aweme_id: id, desc, author: { unique_id: "mwalimu" }, create_time: 1762900000, statistics: { play_count: 100, share_count: 1 },
  });
  const url = (id: string) => `https://www.tiktok.com/@mwalimu/video/${id}`;

  beforeEach(() => {
    db.state.topics = [TOPIC];
    db.state.mentions = [];
    db.state.topicUpdates = [];
    db.state.refuseUrl = "";
  });

  it("stores every post when a caption has an emoji at the cut, and leaves the keyword without a problem note", async () => {
    scrapeCreators({
      tiktok: [video("1", CAPTION), video("2", "Mitihani wiki ijayo 📚")],
      reddit: [{ permalink: "/r/Kenya/comments/3/b/", title: "Half an emoji from the platform \ud83d", selftext: "" }],
    });
    const out = await sweep();
    expect(out).toMatchObject({ found: 3, stored: 3, notes: [] });
    expect(db.state.mentions.map((m) => m.title)).toEqual([TITLE, "Mitihani wiki ijayo 📚", "Half an emoji from the platform "]);
    expect(db.state.topicUpdates).toEqual([expect.objectContaining({ last_note: null })]);
  });

  it("when the database refuses one post for another reason, stores the rest and notes how many it skipped", async () => {
    db.state.refuseUrl = url("2");
    scrapeCreators({ tiktok: [video("1", "moja"), video("2", "mbili"), video("3", "tatu")] });
    const out = await sweep();
    expect(out).toMatchObject({ found: 3, stored: 2 });
    expect(db.state.mentions.map((m) => m.url)).toEqual([url("1"), url("3")]);
    expect(db.state.topicUpdates[0].last_note).toMatch(/1 of 3 .*violates check constraint/);
  });
});
