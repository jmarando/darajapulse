// Social listening sweep: searches each brand's keywords on TikTok, Instagram,
// YouTube and Reddit through ScrapeCreators, stores new posts as mentions, then
// has the AI read the mood and theme of anything not yet rated. Ported from
// Groundwork's runListeningScan, scoped to client brands.
//
// Callers
//   - the hourly job (x-job-key "listening-sweep"): every brand's keywords not
//     searched in the last 12 hours
//   - agency staff ("Search now", body { client_id }): that brand's keywords not
//     searched in the last hour
// Credits: 4 per keyword search, out of 300 per agency per Nairobi day
// (LISTENING_DAILY_CREDITS overrides), logged to scraper_credit_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { denied, requireCaller } from "../_shared/auth.ts";
import { type Found, OutOfCreditsError, SEARCHES, SOCIAL_SEARCH_ENABLED } from "../_shared/social-search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DAILY_CREDITS = (() => {
  const n = Number(Deno.env.get("LISTENING_DAILY_CREDITS"));
  return Number.isInteger(n) && n >= 0 && Deno.env.get("LISTENING_DAILY_CREDITS") ? n : 300;
})();
const CREDITS_PER_SEARCH = SEARCHES.length;
const LOCK = "listening-sweep";
const OFF_TOPIC = "off-topic";
const THEMES = ["price", "quality", "taste", "availability", "service", "delivery", "packaging", "advert", "promotion", "health", "safety", "competitor", "general", OFF_TOPIC];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Topic = {
  id: string; client_id: string; kind: string; label: string; query: string; exclude_terms: string[];
  clients: { name: string; agency_id: string } | null;
};

/** The exclude terms drop a post when any of them appears in its text. */
const excluded = (h: Found, terms: string[]) => {
  if (!terms.length) return false;
  const hay = `${h.title ?? ""} ${h.snippet ?? ""} ${h.author ?? ""}`.toLowerCase();
  return terms.some((t) => t && hay.includes(t.toLowerCase()));
};

async function sweepTopic(topic: Topic, credits: { blocked: Set<string>; used: Map<string, number> }) {
  const agency = topic.clients?.agency_id;
  if (!agency) return { found: 0, stored: 0, note: "This brand has no agency." };
  if (credits.blocked.has(agency)) return { found: 0, stored: 0, note: "Today's listening credits are used.", skipped: true };
  const { data: took, error: takeErr } = await supabase.rpc("take_listening_credits", {
    _agency_id: agency, _n: CREDITS_PER_SEARCH, _cap: DAILY_CREDITS,
  });
  if (takeErr) throw takeErr;
  if (took !== true) {
    credits.blocked.add(agency);
    return { found: 0, stored: 0, note: "Today's listening credits are used.", skipped: true };
  }
  credits.used.set(agency, (credits.used.get(agency) ?? 0) + CREDITS_PER_SEARCH);

  const settled = await Promise.allSettled(SEARCHES.map((search) => search(topic.query, 10)));
  const hits: Found[] = [];
  const problems: string[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") hits.push(...r.value);
    else if (r.reason instanceof OutOfCreditsError) {
      credits.blocked.add(agency);
      problems.push("ScrapeCreators is out of credits.");
    } else problems.push(String((r.reason as Error)?.message ?? r.reason).slice(0, 160));
  }

  const rows = hits.filter((h) => !excluded(h, topic.exclude_terms ?? [])).map((h) => ({
    client_id: topic.client_id,
    topic_id: topic.id,
    source: h.source,
    url: h.url,
    title: h.title,
    snippet: h.snippet,
    author: h.author?.slice(0, 120) ?? null,
    reach: h.reach,
    shares: h.shares,
    published_at: h.publishedAt,
  }));

  let stored = 0;
  if (rows.length) {
    const { data: ins, error } = await supabase
      .from("listening_mentions")
      .upsert(rows, { onConflict: "topic_id,url", ignoreDuplicates: true })
      .select("id");
    if (error) problems.push(`Could not store what was found (${error.message}).`);
    stored = ins?.length ?? 0;
    // A post found again keeps its latest views, so a spreading post shows it.
    for (const r of rows.filter((x) => x.reach !== null)) {
      await supabase.from("listening_mentions").update({ reach: r.reach, shares: r.shares })
        .eq("topic_id", topic.id).eq("url", r.url).or(`reach.is.null,reach.lt.${r.reach}`);
    }
  }

  const note = problems.length ? problems.join(" ") : null;
  await supabase.from("listening_topics")
    .update({ last_scanned_at: new Date().toISOString(), last_note: note?.slice(0, 300) ?? null })
    .eq("id", topic.id);
  return { found: hits.length, stored, note };
}

type Verdict = { id: string; sentiment: "positive" | "neutral" | "negative"; theme: string; score: number };

