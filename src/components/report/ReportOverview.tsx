import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/dash/Panel";
import { PatternCard } from "@/components/dash/PatternCard";
import { ToneList } from "@/components/dash/ToneList";
import type { Tone } from "@/components/dash/chips";
import {
  buildDataNotes,
  buildInsights,
  compact,
  contributions,
  formatAge,
  periodDelta,
  platformFreshness,
  platformKey,
  platformLabel,
  readingSummary,
  viewsAt,
  weeklyCumulative,
  type DataNote,
  type Insight,
  type ReportPost,
} from "@/lib/reportInsights";

const H = 3600_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Kept for existing imports; the shared dashboard panel. */
export const ReportCard = Panel;

const FRESHNESS_DOT = { fresh: "bg-status-good", aging: "bg-status-warn", stale: "bg-status-bad", missing: "bg-status-bad" } as const;

/** One chip per platform saying how recently its figures were read. */
export function FreshnessChips({ posts, now = Date.now(), className }: { posts: ReportPost[]; now?: number; className?: string }) {
  const rows = platformFreshness(posts, now);
  if (rows.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="How current the figures are">
      {rows.map((f) => (
        <li key={f.platform} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[12px]">
          <span className={cn("h-1.5 w-1.5 rounded-full", FRESHNESS_DOT[f.status])} aria-hidden />
          <span className="font-medium">{f.label}</span>
          <span className="text-muted-foreground">{f.ageHours == null ? "no figures yet" : `updated ${formatAge(f.ageHours)}`}</span>
        </li>
      ))}
    </ul>
  );
}

function DeltaPill({ delta, days }: { delta: number; days: number }) {
  if (delta <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[12px] text-muted-foreground">
        No new views recorded in {days} days
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-good/10 px-2 py-0.5 text-[12px] font-medium text-status-good">
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden><path d="M4 1 7 6H1z" fill="currentColor" /></svg>
      {compact(delta)} in {days} days
    </span>
  );
}

type Totals = { likes: number; comments: number; shares: number };

