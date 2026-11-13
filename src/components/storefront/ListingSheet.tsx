import { ArrowUpRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ListingCover from "@/components/storefront/ListingCover";
import {
  fmtCompact, fmtEngagement, KIND_LABEL, platformLabel, profileUrl, reachLabel, whatYouGet, type Listing, type PlanMatch,
} from "@/lib/storefront";

/**
 * A listing opened up: its picture, what it reaches, what a buyer gets, why it fits their brief when the planner picked
 * it, and a way to see the live account itself.
 */
export default function ListingSheet({ item, match, accent, inCart, onClose, onToggle, onRequest }: {
  item: Listing | null; match: PlanMatch | null; accent: string; inCart: boolean;
  onClose: () => void; onToggle: (id: string) => void; onRequest: () => void;
}) {
  const url = item ? profileUrl(item.platform, item.handle) : null;
  const { lines, note } = item ? whatYouGet(item) : { lines: [], note: null };
  const reach = Number(item?.follower_count) || 0;
  const engagement = Number(item?.engagement_rate) || 0;
  const tint = `color-mix(in srgb, ${accent} 8%, transparent)`;
  return (
    <Sheet open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {item && (
          <>
            <ListingCover item={item} className="aspect-[16/10] shrink-0" />
            <div className="flex-1 space-y-6 p-6">
              <SheetHeader className="space-y-1.5 text-left">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{KIND_LABEL[item.kind] ?? item.kind}</div>
                <SheetTitle className="font-display text-2xl leading-tight">{item.title}</SheetTitle>
                {item.subtitle && <SheetDescription className="text-[14px]">{item.subtitle}</SheetDescription>}
              </SheetHeader>

              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline" style={{ color: accent }}>
                  See {item.handle} on {platformLabel(item.platform)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}

              <dl className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border">
                <div className="p-3">
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{reachLabel(item.kind, item.platform)}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{reach > 0 ? fmtCompact(reach) : "—"}</dd>
                </div>
                <div className="p-3">
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{fmtEngagement(engagement)}</dd>
                </div>
                <div className="p-3">
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Where</dt>
                  <dd className="mt-1 truncate text-lg font-semibold">{platformLabel(item.platform)}</dd>
                </div>
              </dl>

              {match && (
                <div className="rounded-xl border p-4" style={{ borderColor: accent, background: tint }}>
                  <div className="text-[11px] font-medium uppercase tracking-widest" style={{ color: accent }}>Why it fits your brief</div>
                  <p className="mt-1.5 text-sm leading-relaxed">{match.reason}</p>
                  {match.angle && <p className="mt-1.5 text-sm text-muted-foreground">Content angle: {match.angle}</p>}
                </div>
              )}

              {lines.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">{item.kind === "bundle" ? "What's included" : "What you get"}</h3>
                  <ul className="mt-2.5 space-y-2">
                    {lines.map((line) => (
                      <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(item.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags!.map((t) => <Badge key={t} variant="secondary" className="text-[11px] font-normal">{t}</Badge>)}
                </div>
              )}

              {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background/95 p-4 backdrop-blur">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onToggle(item.id)}>
                {inCart ? "Remove from request" : "Add to request"}
              </Button>
              <Button
                type="button"
                className="flex-1 text-white"
                style={{ background: accent }}
                onClick={() => { if (!inCart) onToggle(item.id); onRequest(); }}
              >
                Request a quote
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
