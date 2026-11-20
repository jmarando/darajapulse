// Listening's analytics panels: the headline numbers, the sentiment score and its course over
// time, where posts come from, the phrases people use, and the voices with the most views.

import { Link } from "react-router-dom";
import { Frown, Meh, Smile } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "@/components/dash/Panel";
import { DeltaChip, StatusChip } from "@/components/dash/chips";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, moodShare, netMood, type Mood, type MoodDay, type PlatformRow, type Totals } from "@/lib/listening";
import { moodPeaks, moodVerdict, phraseTable, type KeyMetric, type KeyMetrics as Metrics, type Phrase, type Voice } from "@/lib/listeningAnalytics";
import { fmtNum, fmtShort } from "@/lib/reporting";

const MOODS = ["positive", "neutral", "negative"] as const;
const MOOD_LABEL: Record<Mood, string> = { positive: "Positive", neutral: "Neutral", negative: "Negative" };
const MOOD_COLOR: Record<Mood, string> = {
  positive: "hsl(var(--status-good))",
  neutral: "hsl(var(--muted-foreground) / 0.45)",
  negative: "hsl(var(--status-bad))",
};
const MOOD_DOT: Record<Mood, string> = { positive: "bg-status-good", neutral: "bg-muted-foreground/45", negative: "bg-status-bad" };
// Text inside a filled block: light on the darker light-mode fills, dark on the lighter dark-mode ones.
const MOOD_BLOCK: Record<Mood, string> = {
  positive: "bg-status-good text-white dark:text-neutral-950",
  neutral: "bg-muted-foreground/30 text-foreground",
  negative: "bg-status-bad text-white dark:text-neutral-950",
};
const AXIS = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false } as const;

const count = (n: number, word: string) => `${fmtNum(n)} ${word}${n === 1 ? "" : "s"}`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const shortDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};

/** A signed change chip, or "New" when the period before had nothing to compare with. */
function Change({ change, value, unit = "%" }: { change: number | null; value: number; unit?: string }) {
  if (change === null) return value > 0 ? <StatusChip tone="neutral">New</StatusChip> : null;
  return <DeltaChip delta={change}>{change === 0 ? "No change" : `${signed(change)}${unit}`}</DeltaChip>;
}

