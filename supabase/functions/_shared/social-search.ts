// ScrapeCreators keyword search for social listening: TikTok, YouTube and Reddit.
// Ported from Groundwork's scrapecreators.server.ts. One request is one credit.
// Docs: https://docs.scrapecreators.com  (auth via x-api-key header)

declare const Deno: { env: { get(name: string): string | undefined } };

const SC_KEY = Deno.env.get("SCRAPECREATORS_API_KEY") ?? "";
export const SOCIAL_SEARCH_ENABLED = SC_KEY.length > 0;

const BASE = "https://api.scrapecreators.com";

export type Found = {
  url: string;
  source: "tiktok" | "youtube" | "reddit";
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
  /** Who posted it: the handle, channel or username the platform gives. */
  author: string | null;
  /** Views, where the platform counts them. */
  reach: number | null;
  shares: number | null;
};

/** ScrapeCreators refused for lack of credits: stop searching, don't retry this run. */
export class OutOfCreditsError extends Error {}

/** A count from the platform (a number, or digits only), or null when it gives none. */
const count = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const isoFromSeconds = (v: unknown): string | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

async function scGet(path: string, params: Record<string, string>): Promise<any> {
  if (!SC_KEY) throw new OutOfCreditsError("ScrapeCreators key is not set.");
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
    headers: { "x-api-key": SC_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 402 || res.status === 403) throw new OutOfCreditsError("ScrapeCreators is out of credits.");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ScrapeCreators ${path} failed (${res.status}): ${body.slice(0, 120)}`);
  }
  const json = await res.json();
  if (json?.success === false) {
    const msg = typeof json?.message === "string" ? json.message : "ScrapeCreators error";
    if (/credit/i.test(msg)) throw new OutOfCreditsError(msg);
    throw new Error(`ScrapeCreators ${path}: ${msg.slice(0, 120)}`);
  }
  return json;
}

export async function searchTikTok(query: string, limit = 10): Promise<Found[]> {
  const json = await scGet("/v1/tiktok/search/keyword", { query });
  const items: any[] = json?.search_item_list ?? [];
  const videos = items
    .map((item: any): Found => {
      // ScrapeCreators wraps each result as { aweme_info: {...} }; a bare video is read too.
      const it = item?.aweme_info ?? item;
      const id = typeof it?.aweme_id === "string" ? it.aweme_id : "";
      const handle = it?.author?.unique_id || "";
      const desc = typeof it?.desc === "string" ? it.desc : "";
      return {
        url: id ? `https://www.tiktok.com/@${handle || "-"}/video/${id}` : (it?.share_url ?? ""),
        source: "tiktok",
        title: desc.slice(0, 300) || null,
        snippet: desc.slice(0, 1200) || null,
        publishedAt: isoFromSeconds(it?.create_time),
        author: handle ? `@${handle}` : null,
        reach: count(it?.statistics?.play_count),
        shares: count(it?.statistics?.share_count),
      };
    })
    .filter((h) => Boolean(h.url));
  // Results that all fail to read mean the reply's shape changed, not that nobody posted: say so.
  if (items.length && !videos.length) throw new Error("TikTok search returned results that could not be read.");
  return videos.slice(0, limit);
}

export async function searchYouTube(query: string, limit = 10): Promise<Found[]> {
  const json = await scGet("/v1/youtube/search", { query, uploadDate: "this_week" });
  const items: any[] = [...(json?.videos ?? []), ...(json?.shorts ?? [])];
  return items
    .map((v: any): Found => {
      const when = typeof v?.publishDate === "string" ? Date.parse(v.publishDate) : NaN;
      return {
        url: v?.url ?? "",
        source: "youtube",
        title: (v?.title ?? "").slice(0, 300) || null,
        snippet: typeof v?.description === "string" ? v.description.slice(0, 1200) || null : null,
        publishedAt: Number.isFinite(when) ? new Date(when).toISOString() : null,
        author: (typeof v?.channel?.title === "string" && v.channel.title) ||
          (typeof v?.channel?.handle === "string" && v.channel.handle) || null,
        reach: count(v?.viewCountInt),
        shares: null,
      };
    })
    .filter((h) => Boolean(h.url))
    .slice(0, limit);
}

export async function searchReddit(query: string, limit = 10): Promise<Found[]> {
  const json = await scGet("/v1/reddit/search", { query, filter: "posts", timeframe: "week", trim: "true" });
  const posts: any[] = json?.posts ?? [];
  return posts
    .map((p: any): Found => {
      const self = typeof p?.selftext === "string" ? p.selftext : "";
      return {
        url: p?.permalink ? `https://www.reddit.com${p.permalink}` : (p?.url ?? ""),
        source: "reddit",
        title: (p?.title ?? "").slice(0, 300) || null,
        snippet: (self || p?.title || "").slice(0, 1200) || null,
        publishedAt: isoFromSeconds(p?.created_utc),
        author: typeof p?.author === "string" && p.author ? `u/${p.author}` : null,
        reach: null,
        shares: null,
      };
    })
    .filter((h) => Boolean(h.url))
    .slice(0, limit);
}

/** The searches one keyword runs, each costing one credit. */
export const SEARCHES = [searchTikTok, searchYouTube, searchReddit];
