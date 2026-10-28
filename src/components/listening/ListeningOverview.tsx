import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Ear } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dash/Panel";
import { PatternCard, type Finding } from "@/components/dash/PatternCard";
import { DeltaChip, StatusChip } from "@/components/dash/chips";
import { ToneList, type ToneItem } from "@/components/dash/ToneList";
import { cn } from "@/lib/utils";
import {
  CREDITS_PER_SEARCH, DAILY_CREDITS, KIND_LABEL, SOURCE_LABEL, mentionDate, moodByDay, moodShare, needsAttention, netMood,
  onTopic, platformMix, shareOfVoice, sweepStatus, themes, topMentions, totals, weekChange, withinDays,
  type ListeningMention, type ListeningTopic,
} from "@/lib/listening";
import { fmtShort } from "@/lib/reporting";

const AXIS = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false } as const;
const MOOD_COLOR = {
  positive: "hsl(var(--status-good))",
  neutral: "hsl(var(--muted-foreground) / 0.35)",
  negative: "hsl(var(--status-bad))",
};
const MOOD_TONE = { positive: "good", neutral: "neutral", negative: "bad" } as const;

const shortDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

const since = (iso: string | null, now: number) => {
  if (!iso) return "not yet";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  );
}

export default function ListeningOverview({ brandName, topics, mentions, creditsToday, showCredits, onAddKeywords }: {
  brandName: string;
  topics: ListeningTopic[];
  mentions: ListeningMention[];
  creditsToday: number | null;
  /** Agency staff see the day's credit use. */
  showCredits: boolean;
  onAddKeywords: () => void;
}) {
  const { search, pathname } = useLocation();
  const now = Date.now();
  const brandIds = useMemo(() => new Set(topics.filter((t) => t.kind === "brand").map((t) => t.id)), [topics]);
  const relevant = useMemo(() => onTopic(mentions), [mentions]);
  // Posts about the brand, once each even when two of its keywords found the same post.
  const own = useMemo(() => {
    const seen = new Set<string>();
    return relevant.filter((m) => brandIds.has(m.topic_id) && !seen.has(m.url) && !!seen.add(m.url));
  }, [relevant, brandIds]);
  const ownWeek = useMemo(() => totals(withinDays(own, 7)), [own]);
  const ownMonth = useMemo(() => totals(own), [own]);
  const week = useMemo(() => weekChange(own), [own]);
  const creators = useMemo(
    () => new Set(own.map((m) => m.author?.trim().toLowerCase()).filter((a): a is string => !!a)).size,
    [own],
  );
  const platforms = useMemo(() => platformMix(own), [own]);
  const allThemes = useMemo(() => themes(own), [own]);
  const themeRows = allThemes.slice(0, 6);
  const voices = useMemo(() => shareOfVoice(topics, mentions, brandName), [topics, mentions, brandName]);
  const days = useMemo(() => moodByDay(own, 30), [own]);
  const attention = useMemo(() => needsAttention(topics, withinDays(mentions, 7)), [topics, mentions]);
  const top = useMemo(() => topMentions(relevant, 5), [relevant]);
  const latestNegative = useMemo(
    () => own
      .filter((m) => m.sentiment === "negative")
      .sort((a, b) => Date.parse(mentionDate(b)) - Date.parse(mentionDate(a)))[0] ?? null,
    [own],
  );
  const topicLabel = useMemo(() => new Map(topics.map((t) => [t.id, t.label])), [topics]);
  const sweep = useMemo(() => sweepStatus(topics), [topics]);

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
          <ul className="grid w-full gap-3 pt-1 text-[13px] text-muted-foreground sm:grid-cols-3">
            <li><span className="font-medium text-foreground">1. Your brand</span><br />The name, product or campaign hashtag you want to watch.</li>
            <li><span className="font-medium text-foreground">2. Competitors</span><br />Rivals, to compare share of voice and mood against.</li>
            <li><span className="font-medium text-foreground">3. Your category</span><br />What you sell, so you hear the wider conversation.</li>
          </ul>
          <Button size="sm" onClick={onAddKeywords}>Add keywords</Button>
        </div>
      </Panel>
    );
  }

  if (!relevant.length) {
    const lastScan = sweep.lastScan;
    const failing = topics.find((t) => t.active && t.last_note);
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3 py-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary"><Ear className="h-5 w-5 text-muted-foreground" aria-hidden /></span>
          <h2 className="text-[17px] font-medium">{sweep.active ? `Listening is on for ${brandName}` : "Listening is paused"}</h2>
          <p className="max-w-xl text-[14px] text-muted-foreground">
            {sweep.active
              ? `We search ${count(sweep.active, "keyword")} on TikTok, YouTube and Reddit twice a day. Nothing on-topic has come back yet.`
              : "Every keyword is paused, so nothing is being searched. Turn one on to start listening again."}
          </p>
          {failing && <p className="text-[12.5px] text-status-warn">{failing.last_note}</p>}
          <dl className="mt-2 grid w-full gap-6 pt-2 sm:grid-cols-3">
            <Figure label="Active keywords" value={String(sweep.active)} />
            <Figure label="Last search" value={lastScan ? since(lastScan, now) : "Waiting"} />
            <Figure label="Posts found" value={fmtShort(mentions.length)} />
          </dl>
          <p className="text-[12.5px] text-muted-foreground">New keywords are searched within the hour; the rest at least twice a day.</p>
          <Button size="sm" onClick={onAddKeywords}>{sweep.active ? "Add keywords" : "Manage keywords"}</Button>
        </div>
      </Panel>
    );
  }

  const hasBrand = brandIds.size > 0;
  const lead = platforms[0];
  const positive = moodShare(ownMonth, "positive");
  const neutral = moodShare(ownMonth, "neutral");
  const negative = moodShare(ownMonth, "negative");
  const net = netMood(ownMonth);
  const unread = ownMonth.mentions - ownMonth.rated;
  const scanAge = sweep.lastScan ? now - Date.parse(sweep.lastScan) : null;
  const lastNegativeDays = latestNegative ? Math.max(0, Math.floor((now - Date.parse(mentionDate(latestNegative))) / 86_400_000)) : null;

  const hrefFor = (tab: "mentions" | "keywords") => {
    const next = new URLSearchParams(search);
    next.set("tab", tab);
    return `${pathname}?${next.toString()}`;
  };

  const sentence = ownMonth.mentions === 0
    ? "No on-topic posts about your brand have come back yet. The sweep checks again within 12 hours."
    : `${count(ownMonth.mentions, "post")} in the last 30 days${creators ? ` from ${count(creators, "creator")}` : ""}` +
      `${lead ? `, ${lead.share}% of them on ${lead.label}` : ""}. ` +
      (positive == null ? "The AI hasn't read their mood yet." : `${positive}% of the posts it read are positive.`);

  const findings: Finding[] = [];
  if (voices.length > 1) {
    const leader = voices[0];
    const brandVoice = voices.find((v) => v.kind === "brand");
    if (leader.kind === "brand") {
      const gap = voices[1] ? Math.round((leader.share - voices[1].share) * 10) / 10 : null;
      findings.push({
        value: `${leader.share}%`,
        caption: "of the conversation",
        headline: `${brandName} is leading`,
        body: voices[1]
          ? `${count(leader.mentions, "on-topic post")}${gap != null ? `, ${gap} points ahead of ${voices[1].label}` : ""}.`
          : `${count(leader.mentions, "on-topic post")} about you.`,
        action: { label: "See the posts", to: hrefFor("mentions") },
      });
    } else {
      findings.push({
        value: `${leader.share}%`,
        caption: `of the conversation for ${leader.label}`,
        headline: `${leader.label} is leading the conversation`,
        body: brandVoice
          ? `${brandName} holds ${brandVoice.share}% with ${count(brandVoice.mentions, "post")}. Product or campaign keywords can widen what we find.`
          : "You haven't marked a brand keyword yet, so there is no share of your own to compare.",
        action: { label: brandVoice ? "See the posts" : "Add a keyword", to: hrefFor(brandVoice ? "mentions" : "keywords") },
      });
    }
  }
  if (ownMonth.rated >= 3 && negative != null && negative >= 25) {
    const worst = allThemes.find((t) => t.negative > 0);
    const seen = attention[0];
    findings.push({
      value: `${negative}%`,
      caption: "of rated posts are negative",
      headline: "Negative posts are worth answering",
      body: `${ownMonth.negative} of ${ownMonth.rated} posts we read are negative${worst ? `, mostly about ${worst.theme}` : ""}.` +
        (seen?.reach ? ` The most seen has ${fmtShort(seen.reach)} views.` : ""),
      action: { label: "Review them", to: hrefFor("mentions") },
    });
  } else if (ownMonth.rated >= 3 && net != null && net >= 40) {
    findings.push({
      value: `${net > 0 ? "+" : ""}${net}`,
      caption: "net mood, 30 days",
      headline: "The mood is on your side",
      body: `${positive}% of the posts we read are positive against ${negative}% negative.`,
    });
  }
  if (findings.length < 3 && lead && lead.share >= 60 && lead.mentions >= 5) {
    findings.push({
      value: `${lead.share}%`,
      caption: `of posts are on ${lead.label}`,
      headline: `${lead.label} is where the conversation happens`,
      body: `${lead.mentions} of ${count(ownMonth.mentions, "post")}${lead.viewsKnown ? `, ${fmtShort(lead.reach)} views` : ""}.` +
        (platforms[1] ? ` ${platforms[1].label} is second with ${platforms[1].share}%.` : ""),
    });
  }

  const coverage: ToneItem[] = [];
  if (sweep.failing > 0) {
    coverage.push({
      key: "failing",
      tone: "bad",
      title: `${count(sweep.failing, "keyword")} couldn't run`,
      detail: topics.find((t) => t.active && t.last_note)?.last_note ?? "Check the listening sweep logs.",
    });
  }
  coverage.push({
    key: "scan",
    tone: scanAge == null ? "neutral" : scanAge < 13 * 3600_000 ? "good" : scanAge < 25 * 3600_000 ? "warn" : "bad",
    title: sweep.lastScan ? `Last search ${since(sweep.lastScan, now)}` : "No search has run yet",
    detail: `${count(sweep.active, "active keyword")}${sweep.paused ? ` · ${sweep.paused} paused` : ""}`,
  });
  if (sweep.never > 0) {
    coverage.push({
      key: "never",
      tone: "warn",
      title: `${count(sweep.never, "keyword")} not searched yet`,
      detail: "New keywords are searched within the hour.",
    });
  }
  if (!hasBrand) {
    coverage.push({
      key: "brand",
      tone: "warn",
      title: "No brand keyword",
      detail: "Add the name, product or hashtag you want to watch.",
    });
  }
  if (showCredits && creditsToday !== null) {
    coverage.push({
      key: "credits",
      tone: "neutral",
      title: `${creditsToday} of ${DAILY_CREDITS} credits used today`,
      detail: `Each keyword search costs ${CREDITS_PER_SEARCH}.`,
    });
  }

  const leader = voices[0];
  const brandVoice = voices.find((v) => v.kind === "brand");
  const voiceCallout = !leader
    ? null
    : leader.kind === "brand"
      ? `${brandName} holds ${leader.share}% of the conversation${voices[1] ? `, ahead of ${voices[1].label} on ${voices[1].share}%` : ""}.`
      : brandVoice
        ? `${leader.label} holds ${leader.share}% of the conversation; ${brandName} has ${brandVoice.share}%.`
        : `${leader.label} holds ${leader.share}% of the conversation.`;
  const themedTotal = allThemes.reduce((n, t) => n + t.mentions, 0);
  const ratedDays = days.some((d) => d.positive + d.neutral + d.negative > 0);

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <Panel
          className={cn("flex flex-col", findings.length ? "lg:col-span-4" : "lg:col-span-6")}
          title="The conversation"
          subtitle={`Posts about ${brandName}, last 7 days`}
          action={<Link to={hrefFor("mentions")} className="whitespace-nowrap text-[12.5px] text-muted-foreground hover:text-foreground">See posts</Link>}
        >
          <div className="flex flex-1 flex-col">
            <div className="text-[56px] font-light leading-none tracking-[-0.035em] tabular-nums">{fmtShort(week.current)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {week.previous > 0 ? (
                <DeltaChip delta={week.delta}>{week.delta === 0 ? "No change" : `${week.delta > 0 ? "+" : ""}${week.delta} vs last week`}</DeltaChip>
              ) : week.current > 0 ? (
                <StatusChip tone="info">First week of posts</StatusChip>
              ) : (
                <StatusChip tone="neutral">No posts this week</StatusChip>
              )}
              <span className="text-[12px] text-muted-foreground">
                {week.previous > 0 ? `${fmtShort(week.previous)} the week before` : "Listening has just started"}
              </span>
            </div>
            <p className="mt-4 max-w-[42ch] text-[13.5px] leading-relaxed text-muted-foreground">{sentence}</p>
            <dl className="mt-auto divide-y divide-border/70 pt-4">
              {[
                { label: "Posts in 30 days", value: fmtShort(ownMonth.mentions) },
                { label: "Read for mood", value: ownMonth.rated ? `${fmtShort(ownMonth.rated)} of ${fmtShort(ownMonth.mentions)}` : "Not read yet" },
                { label: "Creators", value: creators ? String(creators) : "—" },
                { label: "Views, where reported", value: ownMonth.reach ? fmtShort(ownMonth.reach) : "—" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="font-medium tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
            {ownMonth.rated > 0 && (
              <div className="mt-4">
                <div
                  className="flex h-2.5 overflow-hidden rounded-full bg-secondary"
                  role="img"
                  aria-label={`Mood: ${positive}% positive, ${neutral}% neutral, ${negative}% negative`}
                >
                  <span className="h-full bg-status-good" style={{ width: `${positive}%` }} />
                  <span className="h-full bg-muted-foreground/30" style={{ width: `${neutral}%` }} />
                  <span className="h-full bg-status-bad" style={{ width: `${negative}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span>{positive}% positive</span>
                  <span>{neutral}% neutral</span>
                  <span>{negative}% negative</span>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {findings.length > 0 && <PatternCard findings={findings} label="Worth knowing" className="lg:col-span-4" />}

        <Panel
          className={findings.length ? "lg:col-span-4" : "lg:col-span-6"}
          title="Coverage"
          subtitle="How current the listening is"
          action={<Button variant="ghost" size="sm" className="-mr-2 h-8 px-2 text-[12.5px] text-muted-foreground" onClick={onAddKeywords}>Keywords</Button>}
        >
          <ToneList items={coverage} />
          {sweep.active > 0 && (
            <div className="mt-4 border-t border-border/70 pt-3.5">
              <p className="text-[12px] text-muted-foreground">Watching</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {topics.filter((t) => t.active).slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <StatusChip tone={t.kind === "brand" ? "info" : "neutral"} className="max-w-full">
                      <span className="block max-w-[13rem] truncate">{t.label}</span>
                    </StatusChip>
                  </li>
                ))}
                {sweep.active > 6 && (
                  <li className="self-center text-[12px] text-muted-foreground">+{sweep.active - 6} more</li>
                )}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {!hasBrand && (
        <p className="px-1 text-[13px] text-muted-foreground">Add a keyword marked “Your brand” to see your own mood and mentions here.</p>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-8"
          title="Mood over time"
          subtitle="Rated posts about your brand per day, last 30 days"
          action={
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-[20px] font-light leading-none tracking-[-0.02em] tabular-nums">{fmtShort(ownWeek.mentions)}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">posts this week</div>
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
            {(["positive", "neutral", "negative"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: MOOD_COLOR[k] }} aria-hidden />
                {k[0].toUpperCase() + k.slice(1)}
              </span>
            ))}
          </div>
          {ratedDays ? (
            <div className="h-[240px]">
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
                  <Bar dataKey="positive" name="Positive" stackId="m" fill={MOOD_COLOR.positive} maxBarSize={24} isAnimationActive={false} />
                  <Bar dataKey="neutral" name="Neutral" stackId="m" fill={MOOD_COLOR.neutral} maxBarSize={24} isAnimationActive={false} />
                  <Bar dataKey="negative" name="Negative" stackId="m" fill={MOOD_COLOR.negative} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-[13px] text-muted-foreground">No posts have been read for mood yet. New posts are read within the hour.</p>
          )}
          {unread > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">{count(unread, "post")} not read yet.</p>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="Share of voice" subtitle="On-topic mentions, last 30 days">
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
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                    <span>{count(v.mentions, "post")} · {v.reach ? `${fmtShort(v.reach)} views` : "no views reported"}</span>
                    <span>{v.net == null ? "Not read yet" : `Net ${v.net > 0 ? "+" : ""}${v.net}`}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Add your brand and a competitor to compare.</p>
          )}
          {voiceCallout && <p className="mt-4 rounded-xl border border-border/70 bg-background/70 p-3.5 text-[13px] leading-relaxed">{voiceCallout}</p>}
          {hasBrand && !topics.some((t) => t.kind === "competitor") && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">Add a competitor keyword to compare against.</p>
          )}
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-4" title="Where it's happening" subtitle="Posts about your brand, last 30 days">
          {platforms.length ? (
            <ul className="-my-1 divide-y divide-border/70">
              {platforms.map((p) => (
                <li key={p.key} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="font-medium">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">{p.mentions} · {p.share}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-secondary/70" aria-hidden>
                    <div className="bar-hatch h-full rounded-full" style={{ width: `${Math.max(p.share, p.mentions ? 2 : 0)}%` }} />
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted-foreground">
                    {p.viewsKnown ? `${fmtShort(p.reach)} views` : "No views reported"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No posts about your brand yet.</p>
          )}
          {platforms.some((p) => p.key === "reddit") && (
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">Reddit doesn't report views, so those posts count in mentions only.</p>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="What people talk about" subtitle="Themes in posts about your brand, 30 days">
          {themeRows.length ? (
            <ul className="-my-1 divide-y divide-border/70">
              {themeRows.map((t) => (
                <li key={t.theme} className="py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="min-w-0 truncate capitalize">{t.theme}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {t.negative > t.positive ? (
                        <StatusChip tone="bad">Mostly negative</StatusChip>
                      ) : t.positive > t.negative ? (
                        <StatusChip tone="good">Mostly positive</StatusChip>
                      ) : (
                        <StatusChip tone="neutral">Mixed</StatusChip>
                      )}
                      <span className="tabular-nums text-muted-foreground">{t.mentions}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/70" aria-hidden>
                    <div className="bar-hatch h-full rounded-full" style={{ width: `${Math.max(3, (t.mentions / (themedTotal || 1)) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Themes appear once posts about your brand have been read.</p>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="Needs attention" subtitle="Negative posts about your brand this week">
          {attention.length ? (
            <ul className="-my-1 divide-y divide-border/70">
              {attention.map((m) => (
                <li key={m.id} className="py-2.5">
                  <a href={m.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[13.5px] group-hover:underline">{m.title || m.snippet || m.url}</span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {SOURCE_LABEL[m.source] ?? m.source}{m.author ? ` · ${m.author}` : ""}
                        {m.theme ? ` · ${m.theme}` : ""}{m.reach ? ` · ${fmtShort(m.reach)} views` : ""}
                      </span>
                    </span>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="flex items-start gap-3 py-2">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-good/10 text-status-good">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium">Nothing needs attention</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    No negative posts about {brandName} in the last seven days.{" "}
                    {ownMonth.rated
                      ? ownMonth.negative === 0
                        ? `None of the ${ownMonth.rated} posts read this month were negative.`
                        : `${ownMonth.negative} of ${ownMonth.rated} posts read this month were negative.`
                      : "No posts have been read for mood this month."}
                  </p>
                </div>
              </div>
              <dl className="mt-4 border-t border-border/70 pt-1">
                <div className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <dt className="text-muted-foreground">Last negative post</dt>
                  <dd className="font-medium tabular-nums">
                    {latestNegative ? `${lastNegativeDays} day${lastNegativeDays === 1 ? "" : "s"} ago` : "None this month"}
                  </dd>
                </div>
              </dl>
              {latestNegative && (
                <a
                  href={latestNegative.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group -mx-2 flex items-start justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised"
                >
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-[13px] group-hover:underline">{latestNegative.title || latestNegative.snippet || latestNegative.url}</span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {SOURCE_LABEL[latestNegative.source] ?? latestNegative.source}
                      {latestNegative.reach ? ` · ${fmtShort(latestNegative.reach)} views` : ""}
                    </span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Most seen this month"
        subtitle="Across the keywords you track, most views first"
        action={<Link to={hrefFor("mentions")} className="whitespace-nowrap text-[12.5px] text-muted-foreground hover:text-foreground">All mentions</Link>}
      >
        {top.length ? (
          <ul className="-my-1 divide-y divide-border/70">
            {top.map((m, i) => (
              <li key={m.id} className="py-3">
                <a href={m.url} target="_blank" rel="noreferrer" className="group grid gap-3 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-center">
                  <span className="hidden text-[13px] tabular-nums text-muted-foreground sm:block">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-[14px] group-hover:underline">{m.title || m.snippet || m.url}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {SOURCE_LABEL[m.source] ?? m.source}{m.author ? ` · ${m.author}` : ""} · {topicLabel.get(m.topic_id) ?? "Removed keyword"} · {shortDate(mentionDate(m))}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 sm:justify-end">
                    {m.sentiment && <StatusChip tone={MOOD_TONE[m.sentiment]}>{m.sentiment[0].toUpperCase() + m.sentiment.slice(1)}</StatusChip>}
                    <span className="min-w-[64px] text-right text-[13px] tabular-nums">
                      {m.reach ? fmtShort(m.reach) : "—"}
                      {m.reach ? <span className="ml-1 text-[11.5px] text-muted-foreground">views</span> : null}
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No posts yet. New keywords are searched within the hour.</p>
        )}
      </Panel>
    </div>
  );
}
