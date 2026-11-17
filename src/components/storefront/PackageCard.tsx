import { Check } from "lucide-react";
import ListingCover from "@/components/storefront/ListingCover";
import { PickControl } from "@/components/storefront/PickControls";
import { whatYouGet, type Listing } from "@/lib/storefront";
import { priceSummary, type PickApi } from "@/lib/storefrontPlan";

/** A ready-made package: its picture, the first things in it, its price, and its choices or Add. */
export default function PackageCard({ item, pick }: { item: Listing; pick: PickApi }) {
  const { lines } = whatYouGet({ ...item, deliverable_type: null });
  const shown = lines.slice(0, 3);
  const price = priceSummary(item, pick.showPrices);
  const picked = pick.isPicked(item.id);
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      style={picked ? { borderColor: pick.accent, boxShadow: `0 0 0 1px ${pick.accent}` } : undefined}
    >
      <button type="button" onClick={() => pick.onOpen(item)} aria-label={`${item.title}: details`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <ListingCover item={item} className="aspect-[16/9]" badge={false} />
      </button>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[17px] font-semibold leading-tight">{item.title}</h3>
        {item.subtitle && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{item.subtitle}</p>}
        {shown.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {shown.map((line) => (
              <li key={line} className="flex gap-2 text-[13px] leading-snug">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: pick.accent }} aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => pick.onOpen(item)}
          className="mt-2 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {lines.length > shown.length ? "See everything included" : "Details"}
        </button>
        <div className="mt-auto space-y-2.5 pt-4">
          {price && <div className={`text-sm tabular-nums ${price === "Price on request" ? "text-muted-foreground" : "font-semibold"}`}>{price}</div>}
          <PickControl item={item} pick={pick} compact />
        </div>
      </div>
    </article>
  );
}
