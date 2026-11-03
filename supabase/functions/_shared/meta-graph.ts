// Meta for brand channels: the login address, what its errors mean, its signed requests, and its answers mapped to the
// same shape as the public source. Pure, so tests can run it without Deno. Metric names and shapes were read from Meta's
// docs for v26.0: anything that doesn't answer stays null and is left out of the report, not filled in.
import { cleanCaption, count, facebookPostKey, type MappedChannel, type MappedPost, type PostFormat, type PostMetrics, type Raw } from "./brand-sources.ts";
import type { AudienceRow } from "./brand-pull.ts";

export type GraphError = { code?: number; message?: string };
export type GraphCall = (path: string, params: Record<string, string>) => Promise<{ ok: boolean; json: Raw; error?: GraphError }>;

/** Calls the Graph API with the token in a header, so it never reaches an address, a log or an error message. */
export const graphCall = (token: string): GraphCall => async (path, params) => {
  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}?${new URLSearchParams(params).toString()}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await r.json().catch(() => null);
  return r.ok && !json?.error ? { ok: true, json } : { ok: false, json, error: json?.error };
};

/** The pages a login shared, up to five pages of them. */
export async function listAccounts(graph: GraphCall, fields: string): Promise<{ rows: Raw[]; error: GraphError | null }> {
  const rows: Raw[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const answer = await graph("me/accounts", after ? { fields, limit: "100", after } : { fields, limit: "100" });
    if (!answer.ok) return page === 0 ? { rows, error: answer.error ?? {} } : { rows, error: null };
    rows.push(...(Array.isArray(answer.json?.data) ? answer.json.data : []));
    after = answer.json?.paging?.next ? answer.json?.paging?.cursors?.after ?? null : null;
    if (!after) break;
  }
  return { rows, error: null };
}

export const GRAPH_VERSION = "v26.0";
export const READ_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights", "instagram_basic", "instagram_manage_insights", "business_management"];

/** Standard login with a scope list, or Facebook Login for Business once a configuration id is set. */
export function metaDialogUrl(i: { appId: string; redirectUri: string; state: string; configId?: string | null }): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", i.appId);
  url.searchParams.set("redirect_uri", i.redirectUri);
  url.searchParams.set("state", i.state);
  url.searchParams.set("response_type", "code");
  if (i.configId) {
    url.searchParams.set("config_id", i.configId);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", READ_SCOPES.join(","));
  }
  return url.toString();
}

export function classifyMetaError(e?: { code?: number } | null): "reconnect" | "retry" | "other" {
  const code = e?.code;
  if (code === 190 || code === 10 || code === 200) return "reconnect";
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 1 || code === 2) return "retry";
  return "other";
}

export function reconnectNote(code?: number): string {
  return code === 190
    ? "Facebook no longer accepts this connection. Reconnect it to get official numbers back."
    : "A permission was removed in Facebook. Reconnect to get official numbers back.";
}

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Meta's signed_request: an HMAC-SHA256 of the payload with the app secret. Anything that doesn't check out is null. */
export async function parseSignedRequest(raw: string, appSecret: string): Promise<{ user_id: string } | null> {
  const [signature, payload, extra] = String(raw ?? "").split(".");
  if (!signature || !payload || extra !== undefined || !appSecret) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), new TextEncoder().encode(payload));
    if (!ok) return null;
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (body?.algorithm !== "HMAC-SHA256" || !body?.user_id) return null;
    return { user_id: String(body.user_id) };
  } catch {
    return null;
  }
}

/** One account shared at login, as the choosing page shows it. Never a token. */
export type SharedAsset = { id: string; platform: "facebook" | "instagram"; name: string | null; username: string | null; avatar_url: string | null; page_id: string };

const textOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function shapeAssets(pages: Raw): SharedAsset[] {
  const assets: SharedAsset[] = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    const pageId = textOf(page?.id);
    if (!pageId) continue;
    assets.push({ id: pageId, platform: "facebook", name: textOf(page?.name), username: textOf(page?.username), avatar_url: textOf(page?.picture?.data?.url), page_id: pageId });
    const ig = page?.instagram_business_account;
    const igId = textOf(ig?.id);
    if (igId) assets.push({ id: igId, platform: "instagram", name: textOf(ig?.name), username: textOf(ig?.username), avatar_url: textOf(ig?.profile_picture_url), page_id: pageId });
  }
  return assets;
}

/** The handle a shared account goes by: its username in lowercase, or its id when it has none. */
export function assetHandle(a: SharedAsset): string {
  return (a.username ?? a.id).toLowerCase();
}

/** The channel a shared account upgrades, so its history carries over. */
export function matchChannel(a: SharedAsset, channels: { id: string; platform: string; handle: string; external_id: string | null }[]): string | null {
  const samePlatform = channels.filter((c) => c.platform === a.platform);
  const handle = assetHandle(a);
  return (samePlatform.find((c) => c.external_id === a.id) ?? samePlatform.find((c) => c.handle.toLowerCase() === handle))?.id ?? null;
}

const metrics = (m: Partial<PostMetrics>): PostMetrics => ({ views: null, likes: null, comments: null, shares: null, saves: null, reach: null, views_paid: null, ...m });
const isoOf = (v: unknown): string | null => {
  const when = typeof v === "string" ? Date.parse(v.replace(/\+0000$/, "Z")) : NaN;
  return Number.isFinite(when) ? new Date(when).toISOString() : null;
};

