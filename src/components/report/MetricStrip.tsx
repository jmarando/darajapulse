import { ReportCard } from "@/components/report/ReportOverview";
import type { TrendMetric } from "@/lib/campaignTrend";
import type { MetricTile } from "@/lib/metricTiles";
import { cn } from "@/lib/utils";

/**
 * The campaign's figures in one row. Choosing one draws it in the chart below:
 * the chosen figure gets a bar in the data colour along its top edge.
 */
export function MetricStrip({ tiles, active, onSelect, className }: {
  tiles: MetricTile[];
  active: TrendMetric;
  onSelect: (key: TrendMetric) => void;
  className?: string;
}) {
  const anyEstimated = tiles.some((t) => t.estimated);
  const anyNotReported = tiles.some((t) => !t.available && t.value !== "—");
  const note = [
    anyEstimated && "est. marks figures we fill in from views and likes where the platform doesn't report them.",
    anyNotReported && "A dash means the platform hasn't reported it yet.",
  ].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <ReportCard className="overflow-hidden p-0 sm:p-0">
        <div role="group" aria-label="Figure shown in the chart" className="grid grid-cols-2 gap-px bg-border/70 sm:grid-cols-4 lg:grid-cols-7">
          {tiles.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(t.key)}
                className={cn(
                  "relative flex flex-col items-start bg-card px-4 py-4 text-left transition-colors last:col-span-2 hover:bg-secondary/40 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring lg:last:col-span-1",
                  on && "bg-secondary/40",
                )}
              >
                {on && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-series" />}
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  {t.label}
                  {t.estimated && (
                    <span className="rounded border border-border px-1 py-px text-[10.5px] leading-none" title="Partly estimated from views and likes, because the platform doesn't report it">est.</span>
                  )}
                </span>
                <span className={cn("mt-2 text-[28px] font-light leading-none tracking-[-0.02em] tabular-nums", !t.available && "text-muted-foreground/60")}>
                  {t.available ? t.value : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </ReportCard>
      {note && <p className="mt-2 px-1 text-[12px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}
