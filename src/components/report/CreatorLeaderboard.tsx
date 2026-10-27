import { ReportCard } from "@/components/report/ReportOverview";
import type { LeaderboardRow } from "@/lib/creatorLeaderboard";
import { compact } from "@/lib/reportInsights";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  );
}

/** The creators who delivered the most views, with their engagement and how far they reached past their own followers. */
export function CreatorLeaderboard({ rows, estimated = false, className }: {
  rows: LeaderboardRow[];
  /** The engagement rate includes shares or saves filled in from views and likes. */
  estimated?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <ReportCard className={className} title="Creator leaderboard" subtitle="Who delivered, and who reached beyond their own audience">
      <ol className="-my-1 divide-y divide-border/70">
        {rows.map((r, i) => {
          const meta = [r.handle && `@${r.handle}`, `${r.posts} post${r.posts === 1 ? "" : "s"}`, `${pct(r.share)} of views`].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="py-4">
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="w-6 shrink-0 text-[13px] tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{r.name}</div>
                    <div className="truncate text-[12.5px] text-muted-foreground">{meta}</div>
                  </div>
                </div>
                <dl className="grid grid-cols-3 items-end gap-6 sm:text-right">
                  <Figure label="Views" value={compact(r.views)} />
                  <Figure label="Engagement rate" value={`${r.rate.toFixed(1)}%`} />
                  <Figure label="Reach efficiency" value={r.reachEfficiency == null ? "—" : pct(r.reachEfficiency)} />
                </dl>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary/70" aria-hidden>
                <div className="bar-hatch h-full rounded-full" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        Reach efficiency is views divided by followers. Above 100% means the posts reached well beyond the creator's own audience.
        {estimated && " The engagement rate includes shares and saves estimated from views and likes where the platform doesn't report them."}
      </p>
    </ReportCard>
  );
}