export function mapMetaPage(json: Raw): MappedChannel {
  return { external_id: textOf(json?.id), display_name: textOf(json?.name), avatar_url: textOf(json?.picture?.data?.url), followers: count(json?.followers_count) };
}

export function mapMetaInstagram(json: Raw): MappedChannel {
  return { external_id: textOf(json?.id), display_name: textOf(json?.name) ?? textOf(json?.username), avatar_url: textOf(json?.profile_picture_url), followers: count(json?.followers_count) };
}

export type GraphPost = MappedPost & { graph_id: string };

export function mapMetaFacebookPost(json: Raw): GraphPost {
  const graphId = String(json?.id ?? "");
  const media = String(json?.attachments?.data?.[0]?.media_type ?? "").toLowerCase();
  const url = textOf(json?.permalink_url);
  const picture = textOf(json?.full_picture);
  const format: PostFormat = media.includes("video") || /\/reel\//.test(url ?? "") ? "video" : media.includes("album") ? "carousel" : media.includes("photo") || picture ? "photo" : "text";
  return {
    graph_id: graphId,
    external_id: facebookPostKey(graphId),
    url,
    posted_at: isoOf(json?.created_time),
    format,
    caption: cleanCaption(json?.message),
    thumbnail_url: picture,
    metrics: metrics({ likes: count(json?.reactions?.summary?.total_count), comments: count(json?.comments?.summary?.total_count), shares: count(json?.shares?.count) }),
  };
}

const insightRow = (json: Raw, name: string) => (Array.isArray(json?.data) ? json.data.find((row: Raw) => row?.name === name) : undefined);
const insightValue = (row: Raw) => row?.values?.[0]?.value ?? row?.total_value?.value;

/** Views and unique views of a Facebook post. What Meta didn't answer stays null. */
export function parsePostInsights(json: Raw): { views: number | null; reach: number | null } {
  return { views: count(insightValue(insightRow(json, "post_media_view"))), reach: count(insightValue(insightRow(json, "post_total_media_view_unique"))) };
}

/**
 * Paid views from the is_from_ads breakdown. Meta returns only non-zero rows, so a breakdown with no paid row is a real 0.
 * Null when no breakdown came back at all. The docs don't show this answer's shape, so both known forms are read.
 */
export function parsePostViewsSplit(json: Raw): number | null {
  const row = insightRow(json, "post_media_view");
  const results = row?.total_value?.breakdowns?.[0]?.results;
  if (Array.isArray(results)) {
    const paid = results.find((r: Raw) => String(r?.dimension_values?.[0]).toLowerCase() === "true");
    return paid ? count(paid.value) : 0;
  }
  const value = row?.values?.[0]?.value;
  if (value && typeof value === "object") return count(value.true) ?? 0;
  return null;
}

const INSTAGRAM_FORMAT: Record<string, PostFormat> = { IMAGE: "photo", VIDEO: "video", CAROUSEL_ALBUM: "carousel" };

export function mapMetaMedia(json: Raw): GraphPost {
  const url = textOf(json?.permalink);
  const shortcode = textOf(json?.shortcode) ?? url?.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? String(json?.id ?? "");
  return {
    graph_id: String(json?.id ?? ""),
    external_id: shortcode, // the public source keys Instagram posts by shortcode, so a connected account keeps its history
    url,
    posted_at: isoOf(json?.timestamp),
    format: INSTAGRAM_FORMAT[json?.media_type] ?? "other",
    caption: cleanCaption(json?.caption),
    thumbnail_url: textOf(json?.thumbnail_url) ?? textOf(json?.media_url),
    metrics: metrics({ likes: count(json?.like_count), comments: count(json?.comments_count) }),
  };
}

export function parseMediaInsights(json: Raw): Pick<PostMetrics, "views" | "reach" | "saves" | "shares"> {
  const read = (name: string) => count(insightValue(insightRow(json, name)));
  return { views: read("views"), reach: read("reach"), saves: read("saved"), shares: read("shares") };
}

/** One breakdown of follower_demographics. Meta gives nothing for an account under 100 followers. */
export function parseDemographics(json: Raw): AudienceRow[] {
  const results = insightRow(json, "follower_demographics")?.total_value?.breakdowns?.[0]?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r: Raw) => {
    const key = textOf(r?.dimension_values?.[0]);
    const value = count(r?.value);
    return key !== null && value !== null ? [{ key, value }] : [];
  });
}

/** One link however it is spelled: no scheme, www or m, no query, no trailing slash. */
export function normalisePostUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^(www|m|web)\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Stored posts whose link matches a post from Meta under another id. Re-keying them stops a newly connected page counting
 * its posts twice, and keeps their history. A stored post already holding that id is left alone.
 */
export function reconcilePosts(existing: { id: string; external_id: string; url: string | null }[], incoming: { external_id: string; url: string | null }[]): { id: string; external_id: string }[] {
  const taken = new Set(existing.map((row) => row.external_id));
  const byLink = new Map(existing.flatMap((row) => {
    const link = normalisePostUrl(row.url);
    return link ? [[link, row] as const] : [];
  }));
  const rekeys: { id: string; external_id: string }[] = [];
  for (const post of incoming) {
    const link = normalisePostUrl(post.url);
    const row = link ? byLink.get(link) : undefined;
    if (!row || row.external_id === post.external_id || taken.has(post.external_id)) continue;
    rekeys.push({ id: row.id, external_id: post.external_id });
    taken.add(post.external_id);
  }
  return rekeys;
}
