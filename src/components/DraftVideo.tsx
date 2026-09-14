import { useState } from "react";
import { Play, Loader2 } from "lucide-react";

/**
 * Video tile that downloads nothing until the reviewer taps play.
 * Keeps long approval lists fast, especially on mobile data.
 */
export const DraftVideo = ({
  url,
  getUrl,
  label,
  poster,
}: {
  url?: string | null;
  getUrl?: () => Promise<string | null>;
  label?: string | null;
  poster?: string | null;
}) => {
  const [src, setSrc] = useState<string | null>(url ?? null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);


  const start = async () => {
    if (loading) return;
    let resolved = src;
    if (!resolved && getUrl) {
      setLoading(true);
      resolved = await getUrl();
      setLoading(false);
      if (!resolved) return setFailed(true);
      setSrc(resolved);
    }
    if (!resolved) return setFailed(true);
    setPlaying(true);
  };

  if (playing && src) {
    return (
      <div className="bg-black aspect-[9/16] max-h-[62vh] sm:max-h-[420px]">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={src} poster={poster ?? undefined} controls autoPlay playsInline preload="metadata" className="w-full h-full object-contain" />
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
      {poster && (
        <img src={poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-70" />
      )}
      <div className="relative flex flex-col items-center gap-2">
        {loading ? (
          <Loader2 className="w-7 h-7 animate-spin text-primary-foreground/80" />
        ) : failed ? (
          <span className="text-xs text-primary-foreground/70">Video unavailable</span>
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
