import { Globe } from "lucide-react";
import { coverPosition, platformLabel, type Listing } from "@/lib/storefront";
import { PLATFORM_ICON, PLATFORM_TILE } from "@/components/storefront/platformIcons";

/**
 * A listing's picture: its photo when it has one, otherwise a tile in the platform's colours. A small badge names the
 * platform, so a station photo still says whether it is the Instagram or the TikTok account.
 */
export default function ListingCover({ item, className = "", zoom = false, badge = true, platforms }: {
  item: Listing; className?: string; zoom?: boolean; badge?: boolean;
  /** A group's platforms: the badge shows each one's icon instead of one platform's name. */
  platforms?: string[];
}) {
  const Icon = PLATFORM_ICON[item.platform ?? ""] || Globe;
  const many = (platforms?.length ?? 0) > 1 ? platforms! : null;
  return (
    <div className={`relative overflow-hidden bg-secondary ${className}`}>
      {item.cover_url ? (
        <img
          src={item.cover_url}
          alt=""
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${zoom ? "transition-transform duration-500 group-hover:scale-[1.04]" : ""}`}
          style={{ objectPosition: coverPosition(item.kind) }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" style={{ background: PLATFORM_TILE[item.platform ?? ""] || PLATFORM_TILE.web }}>
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.6), transparent 60%)" }} />
          <Icon className="relative h-12 w-12 text-white drop-shadow-lg" strokeWidth={1.75} aria-hidden />
        </div>
      )}
      {badge && (many ? (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-neutral-900 shadow-sm" aria-label={many.map(platformLabel).join(", ")}>
          {many.map((p) => { const PIcon = PLATFORM_ICON[p] || Globe; return <PIcon key={p} className="h-3 w-3" aria-hidden />; })}
        </span>
      ) : (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-neutral-900 shadow-sm">
          <Icon className="h-3 w-3" aria-hidden /> {platformLabel(item.platform)}
        </span>
      ))}
    </div>
  );
}
