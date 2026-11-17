import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import OfferList from "@/components/storefront/OfferList";
import { buildRateGrids, filterGrid, fmtCompact, stationColumns, whatYouGet, type GridCell, type Listing } from "@/lib/storefront";
import { perUnit, type PickApi } from "@/lib/storefrontPlan";

const amount = (n: number) => Math.round(n).toLocaleString("en-KE");

/**
 * The radio rate card as a media house prints it, but every price is a button: stations across, choices down, and a
 * tap adds that station and choice to the plan. Tabs switch between formats; a station chip narrows it to one station
 * (on a phone that turns six columns into one). Radio listings that don't make a grid follow as rows.
 */
export default function RateCard({ items, pick }: { items: Listing[]; pick: PickApi }) {
  const { grids, loose } = useMemo(() => buildRateGrids(items), [items]);
  const stations = useMemo(() => stationColumns(grids), [grids]);
  const [station, setStation] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const current = grids.find((g) => g.format === format) ?? grids[0] ?? null;
  const grid = current ? filterGrid(current, station) : null;
  const lead = current?.columns[0]?.item;
  const { lines: about, note } = lead ? whatYouGet({ ...lead, deliverable_type: null }) : { lines: [] as string[], note: null };
  const units = grid ? Array.from(new Set(grid.rows.map((r) => r.unit ?? ""))) : [];
  const oneUnit = units.length === 1 && units[0] ? units[0] : null;
  const tint = `color-mix(in srgb, ${pick.accent} 9%, transparent)`;

  return (
    <div>
      {current && grid && (
        <>
          <div role="group" aria-label="Stations" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0">
            <StationChip label="All stations" cover={null} active={station === null} tint={tint} accent={pick.accent} onClick={() => setStation(null)} />
            {stations.map((s) => (
              <StationChip key={s.name} label={s.name} cover={s.cover} active={station === s.name} tint={tint} accent={pick.accent}
                onClick={() => setStation(station === s.name ? null : s.name)} />
            ))}
          </div>

          <div role="group" aria-label="Formats" className="-mx-4 mt-4 flex gap-x-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0">
            {grids.map((g) => {
              const on = g === current;
              return (
                <button key={g.format} type="button" aria-pressed={on} onClick={() => setFormat(g.format)}
                  className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${on ? "font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  style={on ? { borderColor: pick.accent } : undefined}>
                  {g.format}
                </button>
              );
            })}
          </div>

          {about.length > 0 && <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{about.join(". ")}.</p>}

          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                {pick.showPrices ? `${current.format}: prices in KES${oneUnit ? ` per ${oneUnit}` : ""}, by station` : `${current.format}, by station`}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[6.5rem] border-b border-border bg-muted px-3 py-2.5 text-left align-bottom text-xs font-normal text-muted-foreground sm:min-w-[8.5rem]">
                    {pick.showPrices ? `KES${oneUnit ? ` per ${oneUnit}` : ""}` : <span className="sr-only">Choice</span>}
                  </th>
                  {grid.columns.map((c) => {
                    const reach = Number(c.item.follower_count) || 0;
                    return (
                      <th key={c.name} scope="col" className="min-w-[6.25rem] border-b border-border bg-muted px-2 py-2.5 text-left align-bottom font-normal sm:min-w-[7rem]">
                        <button type="button" onClick={() => pick.onOpen(c.item)}
                          className="text-left text-[13px] font-semibold leading-tight underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {c.name}
                        </button>
                        {reach > 0 && <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{fmtCompact(reach)} a week</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>*]:border-b-0">
                {grid.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-3 py-1.5 text-left font-normal">
                      <span className="block text-[13px] leading-snug">{r.label}</span>
                      {!oneUnit && r.unit && !r.label.toLowerCase().includes(r.unit.toLowerCase()) && (
                        <span className="block text-[11px] text-muted-foreground">{perUnit(r.unit)}</span>
                      )}
                    </th>
                    {r.cells.map((cell, n) => (
                      <td key={grid.columns[n].name} className="border-b border-border px-1.5 py-1.5">
                        {cell ? (
                          <PriceCell cell={cell} station={grid.columns[n].name} format={current.format} unit={r.unit} pick={pick} />
                        ) : (
                          <span className="block text-center text-muted-foreground"><span aria-hidden>—</span><span className="sr-only">Not sold</span></span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
        </>
      )}

      {loose.length > 0 && (
        <div className={current ? "mt-8" : undefined}>
          <OfferList items={loose} pick={pick} title={current ? "More on air" : undefined} />
        </div>
      )}
    </div>
  );
}

function StationChip({ label, cover, active, tint, accent, onClick }: {
  label: string; cover: string | null; active: boolean; tint: string; accent: string; onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cover ? "pl-1" : "pl-3"} ${active ? "font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
      style={active ? { borderColor: accent, background: tint } : undefined}>
      {cover && <img src={cover} alt="" loading="lazy" decoding="async" className="h-6 w-6 rounded-full object-cover" />}
      {label}
    </button>
  );
}

function PriceCell({ cell, station, format, unit, pick }: { cell: GridCell; station: string; format: string; unit: string | null; pick: PickApi }) {
  const qty = pick.qtyOf(cell.itemId, cell.option);
  const on = qty > 0;
  const price = pick.showPrices && cell.price ? cell.price : null;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${station}, ${format}, ${cell.option}${price ? `: KES ${amount(price)}${unit ? ` ${perUnit(unit)}` : ""}` : ""}`}
      onClick={() => pick.onPick(cell.itemId, cell.option)}
      className={`flex h-10 w-full items-center justify-center gap-1 rounded-lg border px-1.5 text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-transparent font-semibold text-white" : "border-border bg-background hover:border-foreground/40"}`}
      style={on ? { background: pick.accent } : undefined}
    >
      {on && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{price ? amount(price) : on ? "Added" : "Add"}</span>
      {qty > 1 && <span className="text-[11px] font-normal">×{qty}</span>}
    </button>
  );
}
