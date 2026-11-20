import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LISTENING_COUNTRIES } from "../../supabase/functions/_shared/listening-country";
import { moodPrompt } from "../../supabase/functions/_shared/listening-moods";

// The real listening-sweep handler for brands in two countries, with Deno, ScrapeCreators, the AI and the database stood
// in: a Ugandan brand's posts are read with Uganda's prompt, and a Kenyan brand's exactly as before. Invented brands only.

const db = vi.hoisted(() => {
  const state = {
    topics: [] as Record<string, unknown>[],
    /** Posts waiting for their mood to be read. */
    pending: [] as Record<string, unknown>[],
    /** Moods written back. */
    moods: [] as Record<string, unknown>[],
  };
  const answer = (table: string, op: string, payload: unknown) => {
    if (table === "listening_topics" && op === "select") return { data: state.topics, error: null };
    if (table === "listening_mentions" && op === "select") return { data: state.pending, error: null };
    if (table === "listening_mentions" && op === "update") {
      state.moods.push(payload as Record<string, unknown>);
      return { data: null, error: null };
    }
    if (op === "upsert") return { data: [], error: null };
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
  SUPABASE_URL: "https://project.example.test", SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests",
  SCRAPECREATORS_API_KEY: "test-key", LOVABLE_API_KEY: "ai-key-for-tests",
};
let sweepHandler: ((req: Request) => Promise<Response>) | undefined;
vi.stubGlobal("Deno", {
  env: { get: (name: string) => ENV[name] },
  serve: (handler: (req: Request) => Promise<Response>) => { sweepHandler = handler; },
});
// The sweep runs on Deno, which has AbortSignal.timeout; jsdom's AbortSignal doesn't.
Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: () => new AbortController().signal });
afterAll(() => vi.unstubAllGlobals());

/** What the stand-in services were asked: each ScrapeCreators address, and each prompt the AI got with its posts' ids. */
const asked = { searches: [] as URL[], ai: [] as { prompt: string; ids: string[] }[] };

beforeEach(() => {
  db.state.topics = [];
  db.state.pending = [];
  db.state.moods = [];
  asked.searches = [];
  asked.ai = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === "ai.gateway.lovable.dev") {
      const body = JSON.parse(String(init?.body));
      const items = JSON.parse(body.messages[1].content) as { id: string }[];
      asked.ai.push({ prompt: body.messages[0].content, ids: items.map((i) => i.id) });
      const results = items.map((i) => ({ id: i.id, sentiment: "neutral", theme: "general", score: 0 }));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results }) } }] }), { status: 200 });
    }
    asked.searches.push(url);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }));
});

/** Runs the real listening-sweep handler once, as the hourly job. */
async function sweep() {
  // Not a literal path, so the app's type check doesn't read a Deno file.
  if (!sweepHandler) await import(`../../supabase/functions/${"listening-sweep"}/index.ts`);
  const res = await sweepHandler!(new Request("https://fn.example.test/", { method: "POST", body: "{}" }));
  return res.json();
}

const post = (id: string, country: string | null) => ({
  id, title: `Post ${id}`, snippet: null, topic_id: "t1",
  listening_topics: { label: "Nile Crisps", query: "Nile Crisps", kind: "brand" },
  clients: { name: "Nile Crisps", country },
});

describe("listening-sweep reading moods", () => {
  it("reads each country's posts with that country's prompt, Kenya's as before", async () => {
    db.state.pending = [post("ug-1", "Uganda"), post("ke-1", "Kenya"), post("ug-2", "Uganda"), post("ke-2", null)];
    const out = await sweep();
    expect(asked.ai).toEqual([
      { prompt: moodPrompt(LISTENING_COUNTRIES.UG), ids: ["ug-1", "ug-2"] },
      { prompt: moodPrompt(LISTENING_COUNTRIES.KE), ids: ["ke-1", "ke-2"] },
    ]);
    expect(out.classified).toBe(4);
    expect(db.state.moods).toHaveLength(4);
  });
});

describe("listening-sweep searching", () => {
  const topic = (country: string | null) => ({
    id: "t1", client_id: "c1", kind: "brand", label: "Nile Crisps", query: "Nile Crisps", exclude_terms: [],
    clients: { name: "Nile Crisps", agency_id: "a1", country },
  });

  it("searches TikTok and YouTube from Uganda for a Ugandan brand", async () => {
    db.state.topics = [topic("Uganda")];
    await sweep();
    expect(asked.searches.map((u) => [u.pathname, u.searchParams.get("region")])).toEqual([
      ["/v1/tiktok/search/keyword", "UG"],
      ["/v1/youtube/search", "UG"],
      ["/v1/reddit/search", null],
      ["/v2/instagram/reels/search", null],
    ]);
  });

  it("searches for a Kenyan brand exactly as before, with no region", async () => {
    db.state.topics = [topic("Kenya")];
    await sweep();
    expect(asked.searches).toHaveLength(4);
    expect(asked.searches.every((u) => !u.searchParams.has("region"))).toBe(true);
  });
});