function ViewsHero({ posts, totals, estimated, creators, roster, now, className }: {
  posts: ReportPost[];
  totals: Totals;
  estimated: { shares?: boolean };
  creators: number;
  roster?: number;
  now: number;
  className?: string;
}) {
  const total = viewsAt(posts, now);
  const week = periodDelta(posts, 7, now);
  const reading = readingSummary(posts, now);
  const who = roster && roster > creators ? `${creators} of ${roster} creators` : `${creators} creator${creators === 1 ? "" : "s"}`;

  const byPlatform = new Map<string, number>();
  for (const p of posts) {
    const k = platformKey(p.platform);
    const v = Math.max(0, ...p.history.map((h) => Number(h.views || 0)));
    byPlatform.set(k, (byPlatform.get(k) ?? 0) + v);
  }
  const [lead] = [...byPlatform.entries()].sort((a, b) => b[1] - a[1]);
  const sentence =
    `${compact(total)} views across ${posts.length} post${posts.length === 1 ? "" : "s"} from ${who}. ` +
    (byPlatform.size > 1 && lead && total > 0
      ? `${platformLabel(lead[0])} delivered ${pct(lead[1] / total)} of them.`
      : lead ? `All of it on ${platformLabel(lead[0])}.` : "");

  const rows = [
    { label: "Likes", value: compact(totals.likes) },
    { label: "Comments", value: compact(totals.comments) },
    { label: "Shares", value: compact(totals.shares), estimated: estimated.shares },
    { label: "Posts measured", value: `${reading.measured} of ${reading.total}` },
  ];

  return (
    <ReportCard
      title="Views"
      subtitle={reading.label}
      className={cn("flex flex-col", className)}
    >
      <div className="text-[56px] font-light leading-none tracking-[-0.035em] tabular-nums sm:text-[64px]">{compact(total)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DeltaPill delta={week.delta} days={7} />
        {week.delta > 0 && <span className="text-[12px] text-muted-foreground">since {shortDate(now - 7 * 24 * H)}</span>}
      </div>
      <p className="mt-4 max-w-[38ch] text-[13.5px] leading-relaxed text-muted-foreground">{sentence}</p>
      <dl className="mt-auto divide-y divide-border/70 pt-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
            <dt className="text-muted-foreground">
              {r.label}
              {r.estimated && <span className="ml-1.5 rounded border border-border px-1 py-px text-[10.5px]" title="Partly estimated where the platform does not report it">est.</span>}
            </dt>
            <dd className="font-medium tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </ReportCard>
  );
}

export type AddUpItem = { key: string; label: string; views: number; share: number };

/** Parts stacked into a whole: each hatched bar starts where the last one ended, and the solid bar is the total. */
export function AddUpBars({ items, total }: { items: AddUpItem[]; total: number }) {
  let acc = 0;
  return (
    <div className="space-y-3.5">
      {items.map((it) => {
        const left = (acc / total) * 100;
        const width = (it.views / total) * 100;
        acc += it.views;
        return (
          <div key={it.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate">{it.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">+{compact(it.views)}</span> {pct(it.share)}
              </span>
            </div>
            <div className="relative h-4">
              <div
                className="bar-hatch absolute inset-y-0 rounded-[4px]"
                style={{ left: `${left}%`, width: `max(${width}%, 3px)` }}
                title={`${it.label}: ${compact(it.views)} views, ${pct(it.share)} of the total`}
              />
            </div>
          </div>
        );
      })}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium">
          <span>Total</span>
          <span className="tabular-nums">{compact(total)}</span>
        </div>
        <div className="bar-solid h-4 rounded-[4px]" />
      </div>
    </div>
  );
}

function ContributionWaterfall({ posts, now, className }: { posts: ReportPost[]; now: number; className?: string }) {
  const all = contributions(posts, now).filter((r) => r.views > 0);
  const total = all.reduce((a, r) => a + r.views, 0);
  if (total === 0) return null;
  const top = all.slice(0, 5);
  const rest = all.slice(5);
  const items = [
    ...top.map((r) => ({ key: r.key, label: r.label, views: r.views, share: r.share })),
    ...(rest.length
      ? [{ key: "others", label: `${rest.length} other creator${rest.length === 1 ? "" : "s"}`, views: rest.reduce((a, r) => a + r.views, 0), share: rest.reduce((a, r) => a + r.share, 0) }]
      : []),
  ];
  const mainPlatform = (key: string) => {
    const r = all.find((x) => x.key === key);
    const best = r && Object.entries(r.platforms).sort((a, b) => b[1] - a[1])[0];
    return best ? platformLabel(best[0]) : null;
  };
  const callout =
    all.length >= 3 && all[0].share + all[1].share >= 0.6
      ? `${all[0].label} and ${all[1].label} delivered ${pct(all[0].share + all[1].share)} of views. ${all[0].label} is strongest on ${mainPlatform(all[0].key)}.`
      : `${all[0].label} leads with ${pct(all[0].share)} of views, mostly on ${mainPlatform(all[0].key)}.`;

  return (
    <ReportCard title="How the views add up" subtitle={`${compact(total)} views, creator by creator`} className={className}>
      <AddUpBars items={items} total={total} />
      <p className="mt-5 rounded-xl border border-border/70 bg-background/70 p-3.5 text-[13px] leading-relaxed">{callout}</p>
    </ReportCard>
  );
}


function WeeklyViews({ posts, now, className }: { posts: ReportPost[]; now: number; className?: string }) {
  const weeks = weeklyCumulative(posts, 12, now);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.value));
  const active = hover ?? weeks.length - 1;
  const w = weeks[active];
  const gain = active > 0 ? w.value - weeks[active - 1].value : null;
  return (
    <ReportCard
      title="Views by week"
      subtitle="Running campaign total at the end of each week"
      className={className}
      action={
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-light leading-none tracking-[-0.02em] tabular-nums">{compact(w.value)}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {w.current ? "this week" : `week to ${w.label}`}
            {gain != null && gain > 0 && <>, +{compact(gain)}</>}
          </div>
        </div>
      }
    >
      <div className="flex h-44 items-end gap-1.5 sm:gap-2" onMouseLeave={() => setHover(null)}>
        {weeks.map((wk, idx) => (
          <button
            key={wk.end}
            type="button"
            className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onMouseEnter={() => setHover(idx)}
            onFocus={() => setHover(idx)}
            onBlur={() => setHover(null)}
            aria-label={`${wk.current ? "This week" : `Week to ${wk.label}`}: ${compact(wk.value)} views`}
          >
            <span
              className={cn(
                "block w-full max-w-[28px] rounded-t-[4px] transition-opacity",
                wk.current ? "bar-solid" : "bar-hatch",
                hover != null && hover !== idx && "opacity-45",
              )}
              style={{ height: `${Math.max(2, (wk.value / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-muted-foreground">
        <span>{weeks[0].label}</span>
        <span>{weeks[weeks.length - 1].label}</span>
      </div>
    </ReportCard>
  );
}

const NOTE_TONE: Record<DataNote["tone"], Tone> = { ok: "good", warn: "warn", bad: "bad", info: "info" };

function DataNotes({ notes, view, className }: { notes: DataNote[]; view: "client" | "agency"; className?: string }) {
  if (notes.length === 0) return null;
  const issues = notes.filter((n) => n.tone === "bad" || n.tone === "warn").length;
  return (
    <ReportCard
      title={view === "agency" ? "Data health" : "About these numbers"}
      subtitle={issues ? `${issues} thing${issues === 1 ? "" : "s"} to know` : "Everything is current"}
      className={className}
    >
      <ToneList items={notes.map((n) => ({ key: n.title, tone: NOTE_TONE[n.tone], title: n.title, detail: n.detail }))} />
    </ReportCard>
  );
}

/**
 * The top of a campaign report: headline views, who delivered them, the
 * finding worth leading with, the weekly run, and how current it all is.
 */
export function ReportOverview({ posts, totals, estimated = {}, creators, roster, audience, view, campaignStatus, now = Date.now() }: {
  posts: ReportPost[];
  totals: Totals;
  estimated?: { shares?: boolean };
  /** Creators with at least one post. */
  creators: number;
  /** Creators on the campaign, posted or not. */
  roster?: number;
  audience?: { measured: number; creators: number };
  view: "client" | "agency";
  campaignStatus?: string | null;
  now?: number;
}) {
  const insights = useMemo(() => buildInsights(posts, now), [posts, now]);
  const notes = useMemo(
    () => buildDataNotes({ posts, now, view, audience, campaignStatus }),
    [posts, now, view, audience, campaignStatus],
  );
  if (posts.length === 0) return null;
  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-12">
      <ViewsHero posts={posts} totals={totals} estimated={estimated} creators={creators} roster={roster} now={now} className="lg:col-span-4" />
      <ContributionWaterfall posts={posts} now={now} className={insights.length ? "lg:col-span-4" : "lg:col-span-8"} />
      <PatternCard findings={insights} className="lg:col-span-4" />
      <WeeklyViews posts={posts} now={now} className="lg:col-span-8" />
      <DataNotes notes={notes} view={view} className="lg:col-span-4" />
    </div>
  );
}