/** The AI reads mood and theme for a batch of mentions, each against its brand and keyword. */
async function readMoods(items: { id: string; brand: string; keyword: string; kind: string; text: string }[]): Promise<Verdict[]> {
  if (!LOVABLE_API_KEY || !items.length) return [];
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You monitor Kenyan social media for consumer brands. Text may mix English, Kiswahili and Sheng.",
            "Each item names the brand that is listening, the keyword that found the post, and whether that keyword is",
            "the brand itself, a competitor, or a category the brand sells in.",
            "For each item give the mood of the post towards the keyword's subject (the competitor, for a competitor keyword):",
            "positive, neutral or negative, and a score from -1 (furious) to 1 (delighted).",
            `Give one theme from: ${THEMES.join(", ")}.`,
            `Use "${OFF_TOPIC}" when the post is not about the keyword's subject at all (a different meaning of the word,`,
            "another country's unrelated news, spam).",
            'Reply as JSON: {"results":[{"id":"…","sentiment":"positive|neutral|negative","theme":"…","score":0}]}, keeping each id.',
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(items) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

async function classifyPending(clientId: string | null, limit: number) {
  let q = supabase
    .from("listening_mentions")
    .select("id, title, snippet, topic_id, listening_topics(label, query, kind), clients(name)")
    .is("sentiment", null)
    .order("found_at", { ascending: false })
    .limit(limit);
  if (clientId) q = q.eq("client_id", clientId);
  const { data: pending, error } = await q;
  if (error) throw error;
  let classified = 0;
  const list = (pending ?? []) as any[];
  for (let i = 0; i < list.length; i += 30) {
    const batch = list.slice(i, i + 30).map((m) => ({
      id: m.id as string,
      brand: m.clients?.name ?? "",
      keyword: m.listening_topics ? `${m.listening_topics.label} (${m.listening_topics.query})` : "",
      kind: m.listening_topics?.kind ?? "brand",
      text: `${m.title ?? ""} — ${m.snippet ?? ""}`.slice(0, 600),
    }));
    const known = new Set(batch.map((b) => b.id));
    for (const v of await readMoods(batch)) {
      if (!known.has(v?.id) || !["positive", "neutral", "negative"].includes(v.sentiment)) continue;
      const theme = THEMES.includes(String(v.theme).toLowerCase()) ? String(v.theme).toLowerCase() : "general";
      const score = Math.max(-1, Math.min(1, Number(v.score) || 0));
      const { error: upErr } = await supabase.from("listening_mentions")
        .update({ sentiment: v.sentiment, sentiment_score: score, theme }).eq("id", v.id);
      if (!upErr) classified++;
    }
  }
  return classified;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await requireCaller(req, { job: "listening-sweep" });
    if (caller instanceof Response) return caller;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const clientId: string | null = typeof body?.client_id === "string" ? body.client_id : null;

    if (caller.kind === "user") {
      if (!clientId) return denied(403, "Pick a brand to search for.");
      const { data: ok } = await supabase.rpc("can_access_listening", { _user_id: caller.userId, _client_id: clientId });
      if (ok !== true) return denied(403, "You don't have access to this brand.");
    }
    if (!SOCIAL_SEARCH_ENABLED) return json({ error: "ScrapeCreators is not connected." }, 503);

    // One run at a time across the platform, so two runs can't search the same keyword.
    const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 170 });
    if (lockErr) throw lockErr;
    if (!locked) return json({ ran: false, note: "Another search is running. Try again in a few minutes." });

    const result = { ran: true, topics: 0, found: 0, stored: 0, classified: 0, credits_used: 0, notes: [] as string[] };
    try {
      const gapHours = clientId ? 1 : 12;
      const since = new Date(Date.now() - gapHours * 3600_000).toISOString();
      let q = supabase
        .from("listening_topics")
        .select("id, client_id, kind, label, query, exclude_terms, clients(name, agency_id)")
        .eq("active", true)
        .or(`last_scanned_at.is.null,last_scanned_at.lt.${since}`)
        .order("last_scanned_at", { ascending: true, nullsFirst: true })
        .limit(clientId ? 15 : 40);
      if (clientId) q = q.eq("client_id", clientId);
      const { data: topics, error } = await q;
      if (error) throw error;

      const credits = { blocked: new Set<string>(), used: new Map<string, number>() };
      const started = Date.now();
      const deadline = started + 80_000;
      const list = (topics ?? []) as unknown as Topic[];
      for (let i = 0; i < list.length; i += 3) {
        if (Date.now() > deadline) break;
        const outcomes = await Promise.all(list.slice(i, i + 3).map((t) => sweepTopic(t, credits)));
        for (const [j, o] of outcomes.entries()) {
          if (!("skipped" in o)) result.topics++;
          result.found += o.found;
          result.stored += o.stored;
          if (o.note) result.notes.push(`${list[i + j].label}: ${o.note}`);
        }
      }

      for (const [agency, n] of credits.used) {
        result.credits_used += n;
        await supabase.from("scraper_credit_log").insert({
          provider: "scrapecreators", credits: n, credits_remaining: null, campaign_id: null,
          context: `listening:${agency}`,
        });
      }

      // Mood reading needs about 30 seconds; leave it to the next run when short of time.
      if (Date.now() < started + 100_000) {
        try {
          result.classified = await classifyPending(clientId, 60);
        } catch (e) {
          result.notes.push(`Mood reading stopped: ${(e as Error).message}`);
        }
      }
    } finally {
      await supabase.rpc("release_job_lock", { _name: LOCK });
    }
    return json(result);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
