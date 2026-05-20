import { useEffect, useRef, useState } from "react";
import { canonicalPostUrl } from "@/lib/postUrl";

type Props = { rawUrl: string; platform?: string | null };
type InternalProps = { url: string; platform?: string | null };

const SCRIPTS: Record<string, string> = {
  instagram: "https://www.instagram.com/embed.js",
  tiktok: "https://www.tiktok.com/embed.js",
  twitter: "https://platform.twitter.com/widgets.js",
  x: "https://platform.twitter.com/widgets.js",
};

function loadScript(src: string) {
  return new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      // Re-process if available
      // @ts-ignore
      if ((window as any).instgrm?.Embeds) (window as any).instgrm.Embeds.process();
      // @ts-ignore
      if ((window as any).twttr?.widgets) (window as any).twttr.widgets.load();
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
}

function detectPlatform(url: string, hint?: string | null): string {
  // URL wins over hint — the stored platform is often wrong (e.g. "instagram"
  // saved against a tiktok.com URL), which renders an empty embed forever.
  const u = (url || "").toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  const h = (hint || "").toLowerCase();
  return h || "other";
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
}

function getTikTokId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

export const PostEmbed = ({ url, platform }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [errored, setErrored] = useState(false);
  const p = detectPlatform(url, platform);

  useEffect(() => {
    const src = SCRIPTS[p];
    if (src) loadScript(src);
  }, [p, url]);

  if (!url) return null;

  if (p === "youtube") {
    const id = getYouTubeId(url);
    if (!id) return <FallbackLink url={url} />;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          title="YouTube post"
        />
      </div>
    );
  }

  if (p === "facebook") {
    const src = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true&width=500`;
    return (
      <iframe
        src={src}
        className="w-full rounded-md border border-border bg-background"
        style={{ minHeight: 500 }}
        scrolling="no"
        frameBorder={0}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        title="Facebook post"
      />
    );
  }

  if (p === "instagram") {
    return (
      <div ref={ref} className="rounded-md overflow-hidden bg-background">
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{ background: "#FFF", border: 0, margin: 0, maxWidth: "100%", minWidth: 240, padding: 0, width: "100%" }}
        />
      </div>
    );
  }

  if (p === "tiktok") {
    const id = getTikTokId(url);
    return (
      <div ref={ref} className="rounded-md overflow-hidden w-full flex justify-center">
        <blockquote
          className="tiktok-embed"
          cite={url}
          data-video-id={id ?? undefined}
          style={{ maxWidth: "100%", minWidth: 0, width: "100%", margin: 0 }}
        >
          <section />
        </blockquote>
      </div>
    );
  }

  if (p === "twitter" || p === "x") {
    return (
      <div ref={ref} className="rounded-md overflow-hidden">
        <blockquote className="twitter-tweet" data-dnt="true">
          <a href={url.replace("x.com", "twitter.com")}>{url}</a>
        </blockquote>
      </div>
    );
  }

  return <FallbackLink url={url} />;
};

const FallbackLink = ({ url }: { url: string }) => (
  <a href={url} target="_blank" rel="noreferrer" className="text-xs text-accent break-all block">
    {url}
  </a>
);

export default PostEmbed;
