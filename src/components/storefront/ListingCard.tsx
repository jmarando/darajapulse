import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ListingCover from "@/components/storefront/ListingCover";
import { fmtCompact, fmtEngagement, reachLabel, type Listing } from "@/lib/storefront";

/** One storefront listing. The whole card opens its detail; the buttons don't. */
export default function ListingCard({ item, accent, inCart, inPlan, onOpen, onToggle }: {
  item: Listing; accent: string; inCart: boolean; inPlan: boolean;
  onOpen: (item: Listing) => void; onToggle: (id: string) => void;
}) {
  const reach = Number(item.follower_count) || 0;
  const engagement = Number(item.engagement_rate) || 0;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${item.title}: details`}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item); } }}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${inCart ? "ring-2" : "border-border"}`}
      style={inCart ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}` } : undefined}
    >
      <div className="relative">
        <ListingCover item={item} className="aspect-[16/10]" zoom />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        {inPlan && (
          <span className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-white shadow-sm" style={{ background: accent }}>
            In your plan
          </span>
        )}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <h4 className="truncate text-[15px] font-semibold leading-tight drop-shadow-sm" title={item.title}>{item.title}</h4>
            {item.handle && <div className="truncate text-[12px] text-white/85">{item.handle}</div>}
          </div>
          {reach > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-[15px] font-semibold leading-none tabular-nums">{fmtCompact(reach)}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/80">{reachLabel(item.kind, item.platform)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {item.subtitle && <p className="line-clamp-2 text-sm text-muted-foreground">{item.subtitle}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.deliverable_type && <Badge variant="outline" className="text-[10px] font-normal">{item.deliverable_type}</Badge>}
          {engagement > 0 && <Badge variant="secondary" className="text-[10px] font-normal">{fmtEngagement(engagement)} engagement</Badge>}
        </div>
        <div className="mt-auto flex gap-2 pt-4">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); onOpen(item); }}>
            Details
          </Button>
          <Button
            type="button"
            size="sm"
            variant={inCart ? "default" : "outline"}
            className={`flex-1 ${inCart ? "text-white" : ""}`}
            style={inCart ? { background: accent } : undefined}
            aria-pressed={inCart}
            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
          >
            {inCart ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Added</> : "Add"}
          </Button>
        </div>
      </div>
    </article>
  );
}
