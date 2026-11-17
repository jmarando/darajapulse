import ListingCover from "@/components/storefront/ListingCover";
import { PickControl } from "@/components/storefront/PickControls";
import { aboutOf, fmtCompact, formatOf, offerGroups, reachLabel, type Listing, type OfferGroup } from "@/lib/storefront";
import { priceSummary, type PickApi } from "@/lib/storefrontPlan";

/**
 * Listings as rows under their property ("The Star online", "Songa Play"): what each one is, what it costs, its
 * choices to tap, and its details. Listings that name no property (events, say) are rows with their own picture.
 */
export default function OfferList({ items, pick, title }: { items: Listing[]; pick: PickApi; title?: string }) {
  const groups = offerGroups(items);
  return (
    <div className="space-y-6">
      {title && <h3 className="text-base font-semibold">{title}</h3>}
      {groups.map((g) => (
        <div key={g.key}>
          {g.name && (
            <div className="mb-2.5 flex items-center gap-3">
              {g.cover && <img src={g.cover} alt="" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold leading-tight">{g.name}</h3>
                {g.about && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{g.about}</p>}
              </div>
              {g.reach > 0 && (
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums">{fmtCompact(g.reach)}</div>
                  <div className="text-[11px] text-muted-foreground">{reachLabel(g.items[0].kind, g.items[0].platform)}</div>
                </div>
              )}
            </div>
          )}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {g.items.map((item) => <OfferRow key={item.id} item={item} pick={pick} group={g} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * One listing as a row. Under a property heading it is named by its format; its own picture and description show only
 * when the property's listings don't share one (Songa Play's shows each come from a different station).
 */
function OfferRow({ item, pick, group }: { item: Listing; pick: PickApi; group: OfferGroup }) {
  const underProperty = Boolean(group.name);
  const price = priceSummary(item, pick.showPrices);
  const name = underProperty ? formatOf(item) : item.title;
  const own = [aboutOf(item), item.deliverable_type].filter(Boolean).join(". ");
  const detail = !underProperty ? item.subtitle
    : group.about ? item.deliverable_type
    : own.charAt(0).toUpperCase() + own.slice(1);
  const thumb = !underProperty || !group.cover;
  const picked = pick.isPicked(item.id);
  return (
    <li className="flex gap-3 p-3 sm:p-4" style={picked ? { boxShadow: `inset 3px 0 0 ${pick.accent}` } : undefined}>
      {thumb && (
        <button type="button" onClick={() => pick.onOpen(item)} aria-label={`${item.title}: details`}
          className="shrink-0 self-start overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ListingCover item={item} className="h-16 w-16 sm:h-20 sm:w-20" badge={false} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <button type="button" onClick={() => pick.onOpen(item)}
            className="min-w-0 text-left text-[15px] font-medium leading-snug underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {name}
          </button>
          {price && <span className={`text-[13px] tabular-nums ${price === "Price on request" ? "text-muted-foreground" : "font-medium"}`}>{price}</span>}
        </div>
        {detail && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{detail}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <PickControl item={item} pick={pick} />
          <button type="button" onClick={() => pick.onOpen(item)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Details
          </button>
        </div>
      </div>
    </li>
  );
}
