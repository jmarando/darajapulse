import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ChannelInsights from "@/components/storefront/ChannelInsights";
import ListingCover from "@/components/storefront/ListingCover";
import { PLATFORM_ICON } from "@/components/storefront/platformIcons";
import {
  bestTypicalViews, fmtCompact, fmtEngagement, groupReach, KIND_LABEL, platformLabel, profileUrl, reachLabel, READABLE_PLATFORMS, whatYouGet,
  type Listing, type ListingGroup, type PlanMatch,
} from "@/lib/storefront";

/** Whether the storefront can show this listing's latest posts: a real account on a platform whose posts are read. */
const readable = (i: Listing) => READABLE_PLATFORMS.includes(i.platform ?? "") && profileUrl(i.platform, i.handle) !== null;

function ProfileLink({ item, accent }: { item: Listing; accent: string }) {
  const url = profileUrl(item.platform, item.handle);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline" style={{ color: accent }}>
      See {item.handle} on {platformLabel(item.platform)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

/** One account of a group: its platform, handle and following, with its latest posts when opened. */
function AccountRow({ item, accent, open, inCart, onOpen, onToggle }: {
  item: Listing; accent: string; open: boolean; inCart: boolean; onOpen: () => void; onToggle: () => void;
}) {
  const Icon = PLATFORM_ICON[item.platform ?? ""] || Globe;
  const followers = Number(item.follower_count) || 0;
  const typical = item.insights_summary?.median_views;
  return (
    <li className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 p-2.5 pl-3">
        <button type="button" onClick={onOpen} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary"><Icon className="h-4 w-4" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{platformLabel(item.platform)}</span>
            <span className="block truncate text-xs text-muted-foreground">{[item.handle, item.deliverable_type].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-semibold tabular-nums">{followers > 0 ? fmtCompact(followers) : "—"}</span>
            <span className="block text-[10px] text-muted-foreground">{typical ? `${fmtCompact(typical)} views a post` : "followers"}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <Button
          type="button" size="sm" variant={inCart ? "default" : "outline"} className={`h-8 shrink-0 px-2.5 text-xs ${inCart ? "text-white" : ""}`}
          style={inCart ? { background: accent } : undefined} aria-pressed={inCart} aria-label={`${inCart ? "Remove" : "Add"} ${item.title}`} onClick={onToggle}
        >
          {inCart ? <><Check className="mr-1 h-3 w-3" aria-hidden /> Added</> : "Add"}
        </Button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border bg-secondary/20 p-3">
          <ProfileLink item={item} accent={accent} />
          {readable(item) ? <ChannelInsights item={item} accent={accent} /> : (
            <p className="text-xs text-muted-foreground">Post-by-post numbers aren't read for {platformLabel(item.platform)} accounts yet.</p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * A storefront card opened up: its picture, what it reaches, why it fits the buyer's brief, what they get, and for a
 * social account what its latest posts did. A station's or person's accounts are listed one by one, each with its
 * own numbers and its own Add.
 */
export default function ListingSheet({ group, focusId, matches, accent, cart, onClose, onToggle, onAddMany, onRequest }: {
  group: ListingGroup | null; focusId: string | null; matches: Map<string, PlanMatch>; accent: string; cart: string[];
  onClose: () => void; onToggle: (id: string) => void; onAddMany: (ids: string[], add: boolean) => void; onRequest: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!group) return;
    const focus = group.items.find((i) => i.id === focusId);
    setOpenId(focus?.id ?? (readable(group.lead) ? group.lead.id : null));
  }, [group, focusId]);

  const item = group?.lead ?? null;
  const single = (group?.items.length ?? 0) === 1;
  const match = group ? group.items.map((i) => matches.get(i.id)).find(Boolean) ?? null : null;
  const { lines, note } = item ? whatYouGet(single ? item : { ...item, deliverable_type: null }) : { lines: [], note: null };
  const tags = group ? Array.from(new Set(group.items.flatMap((i) => i.tags ?? []))) : [];
  const ids = group?.items.map((i) => i.id) ?? [];
  const added = ids.filter((id) => cart.includes(id)).length;
  const tint = `color-mix(in srgb, ${accent} 8%, transparent)`;
  const platforms = group ? Array.from(new Set(group.items.map((i) => i.platform ?? "").filter(Boolean))) : [];

  return (
    <Sheet open={!!group} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {group && item && (
          <>
            <ListingCover item={{ ...item, cover_url: group.cover }} className="aspect-[16/10] shrink-0" platforms={platforms} />
            <div className="flex-1 space-y-6 p-6">
              <SheetHeader className="space-y-1.5 text-left">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{KIND_LABEL[item.kind] ?? item.kind}</div>
                <SheetTitle className="font-display text-2xl leading-tight">{group.name}</SheetTitle>
                {item.subtitle && <SheetDescription className="text-[14px]">{item.subtitle}</SheetDescription>}
              </SheetHeader>

              {single && <ProfileLink item={item} accent={accent} />}

              <dl className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border">
                <div className="p-3">
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{single ? reachLabel(item.kind, item.platform) : "Total followers"}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{(single ? Number(item.follower_count) || 0 : groupReach(group)) > 0 ? fmtCompact(single ? item.follower_count : groupReach(group)) : "—"}</dd>
                </div>
                <div className="p-3">
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{single ? "Engagement" : "Accounts"}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{single ? fmtEngagement(item.engagement_rate) : group.items.length}</dd>
                </div>
                <div className="p-3">
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{single ? "Where" : "Best typical views"}</dt>
                  <dd className="mt-1 truncate text-lg font-semibold">
                    {single ? platformLabel(item.platform) : bestTypicalViews(group.items) ? fmtCompact(bestTypicalViews(group.items)) : "—"}
                  </dd>
                </div>
              </dl>

              {match && (
                <div className="rounded-xl border p-4" style={{ borderColor: accent, background: tint }}>
                  <div className="text-[11px] font-medium uppercase tracking-widest" style={{ color: accent }}>Why it fits your brief</div>
                  <p className="mt-1.5 text-sm leading-relaxed">{match.reason}</p>
                  {match.angle && <p className="mt-1.5 text-sm text-muted-foreground">Content angle: {match.angle}</p>}
                </div>
              )}

              {single && readable(item) && (
                <section aria-labelledby="recent-posts">
                  <h3 id="recent-posts" className="mb-2.5 text-sm font-semibold">Recent posts</h3>
                  <ChannelInsights item={item} accent={accent} />
                </section>
              )}

              {!single && (
                <section aria-labelledby="accounts">
                  <h3 id="accounts" className="text-sm font-semibold">Accounts</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Open one to see what its latest posts did. Add the ones you want.</p>
                  <ul className="mt-2.5 space-y-2">
                    {group.items.map((i) => (
                      <AccountRow key={i.id} item={i} accent={accent} open={openId === i.id} inCart={cart.includes(i.id)}
                        onOpen={() => setOpenId(openId === i.id ? null : i.id)} onToggle={() => onToggle(i.id)} />
                    ))}
                  </ul>
                </section>
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

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => <Badge key={t} variant="secondary" className="text-[11px] font-normal">{t}</Badge>)}
                </div>
              )}

              {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background/95 p-4 backdrop-blur">
              {single ? (
                <Button type="button" variant="outline" className="flex-1" onClick={() => onToggle(item.id)}>
                  {added ? "Remove from request" : "Add to request"}
                </Button>
              ) : (
                <Button type="button" variant="outline" className="flex-1" onClick={() => onAddMany(ids, added < ids.length)}>
                  {added < ids.length ? `Add all ${ids.length}` : "Remove all"}
                </Button>
              )}
              <Button
                type="button"
                className="flex-1 text-white"
                style={{ background: accent }}
                onClick={() => { if (!added) onAddMany(single ? [item.id] : ids, true); onRequest(); }}
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
