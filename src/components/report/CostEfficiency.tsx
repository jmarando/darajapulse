import { ReportCard } from "@/components/report/ReportOverview";
import { formatKes, type CostRow } from "@/lib/costEfficiency";
import { compact } from "@/lib/reportInsights";

function Figure({ label, value, estimated = false }: { label: string; value: string; estimated?: boolean }) {
  return (
    <div>
      <dt className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted-foreground">
        {label}
        {estimated && (
          <span className="rounded border border-border px-1 py-px text-[10.5px]" title="Worked out from the budget: no fee is recorded for this creator">est.</span>
        )}
      </dt>
      <dd className="mt-1 text-[18px] font-light leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  );
}

/** What each creator cost for what they delivered, cheapest per view first. */
export function CostEfficiency({ rows, estimated = false, className }: {
  rows: CostRow[];
  /** The cost per interaction counts shares or saves filled in from views and likes. */
  estimated?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const budgetSplit = rows.some((r) => r.feeFromBudget);
  return (
    <ReportCard className={className} title="Cost efficiency" subtitle="Best value creators, cheapest per view first">
      <ul className="-my-1 divide-y divide-border/70">
        {rows.map((r) => (
          <li key={r.id} className="py-4">
            <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">{r.name}</div>
                {r.handle && <div className="truncate text-[12.5px] text-muted-foreground">@{r.handle}</div>}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5 lg:text-right">
                <Figure label="Fee" value={r.fee > 0 ? formatKes(r.fee) : "—"} estimated={r.feeFromBudget && r.fee > 0} />
                <Figure label="Views" value={compact(r.views)} />
                <Figure label="Cost per view" value={r.cpv > 0 ? `KES ${r.cpv.toFixed(2)}` : "—"} />
                <Figure label="Per 1,000 views" value={r.cpm > 0 ? `KES ${r.cpm.toFixed(0)}` : "—"} />
                <Figure label="Per interaction" value={r.cpe > 0 ? `KES ${r.cpe.toFixed(2)}` : "—"} />
              </dl>
            </div>
          </li>
        ))}
      </ul>
      {(budgetSplit || estimated) && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {budgetSplit && "Fees marked est. aren't recorded, so the budget is split evenly. "}
          {estimated && "Cost per interaction counts shares and saves estimated from views and likes where the platform doesn't report them."}
        </p>
      )}
    </ReportCard>
  );
}
