// Listening's news and the web: every hour, the Kenyan outlets' and blogs' own feeds, and a Serper news and web search
// for up to eight keywords (each about once a day). Pages that match a keyword strictly are stored as News (a named
// outlet) or Web (any other site or blog); the hourly listening-sweep reads their mood like any other post. The
// decisions are in _shared/news-sweep.ts and _shared/news-feeds.ts; this reads the data and stores.
//
// Caller: the hourly job only (x-job-key "listening-news", minute 50).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { denied, requireCaller } from "../_shared/auth.ts";
import { titleKey } from "../_shared/news-feeds.ts";
import { readFeeds, serperKey, serperSearch } from "../_shared/news-sources.ts";
import { type NewsTopic, runNewsSweep } from "../_shared/news-sweep.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const LOCK = "listening-news";
const WEEK = 7 * 86_400_000;
const PAGE = 1_000;
const MAX_PAGES = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** The headlines each keyword already holds from news and the web in the last week, folded, by keyword. */
async function heldTitles(): Promise<Map<string, Set<string>>> {
  const since = new Date(Date.now() - WEEK).toISOString();
  const out = new Map<string, Set<string>>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("listening_mentions")
      .select("topic_id, title")
      .in("source", ["news", "web"])
      .gte("found_at", since)
      .order("found_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { topic_id: string; title: string | null }[]) {
      const key = titleKey(r.title);
      if (!key) continue;
      const set = out.get(r.topic_id) ?? new Set<string>();
      set.add(key);
      out.set(r.topic_id, set);
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "listening-news" });
  if (caller instanceof Response) return caller;
  if (caller.kind === "user") return denied(403, "News is read on its own schedule.");

  try {
    // One run at a time, so two runs can't search the same keyword.
    const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 300 });
    if (lockErr) throw lockErr;
    if (!locked) return json({ ran: false, note: "Another news run is going. The next one is in an hour." });

    try {
      const { data: topics, error } = await supabase
        .from("listening_topics")
        .select("id, client_id, query, exclude_terms, news_searched_at")
        .eq("active", true);
      if (error) throw error;

      const [{ stories, failed }, titles] = await Promise.all([readFeeds(), heldTitles()]);
      const key = serperKey();
      const run = await runNewsSweep({
        topics: (topics ?? []) as NewsTopic[],
        stories,
        search: key ? (kind, query) => serperSearch(kind, query, key) : null,
        titles,
        save: async (batch) => {
          const { data, error } = await supabase
            .from("listening_mentions")
            .upsert(batch, { onConflict: "topic_id,url", ignoreDuplicates: true })
            .select("id");
          return { count: data?.length ?? 0, error };
        },
        now: Date.now(),
      });

      if (run.searched.length) {
        const { error: markErr } = await supabase
          .from("listening_topics")
          .update({ news_searched_at: new Date().toISOString() })
          .in("id", run.searched);
        if (markErr) run.notes.marking = `Could not mark the keywords searched (${markErr.message}).`;
      }

      return json({
        ran: true,
        keywords: (topics ?? []).length,
        feed_stories: stories.length,
        feeds_failed: failed,
        search: key ? "on" : "off: no SERPER_API_KEY",
        searched: run.searched.length,
        found: run.found,
        stored: run.stored,
        refused: run.refused,
        notes: run.notes,
      });
    } finally {
      await supabase.rpc("release_job_lock", { _name: LOCK });
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
