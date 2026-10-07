import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { streamApi, signStreamToken, withStreamToken } from "../_shared/stream.ts";

/**
 * Frees video storage once a draft no longer needs replaying:
 *  - approved + live post link shared more than 7 days ago
 *  - changes requested (superseded by a new upload) reviewed more than 30 days ago
 * The thumbnail is copied into storage first and the approval record is kept.
 * Body: { dry_run?: boolean, limit?: number }. Called daily by cron (service role).
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, key);
  const body = await req.json().catch(() => ({}));
  const { data: jobKey } = await admin.from("internal_job_keys").select("key").eq("name", "purge-draft-videos").maybeSingle();
  const given = req.headers.get("x-job-key") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${key}` && !(jobKey?.key && given === jobKey.key)) {
    return json({ error: "unauthorized" }, 401);
  }
  const dryRun = body?.dry_run !== false;
  const limit = Math.min(Number(body?.limit) || 100, 300);

  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const month = new Date(Date.now() - 30 * 864e5).toISOString();
  const cols = "id, status, file_path, poster_path, file_size, stream_uid, stream_thumbnail_url";
  const [{ data: posted }, { data: rejected }] = await Promise.all([
    admin.from("creator_drafts").select(cols).eq("status", "approved").not("post_url", "is", null)
      .lt("posted_at", week).is("video_deleted_at", null).limit(limit),
    admin.from("creator_drafts").select(cols).eq("status", "changes_requested")
      .lt("reviewed_at", month).is("video_deleted_at", null).limit(limit),
  ]);
  const rows = [...(posted ?? []), ...(rejected ?? [])].filter((d: any) => d.file_path || d.stream_uid).slice(0, limit);
  const bytes = rows.reduce((s: number, d: any) => s + Number(d.file_size || 0), 0);
  if (dryRun) {
    return json({ dry_run: true, videos: rows.length, posted: posted?.length ?? 0, superseded: rejected?.length ?? 0, gb: +(bytes / 1e9).toFixed(2) });
  }

  let done = 0, failed = 0;
  for (const d of rows as any[]) {
    try {
      let poster = d.poster_path as string | null;
      if (d.stream_uid) {
        // Keep a still before the Stream thumbnail disappears with the video.
        if (!poster && d.stream_thumbnail_url) {
          const t = await signStreamToken(d.stream_uid);
          const r = await fetch(withStreamToken(d.stream_thumbnail_url, d.stream_uid, t));
          if (r.ok) {
            const path = `posters/${d.id}.jpg`;
            const { error } = await admin.storage.from("creator-drafts")
              .upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
            if (!error) poster = path;
          }
        }
        const del = await streamApi(`/stream/${d.stream_uid}`, { method: "DELETE" });
        if (!del.ok && del.status !== 404) throw new Error(`stream delete ${del.status}`);
      }
      if (d.file_path) await admin.storage.from("creator-drafts").remove([d.file_path]);
      await admin.from("creator_drafts").update({
        file_path: null, stream_uid: null, stream_thumbnail_url: null,
        poster_path: poster, video_deleted_at: new Date().toISOString(),
      }).eq("id", d.id);
      done++;
    } catch (e) {
      console.error("purge failed", d.id, e);
      failed++;
    }
  }
  return json({ deleted: done, failed, gb: +(bytes / 1e9).toFixed(2), more: rows.length === limit });
});
