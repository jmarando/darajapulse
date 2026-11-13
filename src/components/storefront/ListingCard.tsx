import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ListingCover from "@/components/storefront/ListingCover";
import { bestTypicalViews, fmtCompact, fmtEngagement, groupReach, reachLabel, type ListingGroup } from "@/lib/storefront";

/**
 * One storefront card: a listing, or a station's or person's accounts together. The whole card opens the detail; the
 * buttons don't. A single listing adds straight to the request; a group's accounts are chosen in its detail.
 */
export default function ListingCard({ group, accent, cart, inPlan, onOpen, onToggle }: {
  group: ListingGroup; accent: string; cart: string[]; inPlan: boolean;
  onOpen: (group: ListingGroup) => void; onToggle: (id: string) => void;
}) {
  const { lead, items } = group;
  const single = items.length === 1;
  const added = items.filter((i) => cart.includes(i.id)).length;
  const reach = single ? Number(lead.follower_count) || 0 : groupReach(group);
  const engagement = single ? Number(lead.engagement_rate) || 0 : 0;
  const typicalViews = bestTypicalViews(items);
  const platforms = Array.from(new Set(items.map((i) => i.platform ?? "").filter(Boolean)));
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${group.name}: details`}
      onClick={() => onOpen(group)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(group); } }}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${added ? "ring-2" : "border-border"}`}
      style={added ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}` } : undefined}
    >
      <div className="relative">
        <ListingCover item={{ ...lead, cover_url: group.cover }} className="aspect-[16/10]" zoom platforms={platforms} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        {inPlan && (
          <span className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-white shadow-sm" style={{ background: accent }}>
            In your plan
          </span>
        )}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <h4 className="truncate text-[15px] font-semibold leading-tight drop-shadow-sm" title={group.name}>{group.name}</h4>
            <div className="truncate text-[12px] text-white/85">{single ? lead.handle : `${items.length} accounts`}</div>
          </div>
          {reach > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-[15px] font-semibold leading-none tabular-nums">{fmtCompact(reach)}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/80">{reachLabel(lead.kind, lead.platform)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {lead.subtitle && <p className="line-clamp-2 text-sm text-muted-foreground">{lead.subtitle}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {typicalViews && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {single ? `About ${fmtCompact(typicalViews)} views a post` : `Up to ${fmtCompact(typicalViews)} views a post`}
            </Badge>
          )}
          {single && lead.deliverable_type && <Badge variant="outline" className="text-[10px] font-normal">{lead.deliverable_type}</Badge>}
          {engagement > 0 && <Badge variant="secondary" className="text-[10px] font-normal">{fmtEngagement(engagement)} engagement</Badge>}
        </div>
        <div className="mt-auto flex gap-2 pt-4">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); onOpen(group); }}>
            {single ? "Details" : "See accounts"}
          </Button>
          {single ? (
            <Button
              type="button"
              size="sm"
              variant={added ? "default" : "outline"}
              className={`flex-1 ${added ? "text-white" : ""}`}
              style={added ? { background: accent } : undefined}
              aria-pressed={added > 0}
              onClick={(e) => { e.stopPropagation(); onToggle(lead.id); }}
            >
              {added ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Added</> : "Add"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant={added ? "default" : "outline"}
              className={`flex-1 ${added ? "text-white" : ""}`}
              style={added ? { background: accent } : undefined}
              onClick={(e) => { e.stopPropagation(); onOpen(group); }}
            >
              {added ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {added} added</> : "Choose"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
