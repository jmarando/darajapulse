import { useMemo } from "react";
import { ArrowUpRight, Ear } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dash/Panel";
import { StatusChip } from "@/components/dash/chips";
import {
  KIND_LABEL, SOURCE_LABEL, mentionDate, moodByDay, moodShare, needsAttention, netMood, onTopic, shareOfVoice,
  themes, totals, withinDays, type ListeningMention, type ListeningTopic,
} from "@/lib/listening";
import { fmtShort } from "@/lib/reporting";

const AXIS = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false } as const;
const MOOD_COLOR = {
  positive: "hsl(var(--status-good))",
  neutral: "hsl(var(--muted-foreground) / 0.35)",
  negative: "hsl(var(--status-bad))",
};

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-[20px] border border-border/70 bg-card p-5">
    <p className="text-[12.5px] text-muted-foreground">{label}</p>
    <p className="mt-2 text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums">{value}</p>
    {hint && <p className="mt-2 text-[12px] text-muted-foreground">{hint}</p>}
  </div>
);

const shortDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};

export default function ListeningOverview({ brandName, topics, mentions, onAddKeywords }: {
  brandName: string;
  topics: ListeningTopic[];
  mentions: ListeningMention[];
  onAddKeywords: () => void;
}) {
  const brandIds = useMemo(() => new Set(topics.filter((t) => t.kind === "brand").map((t) => t.id)), [topics]);
  const relevant = useMemo(() => onTopic(mentions), [mentions]);
  // Posts about the brand, once each even when two of its keywords found the same post.
  const own = useMemo(() => {
    const seen = new Set<string>();
    return relevant.filter((m) => brandIds.has(m.topic_id) && !seen.has(m.url) && !!seen.add(m.url));
  }, [relevant, brandIds]);
  const ownWeek = useMemo(() => totals(withinDays(own, 7)), [own]);
  const ownMonth = useMemo(() => totals(own), [own]);
  const voices = useMemo(() => shareOfVoice(topics, mentions, brandName), [topics, mentions, brandName]);
  const days = useMemo(() => moodByDay(own, 30), [own]);
  const themeRows = useMemo(() => themes(own).slice(0, 6), [own]);
  const attention = useMemo(() => needsAttention(topics, withinDays(mentions, 7)), [topics, mentions]);
  const topicLabel = useMemo(() => new Map(topics.map((t) => [t.id, t.label])), [topics]);

  if (!topics.length) {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3 py-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary"><Ear className="h-5 w-5 text-muted-foreground" aria-hidden /></span>
          <h2 className="text-[17px] font-medium">Start listening</h2>
          <p className="max-w-lg text-[14px] text-muted-foreground">
            Add your brand name, your competitors and the category you sell in. We search TikTok, YouTube and Reddit for them
            twice a day and read the mood of every post.
          </p>
          <Button size="sm" onClick={onAddKeywords}>Add keywords</Button>
        </div>
      </Panel>
    );
  }

  const net = netMood(ownMonth);
  const hasBrand = brandIds.size > 0;
  const hasCompetitor = topics.some((t) => t.kind === "competitor");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Mentions this week" value={fmtShort(ownWeek.mentions)} hint={`${fmtShort(ownMonth.mentions)} in 30 days`} />
        <Stat label="Net mood" value={net === null ? "—" : `${net > 0 ? "+" : ""}${net}`} hint="Positive share minus negative, 30 days" />
        <Stat label="Negative" value={moodShare(ownMonth, "negative") === null ? "—" : `${moodShare(ownMonth, "negative")}%`} hint={`${ownMonth.negative} of ${ownMonth.rated} rated posts`} />
        <Stat label="Views on those posts" value={fmtShort(ownMonth.reach)} hint="TikTok and YouTube views, 30 days" />
      </div>
      {!hasBrand && (
        <p className="text-[13px] text-muted-foreground">Add a keyword marked “Your brand” to see your own mood and mentions here.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Share of voice" subtitle="On-topic mentions in the last 30 days" className="lg:col-span-2">
          {voices.length ? (
            <ul className="space-y-4">
              {voices.map((v) => (
                <li key={v.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="min-w-0 truncate">
                      {v.label}
                      <span className="ml-2 text-[12px] text-muted-foreground">{KIND_LABEL[v.kind]}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{v.share}%<span className="ml-2 text-[12px] text-muted-foreground">{v.mentions}</span></span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(v.share, v.mentions ? 2 : 0)}%`, background: v.kind === "brand" ? "hsl(var(--series))" : "hsl(var(--series-2))" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Add your brand and a competitor to compare.</p>
          )}
          {voices.length > 0 && !hasCompetitor && (
            <p className="mt-4 text-[12.5px] text-muted-foreground">Add a competitor keyword to compare against.</p>
          )}
        </Panel>

        <Panel title="Mood over time" subtitle="Posts about your brand per day, by mood" className="lg:col-span-3">
          <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
            {(["positive", "neutral", "negative"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: MOOD_COLOR[k] }} aria-hidden />
                {k[0].toUpperCase() + k.slice(1)}
              </span>
            ))}
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tickFormatter={shortDay} interval={6} {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary))" }}
                  labelFormatter={(v) => shortDay(String(v))}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Bar dataKey="positive" name="Positive" stackId="m" fill={MOOD_COLOR.positive} maxBarSize={24} />
                <Bar dataKey="neutral" name="Neutral" stackId="m" fill={MOOD_COLOR.neutral} maxBarSize={24} />
                <Bar dataKey="negative" name="Negative" stackId="m" fill={MOOD_COLOR.negative} maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What people talk about" subtitle="Themes in posts about your brand, 30 days">
          {themeRows.length ? (
            <ul className="divide-y divide-border/70">
              {themeRows.map((t) => (
                <li key={t.theme} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                  <span className="capitalize">{t.theme}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{t.mentions} post{t.mentions === 1 ? "" : "s"}</span>
                    {t.negative > t.positive ? (
                      <StatusChip tone="bad">Mostly negative</StatusChip>
                    ) : t.positive > t.negative ? (
                      <StatusChip tone="good">Mostly positive</StatusChip>
                    ) : (
                      <StatusChip tone="neutral">Mixed</StatusChip>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Themes appear once posts about your brand have been read.</p>
          )}
        </Panel>

        <Panel title="Needs attention" subtitle="Negative posts about your brand this week, most seen first">
          {attention.length ? (
            <ul className="divide-y divide-border/70">
              {attention.map((m) => (
                <li key={m.id} className="py-2.5">
                  <a href={m.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[13.5px] group-hover:underline">{m.title || m.snippet || m.url}</span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {SOURCE_LABEL[m.source] ?? m.source}{m.author ? ` · ${m.author}` : ""} · {topicLabel.get(m.topic_id)}
                        {m.reach ? ` · ${fmtShort(m.reach)} views` : ""} · {new Date(mentionDate(m)).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No negative posts about your brand this week.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
