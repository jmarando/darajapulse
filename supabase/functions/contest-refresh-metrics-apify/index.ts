// Refresh contest_entries metrics using Apify actors (TikTok / Instagram / Facebook).
// Runs in background via EdgeRuntime.waitUntil so the client returns immediately.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const APIFY = Deno.env.get("APIFY_API_TOKEN") ?? "";
const ACTORS = {
  tiktok: "clockworks~tiktok-scraper",
  instagram: "apify~instagram-scraper",
  facebook: "apify~facebook-posts-scraper",
};

const num = (v: any) => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0").replace(/[,_]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};
const scoreOf = (s: any) =>
  num(s.shares) * 3 + num(s.comments) * 2 + num(s.likes) + num(s.views);

async function runActor(actor: string, input: any): Promise<any[]> {
  if (!APIFY) throw new Error("APIFY_API_TOKEN not configured");
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}&timeout=300`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${actor} ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Apify non-JSON: ${text.slice(0, 200)}`); }
}

function tiktokStats(item: any) {
  return {
    views: num(item?.playCount ?? item?.viewCount),
    likes: num(item?.diggCount ?? item?.likeCount),
    comments: num(item?.commentCount),
    shares: num(item?.shareCount),
    caption: item?.text ?? item?.desc ?? null,
    thumbnail_url: item?.videoMeta?.coverUrl ?? item?.covers?.[0] ?? null,
  };
}
function igStats(item: any) {
  return {
    views: num(item?.videoPlayCount ?? item?.videoViewCount ?? item?.playCount),
    likes: num(item?.likesCount ?? item?.likes),
    comments: num(item?.commentsCount ?? item?.comments),
    shares: num(item?.reshareCount ?? 0),
    caption: item?.caption ?? null,
    thumbnail_url: item?.displayUrl ?? item?.thumbnailUrl ?? null,
  };
}
function fbStats(item: any) {
  const sfv = item?.short_form_video_context ?? item?.video ?? {};
  return {
    views: num(
      item?.viewsCount ?? item?.videoViewCount ?? item?.playCount ??
      item?.video_view_count ?? sfv?.play_count ?? sfv?.video_view_count ?? 0,
    ),
    likes: num(item?.likesCount ?? item?.reactionsCount ?? item?.likes ?? item?.unified_reactors?.count),
    comments: num(item?.commentsCount ?? item?.comments ?? item?.total_comment_count),
    shares: num(item?.sharesCount ?? item?.shares ?? item?.share_count_reduced),
    caption: item?.text ?? item?.message ?? null,
    thumbnail_url: item?.thumbnailUrl ?? item?.previewImage ?? null,
  };
}

function detectPlatform(platform: string, url: string): "tiktok" | "instagram" | "facebook" | null {
  const p = (platform || "").toLowerCase();
  if (p === "tiktok" || /tiktok\.com/.test(url)) return "tiktok";
  if (p === "instagram" || /instagram\.com/.test(url)) return "instagram";
  if (p === "facebook" || /facebook\.com|fb\.watch/.test(url)) return "facebook";
  return null;
}

