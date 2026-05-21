// Refresh contest_entries metrics using Apify actors (TikTok / Instagram / Facebook).
// Replaces Ensemble for the public-post scraping path.
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
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}&timeout=180`;
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
  return {
    views: num(item?.viewsCount ?? item?.videoViewCount ?? item?.playCount),
    likes: num(item?.likesCount ?? item?.reactionsCount ?? item?.likes),
    comments: num(item?.commentsCount ?? item?.comments),
    shares: num(item?.sharesCount ?? item?.shares),
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

    let q = sb.from("contest_entries")
      .select("id, platform, post_url, views, likes, comments, shares")
      .eq("contest_id", contest_id)
      .not("post_url", "is", null);
    if (onlyEmpty) q = q.eq("views", 0).eq("likes", 0).eq("comments", 0).eq("shares", 0);
    const { data: entries, error } = await q;
    if (error) throw error;

    // Bucket entries by detected platform
    const buckets: Record<string, { id: string; url: string }[]> = { tiktok: [], instagram: [], facebook: [] };
    const skipped: any[] = [];
    for (const e of entries ?? []) {
      const plat = detectPlatform(e.platform, e.post_url!);
      if (!plat) { skipped.push({ id: e.id, reason: "unknown platform" }); continue; }
      buckets[plat].push({ id: e.id, url: e.post_url! });
    }

    const results = {
      total: entries?.length ?? 0,
      updated: 0,
      failed: 0,
      skipped: skipped.length,
      per_platform: { tiktok: 0, instagram: 0, facebook: 0 },
      errors: [] as any[],
    };

    async function applyResult(id: string, _url: string, s: ReturnType<typeof tiktokStats>) {
      const score = scoreOf(s);
      const upd: any = {
        views: s.views, likes: s.likes, comments: s.comments, shares: s.shares,
        score, last_polled_at: new Date().toISOString(), source: "apify",
      };
      if (s.caption) upd.caption = String(s.caption).slice(0, 1000);
      if (s.thumbnail_url) upd.thumbnail_url = s.thumbnail_url;
      const { error: uerr } = await sb.from("contest_entries").update(upd).eq("id", id);
      if (uerr) throw uerr;
    }

    const runAll = async () => {
      // (background work happens here — populated below)
    };


    // TikTok batch
    if (buckets.tiktok.length) {
      try {
        const items = await runActor(ACTORS.tiktok, {
          postURLs: buckets.tiktok.map(b => b.url),
          shouldDownloadVideos: false, shouldDownloadCovers: false,
          resultsPerPage: 1,
        });
        for (const b of buckets.tiktok) {
          const it = items.find((x: any) =>
            (x?.webVideoUrl && b.url.includes(String(x.webVideoUrl).split("/").pop() || "")) ||
            (x?.id && b.url.includes(String(x.id))) ||
            (x?.input && String(x.input) === b.url)
          );
          if (!it) { results.failed++; results.errors.push({ id: b.id, msg: "no result" }); continue; }
          try { await applyResult(b.id, b.url, tiktokStats(it)); results.updated++; results.per_platform.tiktok++; }
          catch (e) { results.failed++; results.errors.push({ id: b.id, msg: String(e) }); }
        }
      } catch (e) {
        results.failed += buckets.tiktok.length;
        results.errors.push({ platform: "tiktok", msg: e instanceof Error ? e.message : String(e) });
      }
    }

    // Instagram batch
    if (buckets.instagram.length) {
      try {
        const items = await runActor(ACTORS.instagram, {
          directUrls: buckets.instagram.map(b => b.url),
          resultsType: "details",
          resultsLimit: 1,
          addParentData: false,
        });
        for (const b of buckets.instagram) {
          const shortcode = b.url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1];
          const it = items.find((x: any) =>
            (shortcode && (x?.shortCode === shortcode || x?.shortcode === shortcode || String(x?.url ?? "").includes(shortcode))) ||
            (x?.url && x.url === b.url) ||
            (x?.inputUrl === b.url)
          );
          if (!it) { results.failed++; results.errors.push({ id: b.id, msg: "no result" }); continue; }
          try { await applyResult(b.id, b.url, igStats(it)); results.updated++; results.per_platform.instagram++; }
          catch (e) { results.failed++; results.errors.push({ id: b.id, msg: String(e) }); }
        }
      } catch (e) {
        results.failed += buckets.instagram.length;
        results.errors.push({ platform: "instagram", msg: e instanceof Error ? e.message : String(e) });
      }
    }

    // Facebook batch
    if (buckets.facebook.length) {
      try {
        const items = await runActor(ACTORS.facebook, {
          startUrls: buckets.facebook.map(b => ({ url: b.url })),
          resultsLimit: 1,
        });
        for (const b of buckets.facebook) {
          const it = items.find((x: any) => x?.url === b.url || x?.postUrl === b.url || x?.topLevelUrl === b.url);
          if (!it) { results.failed++; results.errors.push({ id: b.id, msg: "no result" }); continue; }
          try { await applyResult(b.id, b.url, fbStats(it)); results.updated++; results.per_platform.facebook++; }
          catch (e) { results.failed++; results.errors.push({ id: b.id, msg: String(e) }); }
        }
      } catch (e) {
        results.failed += buckets.facebook.length;
        results.errors.push({ platform: "facebook", msg: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ ...results, errors: results.errors.slice(0, 30) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
