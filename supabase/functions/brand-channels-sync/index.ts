// Brand channels' read: followers and posts for each brand's accounts, kept as daily lines and readings for the organic
// report. Decisions live in _shared/brand-sources.ts and _shared/brand-pull.ts; this reads, calls and writes.
//
// Callers
//   - the night's job (x-job-key "brand-channels-sync", every 15 minutes from 01:00 to 02:45 UTC): whatever is due
//   - agency staff, after adding a handle (body { channel_ids: [id] }): that one account
//   - another function, with the service key (body { channel_ids }): those accounts
//
// A connected channel reads from Meta with its token from the vault. When Meta rejects the token the channel says so,
// and public numbers stand in until someone reconnects it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendAppEmail } from "../_shared/app-email.ts";
import { denied, requireCaller } from "../_shared/auth.ts";
import { applyPull, pullMetaFacebook, pullMetaInstagram, pullPublic, pullRoute, snapshotRow, type PullResult, type ScCall } from "../_shared/brand-pull.ts";
import { PUBLIC_PULL_DAILY_CAP, SC_CREDIT_FLOOR, channelIsDue, maxPublicCalls, pullMode, type ChannelPlatform, type MappedPost, type PullMode } from "../_shared/brand-sources.ts";
import { graphCall, reconcilePosts, reconnectNote } from "../_shared/meta-graph.ts";
import { scrapeCreatorsGet } from "../_shared/scrapecreators.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const LOCK = "brand-channels-sync";
const RUN_MS = 110_000;
/** A person is waiting on this one: they get what fits, and the rest of the history comes with the Sunday reads. */
const ON_DEMAND_MS = 45_000;
const THROTTLE_MS = 10 * 60_000;
const AT_ONCE = 3;
const CHUNK = 200;
const COLUMNS = "id, client_id, platform, handle, external_id, source, status, display_name, last_pull_at, last_good_pull_at, clients(agency_id)";

type Channel = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  external_id: string | null;
  source: string;
  status: string;
  display_name: string | null;
  last_pull_at: string | null;
  last_good_pull_at: string | null;
  clients: { agency_id: string } | null;
};

/** What one run has spent and learned about the provider's balance. */
type Run = { used: number; balance: number | null; outOfCredits: boolean; deadline: number };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const scCall = (run: Run): ScCall => async (path, params) => {
  const answer = await scrapeCreatorsGet(path, params);
  run.used += Math.max(0, Number(answer.json?.credits_charged ?? 0)) || 0;
  if (answer.json?.credits_remaining !== null && answer.json?.credits_remaining !== undefined) run.balance = Number(answer.json.credits_remaining);
  if (answer.status === 402) run.outOfCredits = true;
  return answer;
};

async function pullFromMeta(row: Channel, mode: PullMode, now: number, outOfTime: () => boolean): Promise<PullResult> {
  const { data: token, error } = await supabase.rpc("brand_channel_token", { _channel_id: row.id });
  if (error) throw error;
  if (!token || !row.external_id) return { ok: false, kind: "reconnect", note: reconnectNote(190), calls: 0 };
  const graph = graphCall(token as string);
  return row.platform === "instagram"
    ? pullMetaInstagram({ igUserId: row.external_id, mode, now, graph, outOfTime })
    : pullMetaFacebook({ pageId: row.external_id, mode, now, graph, outOfTime });
}

/** A page's posts first came from the public source. Where a link matches under another id, re-key them, so nothing counts twice. */
async function rekeyPosts(channelId: string, posts: MappedPost[]) {
  const { data, error } = await supabase.from("brand_posts").select("id, external_id, url").eq("channel_id", channelId).order("posted_at", { ascending: false }).limit(1000);
  if (error) throw error;
  for (const change of reconcilePosts(data ?? [], posts)) {
    const { error: updateError } = await supabase.from("brand_posts").update({ external_id: change.external_id }).eq("id", change.id);
    if (updateError) throw updateError;
  }
}

async function pullOne(row: Channel, run: Run, now: number): Promise<PullResult> {
  const platform = row.platform as ChannelPlatform;
  const mode = pullMode(row, now);
  const outOfTime = () => Date.now() > run.deadline;
  if (pullRoute(row) === "meta") {
    const result = await pullFromMeta(row, mode, now, outOfTime);
    if (result.ok === true) await rekeyPosts(row.id, result.posts);
    if (result.ok === true || result.kind !== "reconnect") return result;
    const { error } = await supabase.from("brand_channels").update(applyPull(row, result, now).channel).eq("id", row.id);
    if (error) throw error;
    row.status = "needs_reconnect"; // public numbers stand in from this run on
  }
  if (run.outOfCredits || (run.balance !== null && run.balance < SC_CREDIT_FLOOR)) {
    run.outOfCredits = true;
    return { ok: false, kind: "out_of_credits", note: "Out of credits.", calls: 0 };
  }
  const { data: allowed, error } = await supabase.rpc("take_brand_pull_credits", {
    _agency_id: row.clients?.agency_id,
    _n: maxPublicCalls(platform, mode),
    _cap: PUBLIC_PULL_DAILY_CAP,
  });
  if (error) throw error;
  if (allowed !== true) return { ok: false, kind: "cap", note: "Allowance used.", calls: 0 };
  return pullPublic({ platform, handle: row.handle, mode, now, call: scCall(run), outOfTime });
}

