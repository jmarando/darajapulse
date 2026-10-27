import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ReportCard } from "@/components/report/ReportOverview";
import type { TrendPoint } from "@/lib/campaignTrend";
import { compact } from "@/lib/reportInsights";

const AXIS = { fontSize: 11.5, fill: "hsl(var(--muted-foreground))" };

/**
 * One figure over time, in the report's marks: the history hatched, the latest reading a solid dot.
 * The figure for the point under the cursor (or the latest) is read out in the corner.
 */
export function TrendCard({ label, windowLabel, points, loading = false, partial = false, estimated = false, startedAfterPosts = false, firstReadingLabel, className }: {
  label: string;
  windowLabel: string;
  points: TrendPoint[];
  /** Part of this figure was filled in from views and likes, because the platforms don't report it. */
  estimated?: boolean;
  /** The full history is still downloading, so a line drawn now would be partial. */
  loading?: boolean;
  /** The full history could not be downloaded: the line is built from each post's latest figures only. */
  partial?: boolean;
  /** The posts were published before the first reading, so the line starts later than they did. */
  startedAfterPosts?: boolean;
  firstReadingLabel?: string;
  className?: string;
}) {
  const hatch = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const last = points.length - 1;
  const shown = points[hover ?? last];
  const summary = points.length > 0 ? `${label} over time, from ${compact(points[0].v)} on ${points[0].d} to ${compact(points[last].v)} on ${points[last].d}` : "";

  return (
    <ReportCard
      className={className}
      title={`${label} over time`}
      subtitle={`${windowLabel}. Pick a figure above to change the chart.`}
      action={
        shown && !loading ? (
          <div className="shrink-0 text-right">
            <div className="text-[20px] font-light leading-none tracking-[-0.02em] tabular-nums">{compact(shown.v)}</div>
            <div className="mt-1 text-[12px] text-muted-foreground">{hover == null ? `latest, ${shown.d}` : shown.d}</div>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex h-60 animate-pulse items-center justify-center rounded-xl bg-secondary/50 text-[13px] text-muted-foreground">Loading the history…</div>
      ) : points.length === 0 ? (
        <div className="flex h-60 items-center justify-center text-center text-[13px] text-muted-foreground">
          {partial
            ? "The full history could not be loaded, so there is nothing to draw yet. Reload the page to try again."
            : "No readings yet. The chart appears once the first figures are collected."}
        </div>
      ) : (
        <div role="img" aria-label={summary} className="h-60" onMouseLeave={() => setHover(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseMove={(s: { activeTooltipIndex?: number } | undefined) => setHover(typeof s?.activeTooltipIndex === "number" ? s.activeTooltipIndex : null)}
            >
              <defs>
                <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="hsl(var(--series) / 0.08)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--series) / 0.5)" strokeWidth="1.5" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="d" tickLine={false} axisLine={false} tick={AXIS} tickMargin={8} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={AXIS} tickFormatter={(v) => compact(Number(v))} />
              <Tooltip content={() => null} cursor={{ stroke: "hsl(var(--foreground) / 0.3)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="v"
                stroke="hsl(var(--series))"
                strokeWidth={2}
                fill={`url(#${hatch})`}
                dot={false}
                activeDot={{ r: 4, fill: "hsl(var(--series))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <ReferenceDot x={points[last].d} y={points[last].v} r={4.5} fill="hsl(var(--series))" stroke="hsl(var(--card))" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {partial && !loading && points.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          The full history could not be loaded, so this line is built from each post's latest figures rather than day by day. Reload the page to try again.
        </p>
      )}
      {estimated && !loading && points.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Partly estimated: the platforms don't report all of this, so part of it is filled in from views and likes.
        </p>
      )}
      {!partial && startedAfterPosts && firstReadingLabel && !loading && points.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Readings start on {firstReadingLabel}. The posts went live earlier, but nothing was measured before then, so the line starts there.
        </p>
      )}
    </ReportCard>
  );
}
