// Refresh contest_entries metrics using Meta Graph API directly (no Ensemble).
// IG: business_discovery on a connected IG business account → like_count, comments_count
// FB: /{page_id}_{post_id} on the post's page using its connected page token (when available)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const num = (v: any) => { const n = typeof v === "number" ? v : parseInt(String(v ?? "0").replace(/[,_]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
const scoreOf = (s: any) => num(s.shares) * 3 + num(s.comments) * 2 + num(s.likes) + num(s.views);

function igShortcode(url: string): string | null {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}
function igHandleFromUrl(url: string): string | null {
  return url.match(/instagram\.com\/([A-Za-z0-9_.]+)\/(?:p|reel|reels|tv)\//i)?.[1] ?? null;
}
function fbParse(url: string): { page: string | null; post: string | null } {
  // Common shapes:
  //  facebook.com/{page}/posts/{postid}
  //  facebook.com/{page}/videos/{postid}
  //  facebook.com/permalink.php?story_fbid={post}&id={page}
  //  facebook.com/watch/?v={videoid}
  let m = url.match(/facebook\.com\/([^/]+)\/(?:posts|videos|photos)\/(?:pfbid[\w]+|\d+)/i);
  if (m) return { page: m[1], post: url.match(/(\d{6,})/)?.[1] ?? null };
  m = url.match(/story_fbid=(\d+).*?[?&]id=(\d+)/i);
  if (m) return { page: m[2], post: m[1] };
  m = url.match(/[?&]v=(\d+)/i);
  if (m) return { page: null, post: m[1] };
  return { page: null, post: null };
}

async function gget(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${GRAPH}${path}?${qs}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Graph ${path} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const contest_id: string | undefined = body.contest_id;
    if (!contest_id) throw new Error("contest_id required");
    const onlyEmpty: boolean = body.only_empty ?? false;

    // Pick any connected IG business account as the "viewer" for business_discovery
    const { data: igAccts } = await sb.from("instagram_accounts")
      .select("ig_user_id, page_access_token, username").limit(5);
    const viewer = (igAccts ?? []).find(a => a.ig_user_id && a.page_access_token);
    if (!viewer) console.warn("No connected IG business account — IG fetches will skip.");

    // FB page tokens, keyed by page id and username
    const { data: fbAccts } = await sb.from("facebook_accounts")
      .select("page_id, page_username, page_access_token");
    const fbByPage = new Map<string, string>();
    for (const a of fbAccts ?? []) {
      if (a.page_id && a.page_access_token) fbByPage.set(String(a.page_id), a.page_access_token);
      if (a.page_username && a.page_access_token) fbByPage.set(String(a.page_username).toLowerCase(), a.page_access_token);
    }

    let q = sb.from("contest_entries")
      .select("id, platform, post_url, handle, instagram_handle, facebook_handle, views, likes, comments, shares")
      .eq("contest_id", contest_id)
      .not("post_url", "is", null);
    if (onlyEmpty) q = q.eq("views", 0).eq("likes", 0).eq("comments", 0).eq("shares", 0);
    const { data: entries, error } = await q;
    if (error) throw error;

    let updated = 0, failed = 0, skipped = 0;
    const errors: any[] = [];

    // Cache business_discovery results per handle so we hit Meta once per influencer.
    const igCache = new Map<string, any[]>();

    async function igMediaFor(handle: string): Promise<any[]> {
      const key = handle.toLowerCase();
      if (igCache.has(key)) return igCache.get(key)!;
      if (!viewer) throw new Error("no_ig_viewer");
      const j = await gget(`/${viewer.ig_user_id}`, {
        access_token: viewer.page_access_token,
        fields: `business_discovery.username(${key}){media.limit(50){shortcode,permalink,like_count,comments_count,media_type,media_product_type,caption,thumbnail_url,media_url,timestamp}}`,
      });
      const arr = j?.business_discovery?.media?.data ?? [];
      igCache.set(key, arr);
      return arr;
    }

    async function scrapeIG(entry: any) {
      const code = igShortcode(entry.post_url);
      if (!code) throw new Error("invalid_ig_url");
      const handle = (entry.instagram_handle || entry.handle || igHandleFromUrl(entry.post_url) || "").replace(/^@/, "");
      if (!handle) throw new Error("no_ig_handle");
      const media = await igMediaFor(handle);
      const m = media.find((x: any) => x.shortcode === code);
      if (!m) throw new Error("ig_post_not_found_in_recent_50");
      return {
        likes: num(m.like_count),
        comments: num(m.comments_count),
        shares: 0, // not exposed via business_discovery
        views: 0,  // not exposed via business_discovery
        caption: m.caption ?? null,
        thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
      };
    }

    async function scrapeFB(entry: any) {
      const { page, post } = fbParse(entry.post_url);
      const handleKey = (entry.facebook_handle || entry.handle || page || "").toLowerCase().replace(/^@/, "");
      const token = fbByPage.get(handleKey) ?? (page ? fbByPage.get(page.toLowerCase()) : undefined);
      if (!token) throw new Error("no_fb_page_token_for_url");
      if (!post) throw new Error("invalid_fb_url");
      // Use any connected token to resolve the page numeric id from handle if needed
      let pageId = handleKey;
      if (!/^\d+$/.test(pageId)) {
        try { const pj = await gget(`/${pageId}`, { access_token: token, fields: "id" }); pageId = pj.id; } catch {}
      }
      const id = `${pageId}_${post}`;
      const j = await gget(`/${id}`, {
        access_token: token,
        fields: "message,full_picture,permalink_url,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares",
      });
      return {
        likes: num(j?.reactions?.summary?.total_count),
        comments: num(j?.comments?.summary?.total_count),
        shares: num(j?.shares?.count),
        views: 0,
        caption: j?.message ?? null,
        thumbnail_url: j?.full_picture ?? null,
      };
    }

    const CONC = 4;
    for (let i = 0; i < (entries ?? []).length; i += CONC) {
      const batch = (entries ?? []).slice(i, i + CONC);
      await Promise.all(batch.map(async (e) => {
        try {
          let s: any;
          const p = (e.platform || "").toLowerCase();
          const url = e.post_url || "";
          if (p === "instagram" || /instagram\.com/.test(url)) s = await scrapeIG(e);
          else if (p === "facebook" || /facebook\.com|fb\.watch/.test(url)) s = await scrapeFB(e);
          else { skipped++; return; }
          const upd: any = {
            views: s.views, likes: s.likes, comments: s.comments, shares: s.shares,
            score: scoreOf(s), last_polled_at: new Date().toISOString(), source: "meta_graph",
          };
          if (s.caption) upd.caption = String(s.caption).slice(0, 1000);
          if (s.thumbnail_url) upd.thumbnail_url = s.thumbnail_url;
          const { error: uerr } = await sb.from("contest_entries").update(upd).eq("id", e.id);
          if (uerr) throw uerr;
          updated++;
        } catch (err) {
          failed++;
          errors.push({ id: e.id, platform: e.platform, post_url: e.post_url, msg: err instanceof Error ? err.message : String(err) });
        }
      }));
    }

    return new Response(JSON.stringify({
      total: entries?.length ?? 0, updated, failed, skipped,
      viewer_ig: viewer?.username ?? null,
      fb_pages_connected: fbByPage.size / 2,
      errors: errors.slice(0, 40),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