async function writePosts(channelId: string, posts: MappedPost[], source: string, now: number) {
  for (let start = 0; start < posts.length; start += CHUNK) {
    const chunk = posts.slice(start, start + CHUNK);
    const { data, error } = await supabase
      .from("brand_posts")
      .upsert(
        chunk.map((p) => ({ channel_id: channelId, external_id: p.external_id, url: p.url, posted_at: p.posted_at, format: p.format, caption: p.caption, thumbnail_url: p.thumbnail_url })),
        { onConflict: "channel_id,external_id" },
      )
      .select("id, external_id");
    if (error) throw error;
    const ids = new Map((data ?? []).map((row: { id: string; external_id: string }) => [row.external_id, row.id]));
    const readings = chunk.flatMap((p) => {
      const id = ids.get(p.external_id);
      const reading = id ? snapshotRow(id, p.metrics, source, now) : null;
      return reading ? [reading] : [];
    });
    if (readings.length) {
      const { error: readingError } = await supabase.from("brand_post_metrics").insert(readings);
      if (readingError) throw readingError;
    }
  }
}

/** Saves a read's numbers, then marks the channel, so a channel is never called good on numbers that weren't saved. */
async function writePull(row: Channel, result: PullResult, now: number) {
  let outcome = result;
  const { day } = applyPull(row, result, now);
  try {
    if (day) {
      const { error } = await supabase.from("brand_channel_days").upsert({ channel_id: row.id, ...day }, { onConflict: "channel_id,day" });
      if (error) throw error;
    }
    if (result.ok === true) await writePosts(row.id, result.posts, result.source, now);
  } catch (e) {
    console.error("brand channel write failed", { channel: row.id, message: (e as Error).message });
    outcome = { ok: false, kind: "failed", note: "The numbers couldn't be saved.", calls: result.calls };
  }
  const { channel } = applyPull(row, outcome, now);
  const { error } = await supabase.from("brand_channels").update(channel).eq("id", row.id);
  if (error) throw error;
  return { outcome, channel };
}

async function warnSuperAdmins() {
  const { data: first } = await supabase.rpc("take_job_lock", { _name: "brand-channels-credits-warning", _seconds: 86_400 });
  if (first !== true) return;
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
  for (const { user_id } of (admins ?? []) as { user_id: string }[]) {
    const { data: who } = await supabase.auth.admin.getUserById(user_id);
    if (who?.user?.email) await sendAppEmail({ templateName: "brand-channels-credits", recipientEmail: who.user.email });
  }
}

async function runChannels(rows: Channel[], limitMs: number) {
  const now = Date.now();
  const run: Run = { used: 0, balance: null, outOfCredits: false, deadline: now + limitMs };
  const summary = { ran: true, channels: 0, ok: 0, failed: 0, credits_used: 0, notes: [] as string[] };
  const finished: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length && Date.now() <= run.deadline; i += AT_ONCE) {
    await Promise.all(rows.slice(i, i + AT_ONCE).map(async (row) => {
      summary.channels++;
      try {
        const { outcome, channel } = await writePull(row, await pullOne(row, run, now), now);
        if (outcome.ok === true) summary.ok++;
        else summary.failed++;
        finished.push(channel);
      } catch (e) {
        summary.failed++;
        summary.notes.push(`${row.platform} ${row.handle}: ${String((e as Error).message ?? e).slice(0, 160)}`);
      }
    }));
  }
  summary.credits_used = run.used;
  if (run.used > 0) {
    await supabase.from("scraper_credit_log").insert({ provider: "scrapecreators", credits: run.used, credits_remaining: run.balance, context: "brand_channels" });
  }
  if (run.outOfCredits) {
    await warnSuperAdmins().catch((e) => console.error("brand channel warning failed", (e as Error).message));
  }
  return { summary, finished };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await requireCaller(req, { job: "brand-channels-sync" });
  if (caller instanceof Response) return caller;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const ids: string[] = Array.isArray(body?.channel_ids) ? body.channel_ids.filter((id: unknown) => typeof id === "string") : [];

    if (caller.kind === "user") {
      if (ids.length !== 1) return denied(403, "Ask for one account at a time.");
      const { data: row } = await supabase.from("brand_channels").select(COLUMNS).eq("id", ids[0]).maybeSingle();
      if (!row) return json({ error: "That account isn't here any more." }, 404);
      const { data: allowed } = await supabase.rpc("can_manage_brand_channels", { _user_id: caller.userId, _client_id: row.client_id });
      if (allowed !== true) return denied(403, "You don't have access to this brand.");
      if (row.last_pull_at && Date.now() - Date.parse(row.last_pull_at) < THROTTLE_MS) {
        return json({ ran: false, note: "This account was read a few minutes ago." });
      }
      const { summary, finished } = await runChannels([row as unknown as Channel], ON_DEMAND_MS);
      const channel = finished[0] ?? {};
      return json({ ...summary, status: channel.status ?? row.status, note: channel.status_note ?? null, display_name: channel.display_name ?? row.display_name });
    }

    if (ids.length) {
      const { data: rows, error } = await supabase.from("brand_channels").select(COLUMNS).in("id", ids);
      if (error) throw error;
      return json((await runChannels((rows ?? []) as unknown as Channel[], RUN_MS)).summary);
    }

    const { data: locked, error: lockErr } = await supabase.rpc("take_job_lock", { _name: LOCK, _seconds: 170 });
    if (lockErr) throw lockErr;
    if (!locked) return json({ ran: false, note: "Another run is still going." });
    try {
      await supabase.rpc("clear_brand_connect_expired"); // a login nobody finished leaves no token behind
      const { data: rows, error } = await supabase.from("brand_channels").select(COLUMNS);
      if (error) throw error;
      const due = ((rows ?? []) as unknown as Channel[]).filter((row) => channelIsDue(row, Date.now()));
      return json((await runChannels(due, RUN_MS)).summary);
    } finally {
      await supabase.rpc("release_job_lock", { _name: LOCK });
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
