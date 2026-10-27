import { ReportCard } from "@/components/report/ReportOverview";
import { compact } from "@/lib/reportInsights";
import { DAY_LABELS, slotLabel, type Cadence } from "@/lib/postingCadence";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const LABELLED_HOURS = new Set([0, 3, 6, 9, 12, 15, 18, 21]);
const SHADES = [0.15, 0.35, 0.55, 0.8, 1];
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** When the posts went live: a weekday-by-hour grid shaded by the views each slot delivered. */
export function PostingCadence({ cadence, className }: { cadence: Cadence; className?: string }) {
  const { cells, best } = cadence;
  if (cells.length === 0) return null;
  const slot = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c]));
  const peak = best ? `${DAY_LABELS[best.day]} ${slotLabel(best.hour)}` : null;
  const summary = `Views by weekday and hour of posting.${best ? ` The peak slot is ${peak}, with ${compact(best.views)} views.` : ""}`;
  return (
    <ReportCard
      className={className}
      title="When the posts went live"
      subtitle="Views by the day and hour each post was published, in your time zone. Darker means more views."
      action={
        best ? (
          <div className="shrink-0 text-right">
            <div className="text-[20px] font-light leading-none tracking-[-0.02em] tabular-nums">{peak}</div>
            <div className="mt-1 text-[12px] text-muted-foreground">peak slot · {compact(best.views)} views</div>
          </div>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <div role="img" aria-label={summary} className="min-w-[560px]">
          <div className="grid" style={{ gridTemplateColumns: "36px repeat(24, minmax(0, 1fr))" }}>
            <div />
            {HOURS.map((h) => (
              <div key={h} className="pb-1.5 text-center text-[11px] text-muted-foreground">{LABELLED_HOURS.has(h) ? slotLabel(h) : ""}</div>
            ))}
            {DAY_LABELS.map((day, d) => (
              <div key={day} className="contents">
                <div className="self-center pr-2 text-[12px] text-muted-foreground">{day}</div>
                {HOURS.map((h) => {
                  const c = slot.get(`${d}-${h}`);
                  return (
                    <div
                      key={h}
                      title={c ? `${day} ${slotLabel(h)} · ${count(c.posts, "post")} · ${compact(c.views)} views` : undefined}
                      className="m-[1.5px] aspect-square rounded-[3px] bg-secondary/70"
                      style={c ? { backgroundColor: `hsl(var(--series) / ${c.level})` } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
        <span>Fewer views</span>
        {SHADES.map((o) => (
          <span key={o} aria-hidden className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: `hsl(var(--series) / ${o})` }} />
        ))}
        <span>More views</span>
      </div>
    </ReportCard>
  );
}
