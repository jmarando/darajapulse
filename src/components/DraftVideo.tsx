import { useState } from "react";
import { Play, Loader2, RefreshCw } from "lucide-react";

export type StreamPlayback = {
  status: "processing" | "ready";
  embedUrl?: string;
  posterUrl?: string;
};

/**
 * Video tile that downloads nothing until the reviewer taps play.
 * Keeps long approval lists fast, especially on mobile data.
 *
 * Two pipelines:
 *  - Stream drafts (`getStream`): plays the adaptive Cloudflare Stream player,
 *    starts in about a second and shows a "processing" state until converted.
 *  - Legacy drafts (`url` / `getUrl`): plays the stored file after signing.
 */
export const DraftVideo = ({
  url,
  getUrl,
  getStream,
  label,
  poster,
}: {
  url?: string | null;
  getUrl?: () => Promise<string | null>;
  /** Present only when the video lives on Cloudflare Stream. */
  getStream?: () => Promise<StreamPlayback | null>;
  label?: string | null;
  poster?: string | null;
}) => {
  const [src, setSrc] = useState<string | null>(url ?? null);
  const [mode, setMode] = useState<"video" | "iframe" | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(poster ?? null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (getStream) {
        const s = await getStream();
        if (s?.status === "ready" && s.embedUrl) {
          if (s.posterUrl) setPosterUrl(s.posterUrl);
          setMode("iframe");
          setSrc(s.embedUrl);
          setPlaying(true);
          return;
        }
        if (s?.status === "processing") {
          setProcessing(true);
          return;
        }
        setFailed(true);
        return;
      }
      let resolved = src;
      if (!resolved && getUrl) {
        resolved = await getUrl();
        if (!resolved) {
          setFailed(true);
          return;
        }
        setSrc(resolved);
      }
      if (!resolved) {
        setFailed(true);
        return;
      }
      setMode("video");
      setPlaying(true);
    } finally {
      setLoading(false);
    }
  };

  if (playing && src && mode === "iframe") {
    return (
      <div className="bg-black aspect-[9/16] max-h-[62vh] sm:max-h-[420px]">
        <iframe
          src={src}
          title={label ? `Video from ${label}` : "Draft video"}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  if (playing && src) {
    return (
      <div className="bg-black aspect-[9/16] max-h-[62vh] sm:max-h-[420px]">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={src} poster={posterUrl ?? undefined} controls autoPlay playsInline preload="metadata" className="w-full h-full object-contain" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={failed}
      className="relative bg-black aspect-[9/16] max-h-[62vh] sm:max-h-[420px] w-full flex flex-col items-center justify-center gap-2 group"
      aria-label={`Play video${label ? ` from ${label}` : ""}`}
    >
      {posterUrl && (
        <img src={posterUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-70" />
      )}
      <div className="relative flex flex-col items-center gap-2">
        {loading ? (
          <Loader2 className="w-7 h-7 animate-spin text-primary-foreground/80" />
        ) : failed ? (
          <span className="text-xs text-primary-foreground/70">Video unavailable</span>
        ) : processing ? (
          <>
            <span className="text-xs text-primary-foreground/80 text-center px-3">
              Still converting — tap to try again in a few seconds
            </span>
            <RefreshCw className="w-5 h-5 text-primary-foreground/70" />
          </>
        ) : (
          <>
            <span className="w-14 h-14 rounded-full bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-primary-foreground/30 transition-colors">
              <Play className="w-6 h-6 text-primary-foreground fill-current" />
            </span>
            <span className="text-[11px] uppercase tracking-widest text-primary-foreground/80">Tap to play</span>
          </>
        )}
      </div>
    </button>
  );
};

export default DraftVideo;
