import { useEffect, useState } from "react";
import { Play, Instagram, Youtube, Facebook, Twitter, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  url: string;
  platform?: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
  handle?: string | null;
  postId?: string | null;
  asLink?: boolean;
};

function detectPlatform(url: string, hint?: string | null): string {
  // URL wins over hint — imported rows sometimes carry the wrong platform.
  const u = (url || "").toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  const h = (hint || "").toLowerCase();
  if (h) return h;
  return "other";
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
}

function getInstagramCode(url: string): string | null {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

function getTikTokId(url: string): string | null {
  return url.match(/\/video\/(\d{6,})/)?.[1] ?? null;
}

const PlatformIcon = ({ p, className }: { p: string; className?: string }) => {
  if (p === "instagram") return <Instagram className={className} />;
  if (p === "youtube") return <Youtube className={className} />;
  if (p === "facebook") return <Facebook className={className} />;
  if (p === "twitter" || p === "x") return <Twitter className={className} />;
  if (p === "tiktok") return <Music2 className={className} />;
  return <Play className={className} />;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isExpiredSignedThumbnail(src?: string | null): boolean {
  if (!src) return false;
  try {
    const parsed = new URL(decodeEntities(src));
    const expires = parsed.searchParams.get("x-expires") || parsed.searchParams.get("expires");
    const instagramExpiry = parsed.searchParams.get("oe");
    const expiry = expires && /^\d+$/.test(expires)
      ? Number(expires)
      : instagramExpiry && /^[0-9a-f]+$/i.test(instagramExpiry)
        ? parseInt(instagramExpiry, 16)
        : null;
    if (!expiry) return false;
    // Refresh a little early so signed TikTok/Instagram CDN images don't become grey cards overnight.
    return expiry * 1000 < Date.now() + 6 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function thumbnailCacheKey(src?: string | null): string {
  if (!src) return "empty";
  try {
    const parsed = new URL(decodeEntities(src));
    return parsed.pathname.split("/").pop() || parsed.pathname;
  } catch {
    return src.slice(-48);
  }
}

export const PostThumb = ({ url, platform, thumbnailUrl, caption, handle, postId, asLink = true }: Props) => {
  const p = detectPlatform(url, platform);
  const initial = thumbnailUrl && !isExpiredSignedThumbnail(thumbnailUrl) ? decodeEntities(thumbnailUrl) : null;
  const [resolved, setResolved] = useState<string | null>(initial);
  const [backendFailed, setBackendFailed] = useState(false);
  const backendImage = postId && p !== "youtube" && !backendFailed
    ? `${FUNCTIONS_URL}/resolve-post-thumbnail?image=1&post_id=${encodeURIComponent(postId)}&v=${encodeURIComponent(thumbnailCacheKey(resolved || thumbnailUrl))}`
    : null;
  let img = backendImage || resolved;
  if (!img && p === "youtube") {
    const id = getYouTubeId(url);
    if (id) img = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }

  // Keep state in sync when rows refresh with a new stored thumbnail.
  useEffect(() => {
    setResolved(initial);
  }, [initial]);

  useEffect(() => {
    setBackendFailed(false);
  }, [postId, url]);

  const resolveFreshThumbnail = async () => {
    const { data } = await supabase.functions.invoke("resolve-post-thumbnail", {
      body: { post_id: postId ?? undefined, url },
    });
    if (data?.thumbnail_url) setResolved(decodeEntities(data.thumbnail_url));
  };

  // Lazy server-side preview resolution for posts missing a thumbnail, and for expired signed CDN thumbnails.
  useEffect(() => {
    if (backendImage || (resolved && !isExpiredSignedThumbnail(resolved)) || !url) return;
    if (p === "youtube") return; // handled above
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("resolve-post-thumbnail", { body: { post_id: postId ?? undefined, url } });
        if (!cancelled && data?.thumbnail_url) setResolved(decodeEntities(data.thumbnail_url));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, postId, backendImage, resolved, p]);


  const body = (
    <>
      {img ? (
        <img
          src={img}
          alt={caption || handle || "post"}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          onLoad={(e) => {
            if (backendImage && e.currentTarget.naturalWidth === 0) setBackendFailed(true);
          }}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            // Signed social CDN previews expire. Ask the backend for a fresh URL before trying a proxy.
            if (backendImage) {
              setBackendFailed(true);
            } else if (!el.dataset.refreshed) {
              el.dataset.refreshed = "1";
              resolveFreshThumbnail().catch(() => undefined);
            } else if (!backendImage && !el.dataset.proxied && img) {
              el.dataset.proxied = "1";
              el.src = `https://images.weserv.nl/?url=${encodeURIComponent(img.replace(/^https?:\/\//, ""))}`;
            } else {
              el.style.display = "none";
            }
          }}
        />
      ) : p === "instagram" && getInstagramCode(url) ? (
        <iframe
          src={`https://www.instagram.com/reel/${getInstagramCode(url)}/embed`}
          title="Instagram post preview"
          loading="lazy"
          className="absolute inset-0 h-full w-full scale-[1.34] border-0 bg-background"
          style={{ transformOrigin: "top center", pointerEvents: "none" }}
        />
      ) : p === "tiktok" && getTikTokId(url) ? (
        <iframe
          src={`https://www.tiktok.com/embed/v2/${getTikTokId(url)}`}
          title="TikTok post preview"
          loading="lazy"
          className="absolute inset-0 h-full w-full scale-[1.12] border-0 bg-background"
          style={{ transformOrigin: "top center", pointerEvents: "none" }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <PlatformIcon p={p} className="w-10 h-10 text-muted-foreground/60" />
        </div>
      )}
      {/* gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30" />
      {/* play badge */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded-full bg-background/90 p-3 shadow-elegant">
          <Play className="w-5 h-5 text-foreground fill-foreground" />
        </div>
      </div>
      {/* platform chip */}
      <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-medium capitalize">
        <PlatformIcon p={p} className="w-3 h-3" />
        {p}
      </div>
      {/* footer */}
      {(handle || caption) && (
        <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
          {handle && <div className="text-xs font-medium truncate">{handle}</div>}
          {caption && <div className="text-[11px] leading-tight line-clamp-2 opacity-90">{caption}</div>}
        </div>
      )}
    </>
  );

  if (!asLink) {
    return <div className="group relative block aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-secondary via-muted to-secondary/40">{body}</div>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative block aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-secondary via-muted to-secondary/40"
    >
      {body}
    </a>
  );
};

export default PostThumb;