function MetricTile({ label, metric, format, note, compare }: {
  label: string;
  metric: KeyMetric;
  format: (n: number) => string;
  note?: string;
  compare: boolean;
}) {
  return (
    <div className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-[34px] font-light leading-none tracking-[-0.03em] sm:text-[40px]">{format(metric.value)}</dd>
      {compare && (
        <dd className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Change change={metric.change} value={metric.value} />
          {metric.change !== null && <span className="text-[12px] text-muted-foreground">from {format(metric.previous)}</span>}
        </dd>
      )}
      {note && <dd className="mt-2 text-[11.5px] leading-snug text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** The four headline numbers, each against the period before. */
export function KeyMetrics({ metrics, compare, brandName, rangeLabel, postsHref }: {
  metrics: Metrics;
  compare: boolean;
  brandName: string;
  rangeLabel: string;
  postsHref: string;
}) {
  const reported = (n: number) => (n ? fmtShort(n) : "—");
  return (
    <Panel
      title="Key metrics"
      subtitle={`Posts about ${brandName}, ${rangeLabel}${compare ? ", against the same number of days before" : ""}`}
      action={<Link to={postsHref} className="whitespace-nowrap text-[12.5px] text-muted-foreground hover:text-foreground">See posts</Link>}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border/70">
        <MetricTile label="Mentions" metric={metrics.mentions} format={fmtNum} compare={compare} />
        <MetricTile label="Views" metric={metrics.views} format={reported} compare={compare} note="TikTok and YouTube report views." />
        <MetricTile label="Shares" metric={metrics.shares} format={reported} compare={compare} note="TikTok reports shares." />
        <MetricTile label="Creators" metric={metrics.creators} format={fmtNum} compare={compare} />
      </dl>
    </Panel>
  );
}

/** Where the net sentiment sits between -100 and +100: a track from negative to positive with a marker. */
function NetMeter({ net }: { net: number }) {
  return (
    <div className="mt-6" aria-hidden>
      <div className="relative h-2">
        <div className="absolute inset-y-0 left-0 w-1/2 rounded-l-full bg-status-bad/20" />
        <div className="absolute inset-y-0 right-0 w-1/2 rounded-r-full bg-status-good/20" />
        <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-muted-foreground/50" />
        <div
          className={cn(
            "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
            net > 0 ? "bg-status-good" : net < 0 ? "bg-status-bad" : "bg-muted-foreground",
          )}
          style={{ left: `${(net + 100) / 2}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>-100</span>
        <span>0</span>
        <span>+100</span>
      </div>
    </div>
  );
}

/** The split of the posts read, one block per mood, with its share printed where it fits. */
function MoodBar({ shares }: { shares: Record<Mood, number> }) {
  return (
    <div
      role="img"
      aria-label={`${shares.positive}% positive, ${shares.neutral}% neutral, ${shares.negative}% negative`}
      className="mt-5 flex h-7 gap-0.5"
    >
      {MOODS.filter((m) => shares[m] > 0).map((m) => (
        <div
          key={m}
          className={cn("flex h-full min-w-0 items-center rounded px-2 text-[12px] font-medium tabular-nums", MOOD_BLOCK[m])}
          style={{ flexGrow: shares[m], flexBasis: 0 }}
        >
          {shares[m] >= 12 ? `${shares[m]}%` : null}
        </div>
      ))}
    </div>
  );
}

const VERDICT_ICON = { "Mostly positive": Smile, "Mostly neutral": Meh, "Mostly negative": Frown, Mixed: Meh } as const;

/** The net sentiment against the period before, and how the posts read split between the moods. */
export function SentimentScore({ now, before, compare, brandName, rangeLabel, className }: {
  now: Totals;
  before: Totals;
  compare: boolean;
  brandName: string;
  rangeLabel: string;
  className?: string;
}) {
  const net = netMood(now);
  const previous = netMood(before);
  const shift = compare && net !== null && previous !== null ? net - previous : null;
  const verdict = moodVerdict(now);
  const shares = { positive: moodShare(now, "positive") ?? 0, neutral: moodShare(now, "neutral") ?? 0, negative: moodShare(now, "negative") ?? 0 };
  const unread = now.mentions - now.rated;
  const Icon = verdict ? VERDICT_ICON[verdict] : Meh;
  const lead = verdict && verdict !== "Mixed" ? (verdict.split(" ")[1] as Mood) : null;

  return (
    <Panel className={className} title="Sentiment score" subtitle={`Posts about ${brandName} read for mood, ${rangeLabel}`}>
      {net === null || verdict === null ? (
        <p className="py-6 text-[13px] text-muted-foreground">No posts have been read for mood yet. New posts are read within the hour.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[12.5px] text-muted-foreground">Net sentiment</p>
            <p className="mt-2 text-[56px] font-light leading-none tracking-[-0.035em]">{signed(net)}</p>
            {shift !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Change change={shift} value={net} unit=" pts" />
                <span className="text-[12px] text-muted-foreground">from {signed(previous!)} in the period before</span>
              </div>
            )}
            <NetMeter net={net} />
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">The share of positive posts minus the share of negative ones.</p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-medium">
              <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              {verdict}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {lead
                ? `${shares[lead]}% of the ${count(now.rated, "post")} read were ${lead}.`
                : `${shares.positive}% positive and ${shares.negative}% negative across the ${count(now.rated, "post")} read.`}
            </p>
            <MoodBar shares={shares} />
            <ul className="mt-3 space-y-1.5 text-[12.5px]">
              {MOODS.map((m) => (
                <li key={m} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", MOOD_DOT[m])} aria-hidden />
                    {MOOD_LABEL[m]}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{count(now[m], "post")}</span>
                </li>
              ))}
            </ul>
            {unread > 0 && <p className="mt-3 text-[12px] text-muted-foreground">{count(unread, "post")} not read yet.</p>}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** A face on the chart's most positive or most negative day. */
function PeakMarker({ cx, cy, mood }: { cx?: number; cy?: number; mood: "positive" | "negative" }) {
  if (cx == null || cy == null) return null;
  const Icon = mood === "positive" ? Smile : Frown;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={MOOD_COLOR[mood]} stroke="hsl(var(--card))" strokeWidth={2} />
      <Icon x={cx - 7} y={cy - 7} width={14} height={14} color="hsl(var(--card))" strokeWidth={2.25} aria-hidden />
    </g>
  );
}

/** Posts read for mood per day, one line per mood, with the most positive and most negative day marked. */
export function SentimentOverTime({ days, rated, unread, brandName, rangeLabel }: {
  days: MoodDay[];
  rated: number;
  unread: number;
  brandName: string;
  rangeLabel: string;
}) {
  const peaks = moodPeaks(days);
  const any = days.some((d) => d.positive + d.neutral + d.negative > 0);
  return (
    <Panel
      title="Sentiment over time"
      subtitle={`Posts about ${brandName} read for mood, per day, ${rangeLabel}`}
      action={
        <div className="hidden shrink-0 text-right sm:block">
          <div className="text-[20px] font-light leading-none tracking-[-0.02em]">{fmtShort(rated)}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">posts read for mood</div>
        </div>
      }
    >
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {MOODS.map((m) => (
          <li key={m} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: MOOD_COLOR[m] }} aria-hidden />
            {MOOD_LABEL[m]}
          </li>
        ))}
      </ul>
      {any ? (
        <>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days} margin={{ top: 14, right: 14, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                {/* Dates that would run into each other on a narrow screen are skipped, keeping the first and last. */}
                <XAxis dataKey="day" tickFormatter={shortDay} interval="preserveStartEnd" minTickGap={18} padding={{ left: 14, right: 14 }} {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  labelFormatter={(v) => shortDay(String(v))}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 }}
                />
                {MOODS.map((m) => (
                  <Line
                    key={m}
                    dataKey={m}
                    name={MOOD_LABEL[m]}
                    type="monotone"
                    stroke={MOOD_COLOR[m]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    isAnimationActive={false}
                  />
                ))}
                {peaks.positive && (
                  <ReferenceDot x={peaks.positive.day} y={peaks.positive.positive} shape={(p: { cx?: number; cy?: number }) => <PeakMarker {...p} mood="positive" />} />
                )}
                {peaks.negative && (
                  <ReferenceDot x={peaks.negative.day} y={peaks.negative.negative} shape={(p: { cx?: number; cy?: number }) => <PeakMarker {...p} mood="negative" />} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted-foreground">
            {peaks.positive && <p>Most positive day: {shortDay(peaks.positive.day)}, {count(peaks.positive.positive, "post")}</p>}
            {peaks.negative && <p>Most negative day: {shortDay(peaks.negative.day)}, {count(peaks.negative.negative, "post")}</p>}
          </div>
        </>
      ) : (
        <p className="py-10 text-[13px] text-muted-foreground">No posts have been read for mood yet. New posts are read within the hour.</p>
      )}
      {unread > 0 && <p className="mt-2 text-[12px] text-muted-foreground">{count(unread, "post")} not read yet.</p>}
    </Panel>
  );
}

/** The share of posts on each platform, largest first, one bar each. */
export function Sources({ platforms, brandName, rangeLabel, className }: {
  platforms: PlatformRow[];
  brandName: string;
  rangeLabel: string;
  className?: string;
}) {
  // Platforms that give no view counts (Reddit, Instagram, news and the web), named so a zero isn't read as no audience.
  const noViews = platforms.filter((p) => !p.viewsKnown).map((p) => p.label);
  return (
    <Panel className={className} title="Sources" subtitle={`Where posts about ${brandName} were found, ${rangeLabel}`}>
      {platforms.length ? (
        <ul className="space-y-4">
          {platforms.map((p) => (
            <li key={p.key}>
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="font-medium">{p.label}</span>
                <span className="shrink-0 tabular-nums">
                  {p.share}%<span className="ml-2 text-[12px] text-muted-foreground">{count(p.mentions, "post")}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-secondary/70" aria-hidden>
                <div className="h-full rounded-l-[2px] rounded-r-[4px] bg-[hsl(var(--series-2))]" style={{ width: `${Math.max(p.share, p.mentions ? 1 : 0)}%` }} />
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{p.viewsKnown ? `${fmtShort(p.reach)} views` : "No views reported"}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">No posts about your brand yet.</p>
      )}
      {noViews.length > 0 && (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          {`Views aren't reported for ${noViews.length === 1 ? noViews[0] : `${noViews.slice(0, -1).join(", ")} or ${noViews[noViews.length - 1]}`}, so those posts count in mentions only.`}
        </p>
      )}
    </Panel>
  );
}

const CLOUD_SIZE = ["text-[13px]", "text-[15px]", "text-[18px]", "text-[22px]", "text-[27px]"];

/** Top phrases or hashtags with how much each moved since the period before. */
function PhraseList({ title, current, previous, compare }: { title: string; current: Phrase[]; previous: Phrase[]; compare: boolean }) {
  const rows = phraseTable(current, previous, 6);
  return (
    <div className="min-w-0">
      <h3 className="text-[12.5px] text-muted-foreground">{title}</h3>
      {rows.length ? (
        <ol className="mt-1 divide-y divide-border/70">
          {rows.map((r) => (
            <li key={r.phrase} className="flex items-center gap-3 py-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1 truncate">{r.phrase}</span>
              {compare && <Change change={r.change} value={r.posts} />}
              <span className="flex w-24 shrink-0 items-center gap-2" title={`Popularity ${r.score} of 100`}>
                <span className="h-1.5 flex-1 rounded-full bg-secondary/70" aria-hidden>
                  <span className="block h-full rounded-l-[2px] rounded-r-[4px] bg-[hsl(var(--series-2))]" style={{ width: `${r.score}%` }} />
                </span>
                <span className="w-8 text-right text-[12px] tabular-nums text-muted-foreground">{r.posts}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[12.5px] text-muted-foreground">None used in two posts or more yet.</p>
      )}
    </div>
  );
}

/** What people say: a cloud of the phrases and hashtags in the most posts, and the top of each against the period before. */
export function PopularPhrases({ phrases, previous, compare, brandName, rangeLabel }: {
  /** This period's phrases, most-used first. */
  phrases: Phrase[];
  /** The period before's phrases, including those in a single post. */
  previous: Phrase[];
  compare: boolean;
  brandName: string;
  rangeLabel: string;
}) {
  const cloud = phrases.slice(0, 40);
  // A phone shows the top 24, so the cloud doesn't fill the whole screen.
  const rank = new Map(cloud.map((p, i) => [p.phrase, i]));
  const most = cloud[0]?.posts ?? 0;
  const least = cloud[cloud.length - 1]?.posts ?? 0;
  const size = (posts: number) => Math.round(((posts - least) / (most - least || 1)) * (CLOUD_SIZE.length - 1));
  const isTag = (p: Phrase) => p.phrase.startsWith("#");

  return (
    <Panel title="Most popular phrases" subtitle={`What posts about ${brandName} say, ${rangeLabel}`}>
      {cloud.length ? (
        <>
          <ul className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1.5 px-1 py-2 sm:px-6">
            {/* A-to-Z, reading a hashtag by its word, so hashtags and phrases mix instead of forming two clumps. */}
            {[...cloud].sort((a, b) => a.phrase.replace(/^#/, "").localeCompare(b.phrase.replace(/^#/, ""))).map((p) => {
              const step = size(p.posts);
              return (
                <li
                  key={p.phrase}
                  title={count(p.posts, "post")}
                  className={cn(
                    "leading-tight tracking-[-0.01em]",
                    rank.get(p.phrase)! >= 24 && "hidden sm:block",
                    CLOUD_SIZE[step],
                    step >= 3 ? "font-medium text-foreground" : step >= 1 ? "text-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {p.phrase}
                </li>
              );
            })}
          </ul>
          <div className="mt-5 grid gap-6 border-t border-border/70 pt-5 md:grid-cols-2 md:gap-8">
            <PhraseList title="Phrases" current={phrases.filter((p) => !isTag(p))} previous={previous.filter((p) => !isTag(p))} compare={compare} />
            <PhraseList title="Hashtags" current={phrases.filter(isTag)} previous={previous.filter(isTag)} compare={compare} />
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">Phrases appear once a few posts about {brandName} use the same words.</p>
      )}
    </Panel>
  );
}

/** The people whose posts about the brand were seen most, each linked to their most-seen post. */
export function TopVoices({ voices, brandName, rangeLabel, className }: {
  voices: Voice[];
  brandName: string;
  rangeLabel: string;
  className?: string;
}) {
  const most = Math.max(1, ...voices.map((v) => v.views));
  return (
    <Panel className={className} title="Top voices" subtitle={`Who posted about ${brandName}, most views first, ${rangeLabel}`}>
      {voices.length ? (
        <ol className="-my-1 divide-y divide-border/70">
          {voices.map((v) => (
            <li key={v.author} className="py-3">
              <a href={v.topUrl} target="_blank" rel="noreferrer" className="group block">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13.5px] font-medium group-hover:underline">{v.author}</span>
                  <span className="shrink-0 text-[13px] tabular-nums">{v.viewsKnown ? `${fmtShort(v.views)} views` : "No views reported"}</span>
                </span>
                {v.views > 0 && (
                  <span className="mt-1.5 block h-2 rounded-full bg-secondary/70" aria-hidden>
                    <span className="block h-full rounded-l-[2px] rounded-r-[4px] bg-[hsl(var(--series-2))]" style={{ width: `${Math.max(1, (v.views / most) * 100)}%` }} />
                  </span>
                )}
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  {SOURCE_LABEL[v.source] ?? v.source} · {count(v.posts, "post")}{v.negative ? ` · ${v.negative} negative` : ""}
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-muted-foreground">No post about {brandName} names its author yet.</p>
      )}
    </Panel>
  );
}
