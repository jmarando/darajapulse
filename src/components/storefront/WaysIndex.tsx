import type { Section, WayKey } from "@/lib/storefront";
import { kes } from "@/lib/storefrontRequests";

/**
 * Every way to buy from the house at a glance, each with a picture, how much there is, what it starts from and how
 * many of it are in the plan. A tap jumps to that part of the page.
 */
export default function WaysIndex({ sections, showPrices, picks, accent, onJump }: {
  sections: Section[]; showPrices: boolean; picks: Partial<Record<WayKey, number>>; accent: string; onJump: (key: WayKey) => void;
}) {
  return (
    <nav aria-label="Ways to buy">
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
        {sections.map((s) => {
          const picked = picks[s.key] ?? 0;
          return (
            <li key={s.key} className="w-40 shrink-0 snap-start sm:w-auto">
              <button type="button" onClick={() => onJump(s.key)}
                className="group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-black/5 transition-shadow group-hover:shadow-md">
                  {s.cover && <img src={s.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                  <div className="absolute inset-x-3 bottom-2.5 text-white">
                    <div className="text-[15px] font-semibold leading-tight">{s.title}</div>
                    <div className="mt-0.5 text-xs text-white/80">{s.items.length} to choose from</div>
                  </div>
                  {picked > 0 && (
                    <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-sm" style={{ background: accent }}>
                      {picked} picked
                    </span>
                  )}
                </div>
                {showPrices && (
                  <div className="mt-1.5 px-0.5 text-[13px] tabular-nums text-muted-foreground">
                    {s.fromPrice ? `From ${kes(s.fromPrice)}` : "Price on request"}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
