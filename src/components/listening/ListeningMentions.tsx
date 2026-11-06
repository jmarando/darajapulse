import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/dash/Panel";
import { StatusChip, type Tone } from "@/components/dash/chips";
import { OFF_TOPIC, SOURCE_LABEL, mentionDate, type ListeningMention, type ListeningTopic, type Mood } from "@/lib/listening";
import { fmtShort } from "@/lib/reporting";

const ALL = "all";
const MOOD_TONE: Record<Mood, Tone> = { positive: "good", neutral: "neutral", negative: "bad" };
const PAGE = 50;

export default function ListeningMentions({ topics, mentions }: { topics: ListeningTopic[]; mentions: ListeningMention[] }) {
  const [topic, setTopic] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [mood, setMood] = useState(ALL);
  const [sort, setSort] = useState<"recent" | "views">("recent");
  const [q, setQ] = useState("");
  const [showOffTopic, setShowOffTopic] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const topicLabel = useMemo(() => new Map(topics.map((t) => [t.id, t.label])), [topics]);
  const sources = useMemo(() => [...new Set(mentions.map((m) => m.source))].sort(), [mentions]);
  const offTopic = useMemo(() => mentions.filter((m) => m.theme === OFF_TOPIC).length, [mentions]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = mentions.filter((m) =>
      (showOffTopic || m.theme !== OFF_TOPIC) &&
      (topic === ALL || m.topic_id === topic) &&
      (source === ALL || m.source === source) &&
      (mood === ALL || (mood === "unrated" ? !m.sentiment : m.sentiment === mood)) &&
      (!needle || `${m.title ?? ""} ${m.snippet ?? ""} ${m.author ?? ""}`.toLowerCase().includes(needle)));
    return list.sort((a, b) =>
      sort === "views"
        ? Number(b.reach || 0) - Number(a.reach || 0)
        : Date.parse(mentionDate(b)) - Date.parse(mentionDate(a)));
  }, [mentions, topic, source, mood, sort, q, showOffTopic]);

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search posts" className="h-9 w-full sm:w-56" aria-label="Search posts" />
        <Select value={topic} onValueChange={(v) => { setTopic(v); setShown(PAGE); }}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Keyword"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All keywords</SelectItem>
            {topics.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => { setSource(v); setShown(PAGE); }}>
          <SelectTrigger className="h-9 w-[140px]" aria-label="Platform"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All platforms</SelectItem>
            {sources.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s] ?? s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mood} onValueChange={(v) => { setMood(v); setShown(PAGE); }}>
          <SelectTrigger className="h-9 w-[140px]" aria-label="Mood"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any mood</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="unrated">Not read yet</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as "recent" | "views")}>
          <SelectTrigger className="h-9 w-[140px]" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest first</SelectItem>
            <SelectItem value="views">Most viewed</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">{rows.length} post{rows.length === 1 ? "" : "s"}</span>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-border/70">
          {rows.slice(0, shown).map((m) => (
            <li key={m.id} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{SOURCE_LABEL[m.source] ?? m.source}</span>
                    {m.author ? ` · ${m.author}` : ""} · {topicLabel.get(m.topic_id) ?? "Removed keyword"} ·{" "}
                    {new Date(mentionDate(m)).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <a href={m.url} target="_blank" rel="noreferrer" className="mt-1 line-clamp-2 text-[14px] hover:underline">
                    {m.title || m.snippet || m.url}
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {m.sentiment ? (
                      <StatusChip tone={MOOD_TONE[m.sentiment]}>{m.sentiment[0].toUpperCase() + m.sentiment.slice(1)}</StatusChip>
                    ) : (
                      <StatusChip tone="info">Not read yet</StatusChip>
                    )}
                    {m.theme && <span className="rounded-full bg-secondary px-2 py-0.5 text-[12px] capitalize text-muted-foreground">{m.theme}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  {m.reach ? <span className="text-[13px] tabular-nums">{fmtShort(m.reach)}<span className="ml-1 text-[11.5px] text-muted-foreground">views</span></span> : null}
                  <a href={m.url} target="_blank" rel="noreferrer" aria-label="Open post" className="text-muted-foreground hover:text-foreground">
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-[13.5px] text-muted-foreground">
          {mentions.length ? "No posts match these filters." : "No posts in this period."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {rows.length > shown && <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>}
        {offTopic > 0 && (
          <button type="button" className="text-[12.5px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowOffTopic((v) => !v)}>
            {showOffTopic ? "Hide" : "Show"} {offTopic} off-topic post{offTopic === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </Panel>
  );
}
