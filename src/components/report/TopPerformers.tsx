import { ReportCard } from "@/components/report/ReportOverview";
import type { PerformerRow } from "@/lib/topPerformers";
import { compact } from "@/lib/reportInsights";
import { cn } from "@/lib/utils";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The creators who delivered the most views, each with a hatched bar for their part of the campaign's total. */
export function TopPerformers({ rows, estimated = false, className }: {
  rows: PerformerRow[];
  /** Interactions include shares or saves filled in from views and likes. */
  estimated?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <ReportCard className={className} title="Top performers" subtitle="Who moved the needle, ranked by views delivered">
      <ol className="-my-1 divide-y divide-border/70">
        {rows.map((r, i) => {
          const meta = [r.handle && `@${r.handle}`, `${r.posts} post${r.posts === 1 ? "" : "s"}`, `${pct(r.share)} of views`].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="py-4">
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium tabular-nums",
                      i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{r.name}</div>
                    <div className="truncate text-[12.5px] text-muted-foreground">{meta}</div>
                  </div>
                </div>
                <dl className="grid grid-cols-3 items-end gap-6 sm:text-right">
                  <div>
                    <dt className="text-[12px] text-muted-foreground">Views</dt>
                    <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{compact(r.views)}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-muted-foreground">Interactions</dt>
                    <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{compact(r.interactions)}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-muted-foreground">Engagement rate</dt>
                    <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{r.rate.toFixed(1)}%</dd>
                  </div>
                </dl>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary/70" aria-hidden>
                <div className="bar-hatch h-full rounded-full" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                {`Likes ${compact(r.likes)} · Comments ${compact(r.comments)} · Shares and saves ${compact(r.sharesSaves)}`}
              </p>
            </li>
          );
        })}
      </ol>
      {estimated && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Interactions and the engagement rate include shares and saves estimated from views and likes where the platform doesn't report them.
        </p>
      )}
    </ReportCard>
  );
}
