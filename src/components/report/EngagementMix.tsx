import { AddUpBars, ReportCard } from "@/components/report/ReportOverview";
import type { EngagementMixResult } from "@/lib/engagementMix";
import { compact } from "@/lib/reportInsights";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What the campaign's interactions are made of, kind by kind, with how much of it is the stronger signals: saves and shares. */
export function EngagementMix({ mix, className }: { mix: EngagementMixResult | null; className?: string }) {
  if (!mix) return null;
  const items = mix.parts.map((p) => ({ key: p.key, label: p.label, views: p.value, share: p.share, estimated: p.estimated }));
  return (
    <ReportCard
      className={className}
      title="What drove the engagement"
      subtitle={`${compact(mix.total)} interactions, by kind`}
      action={
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-light leading-none tracking-[-0.02em] tabular-nums">{pct(mix.intentShare)}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">saves and shares</div>
        </div>
      }
    >
      <AddUpBars items={items} total={mix.total} unit="interactions" />
      <p className="mt-5 rounded-xl border border-border/70 bg-background/70 p-3.5 text-[13px] leading-relaxed">
        Saves and shares are {pct(mix.intentShare)} of all interactions. They show stronger intent than a like or a comment.
      </p>
      {mix.parts.some((p) => p.estimated) && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          est. marks figures we fill in from views and likes where the platform doesn't report them.
        </p>
      )}
    </ReportCard>
  );
}
