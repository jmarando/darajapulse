import { Play, Instagram, Youtube, Facebook, Twitter, Music2 } from "lucide-react";

type Props = {
  url: string;
  platform?: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
  handle?: string | null;
};

function detectPlatform(url: string, hint?: string | null): string {
  const h = (hint || "").toLowerCase();
  if (h) return h;
  const u = (url || "").toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  return "other";
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
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

export const PostThumb = ({ url, platform, thumbnailUrl, caption, handle }: Props) => {
  const p = detectPlatform(url, platform);
  let img = thumbnailUrl ? decodeEntities(thumbnailUrl) : null;
  if (!img && p === "youtube") {
    const id = getYouTubeId(url);
    if (id) img = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative block aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-secondary via-muted to-secondary/40"
    >
      {img ? (
        <img
          src={img}
          alt={caption || handle || "post"}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            // Fallback: route through an image proxy that adds CORS/referrer handling.
            if (!el.dataset.proxied) {
              el.dataset.proxied = "1";
              el.src = `https://images.weserv.nl/?url=${encodeURIComponent(img!.replace(/^https?:\/\//, ""))}`;
            } else {
              el.style.display = "none";
            }
          }}
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
    </a>
  );
};

export default PostThumb;