function canonicalizeUrl(raw: string, plat: string): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (plat === "tiktok") {
    // Keep username if present; just strip query/fragment. Resolve share IDs by extraction if no /video/.
    if (/tiktok\.com\/.+\/video\/\d+/.test(url)) {
      try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return url.split("?")[0]; }
    }
    const m = url.match(/tiktok\.com\/.*?(?:share_item_id=)(\d{6,})/i);
    if (m) return `https://www.tiktok.com/video/${m[1]}`;
    return null;
  }
  if (plat === "instagram") {
    const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (m) return `https://www.instagram.com/p/${m[1]}/`;
    return null; // skip profile-only / garbage URLs
  }
  if (plat === "facebook") {
    try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return null; }
  }
  return null;
}

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    if (!contest_id) {
      return new Response(JSON.stringify({ error: "contest_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const onlyEmpty: boolean = body.only_empty ?? false;
    const wait: boolean = body.wait ?? false;
    const platformFilter: string | undefined = body.platform; // optional: "tiktok"|"instagram"|"facebook"

    let q = sb.from("contest_entries")
      .select("id, platform, post_url")
      .eq("contest_id", contest_id)
      .not("post_url", "is", null);
    if (onlyEmpty) q = q.eq("views", 0).eq("likes", 0).eq("comments", 0).eq("shares", 0);
    const { data: entries, error } = await q;
    if (error) throw error;

    const buckets: Record<string, { id: string; url: string }[]> = { tiktok: [], instagram: [], facebook: [] };
    for (const e of entries ?? []) {
      const plat = detectPlatform(e.platform, e.post_url!);
      if (!plat) continue;
      if (platformFilter && plat !== platformFilter) continue;
      const url = canonicalizeUrl(e.post_url!, plat);
      if (!url) continue;
      buckets[plat].push({ id: e.id, url });
    }
    const uniqUrls = (arr: { url: string }[]) => Array.from(new Set(arr.map(b => b.url)));


    async function applyResult(id: string, s: ReturnType<typeof tiktokStats>) {
      const score = scoreOf(s);
      const upd: any = {
        views: s.views, likes: s.likes, comments: s.comments, shares: s.shares,
        score, last_polled_at: new Date().toISOString(), source: "apify",
      };
      if (s.caption) upd.caption = String(s.caption).slice(0, 1000);
      if (s.thumbnail_url) upd.thumbnail_url = s.thumbnail_url;
      await sb.from("contest_entries").update(upd).eq("id", id);
    }

    const work = async () => {
      const summary: any = { tiktok: 0, instagram: 0, facebook: 0, errors: [] as any[] };

      if (buckets.tiktok.length) {
        try {
          const items = await runActor(ACTORS.tiktok, {
            postURLs: uniqUrls(buckets.tiktok),
            shouldDownloadVideos: false, shouldDownloadCovers: false,
            resultsPerPage: 1,
          });
          console.log("TT returned", items.length, "items; sample:", JSON.stringify(items[0] ?? {}).slice(0, 400));
          for (const b of buckets.tiktok) {
            const it = items.find((x: any) =>
              (x?.webVideoUrl && b.url.includes(String(x.webVideoUrl).split("/").pop() || "")) ||
              (x?.id && b.url.includes(String(x.id))) ||
              (x?.input && String(x.input) === b.url)
            );
            if (!it) { summary.errors.push({ id: b.id, msg: "no result" }); continue; }
            try { await applyResult(b.id, tiktokStats(it)); summary.tiktok++; }
            catch (e) { summary.errors.push({ id: b.id, msg: String(e) }); }
          }
        } catch (e) { console.error("TT actor error", e); summary.errors.push({ platform: "tiktok", msg: e instanceof Error ? e.message : String(e) }); }
      }

      if (buckets.instagram.length) {
        try {
          const items = await runActor(ACTORS.instagram, {
            directUrls: uniqUrls(buckets.instagram),
            resultsType: "posts",
            resultsLimit: 1,
            addParentData: false,
          });
          console.log("IG returned", items.length, "items; sample:", JSON.stringify(items[0] ?? {}).slice(0, 600));
          for (const b of buckets.instagram) {
            const shortcode = b.url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1];
            const it = items.find((x: any) =>
              (shortcode && (x?.shortCode === shortcode || x?.shortcode === shortcode || String(x?.url ?? "").includes(shortcode) || String(x?.postUrl ?? "").includes(shortcode) || String(x?.inputUrl ?? "").includes(shortcode))) ||
              (x?.url && x.url === b.url) || (x?.inputUrl === b.url) || (x?.postUrl === b.url)
            );
            if (!it) { summary.errors.push({ id: b.id, msg: "no result" }); continue; }
            try { await applyResult(b.id, igStats(it)); summary.instagram++; }
            catch (e) { summary.errors.push({ id: b.id, msg: String(e) }); }
          }
        } catch (e) { console.error("IG actor error", e); summary.errors.push({ platform: "instagram", msg: e instanceof Error ? e.message : String(e) }); }
      }

      if (buckets.facebook.length) {
        try {
          const items = await runActor(ACTORS.facebook, {
            startUrls: buckets.facebook.map(b => ({ url: b.url })),
            resultsLimit: 1,
          });
          for (const b of buckets.facebook) {
            const it = items.find((x: any) => x?.url === b.url || x?.postUrl === b.url || x?.topLevelUrl === b.url);
            if (!it) { summary.errors.push({ id: b.id, msg: "no result" }); continue; }
            try { await applyResult(b.id, fbStats(it)); summary.facebook++; }
            catch (e) { summary.errors.push({ id: b.id, msg: String(e) }); }
          }
        } catch (e) { summary.errors.push({ platform: "facebook", msg: e instanceof Error ? e.message : String(e) }); }
      }

      console.log("apify refresh done", JSON.stringify({
        contest_id, tiktok: summary.tiktok, instagram: summary.instagram, facebook: summary.facebook,
        errors: summary.errors.length,
      }));
    };

    const queued = {
      queued: true,
      contest_id,
      buckets: { tiktok: buckets.tiktok.length, instagram: buckets.instagram.length, facebook: buckets.facebook.length },
      total: entries?.length ?? 0,
    };

    if (wait) {
      await work();
      return new Response(JSON.stringify({ ...queued, done: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fire-and-forget in background
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(work().catch((e) => console.error("apify bg error", e)));
    } else {
      work().catch((e) => console.error("apify bg error", e));
    }
    return new Response(JSON.stringify(queued), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
