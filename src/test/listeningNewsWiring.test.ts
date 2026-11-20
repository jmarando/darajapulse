import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// listening-news runs on Deno, which cannot run here, so its decisions live in _shared/news-sweep.ts and
// _shared/news-sources.ts (tested in newsSweep.test.ts and newsSources.test.ts). These tests pin the wiring that
// matters most: only the scheduled job may run it, one run at a time, a keyword is marked searched only when it was,
// and the search key stays out of sight.
const supabase = resolve(__dirname, "../../supabase");
const read = (path: string) => readFileSync(resolve(supabase, path), "utf8");

describe("listening-news: who may call", () => {
  const fn = read("functions/listening-news/index.ts");

  it("checks the caller with its job key as the first thing its handler does", () => {
    expect(fn).toContain('requireCaller(req, { job: "listening-news" })');
    expect(fn).toMatch(/Deno\.serve\(async \(req\) => \{\s*if \(req\.method === "OPTIONS"\)[^\n]*\n\s*const caller = await requireCaller\(/);
  });

  it("turns away a signed-in person: it runs on its own schedule", () => {
    expect(fn).toMatch(/caller\.kind === "user"\) return denied\(403/);
  });
});

describe("listening-news: one run at a time", () => {
  const fn = read("functions/listening-news/index.ts");

  it("takes the job lock before any work and releases it in a finally", () => {
    expect(fn).toMatch(/take_job_lock", \{ _name: LOCK/);
    expect(fn).toContain('const LOCK = "listening-news"');
    expect(fn).toMatch(/finally \{\s*await supabase\.rpc\("release_job_lock", \{ _name: LOCK \}\)/);
    expect(fn.indexOf("take_job_lock")).toBeLessThan(fn.indexOf("readFeeds("));
  });

  it("marks only the keywords that were searched", () => {
    expect(fn).toMatch(/update\(\{ news_searched_at: [^}]*\}\)\s*\.in\("id", run\.searched\)/);
  });

  it("stores through storeMentions' save, one address once per keyword", () => {
    expect(fn).toMatch(/upsert\(batch, \{ onConflict: "topic_id,url", ignoreDuplicates: true \}\)/);
  });
});

describe("listening-news: the search key", () => {
  const src = read("functions/_shared/news-sources.ts");
  const fn = read("functions/listening-news/index.ts");

  it("is read when a run asks, never when the module loads", () => {
    expect(src).toMatch(/export function serperKey\(\)[^{]*\{[^}]*Deno\.env\.get\("SERPER_API_KEY"\)/);
    expect(src.indexOf('Deno.env.get("SERPER_API_KEY")')).toBeGreaterThan(src.indexOf("export function serperKey"));
  });

  it("is never logged or sent back", () => {
    for (const code of [src, fn]) expect(code).not.toMatch(/console\.(log|error|warn)\([^)]*key/i);
    // The answer says only whether search is on, never the key itself.
    expect(fn).toContain('search: key ? "on" : "off: no SERPER_API_KEY"');
    expect(fn).not.toMatch(/json\(\{[^}]*[{,]\s*key\s*[,}:]/);
  });

  it("bounds every request it makes", () => {
    const fetches = src.match(/await fetch\(/g) ?? [];
    const timeouts = src.match(/AbortSignal\.timeout\(/g) ?? [];
    expect(fetches.length).toBeGreaterThan(0);
    expect(timeouts.length).toBe(fetches.length);
  });
});

describe("the listening_news migration", () => {
  const sql = read("migrations/20261120090000_listening_news.sql");

  it("adds when each keyword was last searched", () => {
    expect(sql).toMatch(/ALTER TABLE public\.listening_topics ADD COLUMN IF NOT EXISTS news_searched_at timestamptz/);
  });

  it("gives the function its own job key and an hourly run at minute 50", () => {
    expect(sql).toMatch(/INSERT INTO public\.internal_job_keys\(name\) VALUES \('listening-news'\) ON CONFLICT \(name\) DO NOTHING/);
    expect(sql).toMatch(/cron\.schedule\('listening-news-hourly', '50 \* \* \* \*',\s*\$\$SELECT public\.invoke_job_function\('listening-news', '\{\}'::jsonb\)\$\$\)/);
  });

  it("says how to undo it", () => {
    const header = sql
      .split("\n")
      .filter((line) => line.startsWith("--"))
      .join("\n");
    expect(header).toContain("cron.unschedule('listening-news-hourly')");
    expect(header).toContain("DELETE FROM public.internal_job_keys WHERE name = 'listening-news'");
    expect(header).toContain("DROP COLUMN IF EXISTS news_searched_at");
  });
});
