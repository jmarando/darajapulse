import { ReportCard } from "@/components/report/ReportOverview";
import type { ChannelRow } from "@/lib/channelMix";
import { compact } from "@/lib/reportInsights";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Figure({ label, value, estimated = false }: { label: string; value: string; estimated?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-muted-foreground">
        {label}
        {estimated && (
          <span className="ml-1.5 rounded border border-border px-1 py-px text-[10.5px]" title="Partly estimated from views, because the platform doesn't report it">est.</span>
        )}
      </dt>
      <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  );
}

/** Where the views came from, platform by platform, each with a hatched bar for its part of the total. */
export function ChannelMix({ rows, loaded = true, className }: {
  rows: ChannelRow[];
  /** False until the readings arrive: views and reach show dashes rather than zeros. */
  loaded?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const anyEstimated = loaded && rows.some((r) => r.reachEstimated);
  return (
    <ReportCard className={className} title="Channel mix" subtitle="How the views split across platforms">
      <ul className="-my-1 divide-y divide-border/70">
        {rows.map((r) => {
          const meta = [count(r.posts, "post"), count(r.creators, "creator"), loaded && `${pct(r.share)} of views`].filter(Boolean).join(" · ");
          return (
            <li key={r.key} className="py-4">
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{r.label}</div>
                  <div className="truncate text-[12.5px] text-muted-foreground">{meta}</div>
                </div>
                <dl className="grid grid-cols-3 items-end gap-6 sm:text-right">
                  <Figure label="Views" value={loaded ? compact(r.views) : "—"} />
                  <Figure label="Reach" value={loaded ? compact(r.reach) : "—"} estimated={loaded && r.reachEstimated} />
                  <Figure label="Followers" value={compact(r.followers)} />
                </dl>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary/70" aria-hidden>
                {loaded && r.views > 0 && <div className="bar-hatch h-full rounded-full" style={{ width: `${Math.max(2, r.share * 100)}%` }} />}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {anyEstimated && "est. marks reach we fill in from views where the platform doesn't report it. "}
        Followers are counted under each creator's main platform.
      </p>
    </ReportCard>
  );
}
