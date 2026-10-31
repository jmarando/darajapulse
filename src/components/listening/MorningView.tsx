import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/dash/Panel";
import { DeltaChip, StatusChip, type Tone } from "@/components/dash/chips";
import { SOURCE_LABEL, mentionDate } from "@/lib/listening";
import { fmtShort } from "@/lib/reporting";
import { MORNING_HOURS, views, type MorningView, type VerdictLevel } from "../../../supabase/functions/_shared/listening-brief";

const VERDICT: Record<VerdictLevel, { tone: Tone; label: string }> = {
  clear: { tone: "good", label: "All clear" },
  watch: { tone: "warn", label: "Watch" },
  act: { tone: "bad", label: "Act" },
  unsure: { tone: "neutral", label: "Not sure" },
};

// A count and its unit stay on one line when a phone wraps the row.
const NBSP = " ";

/** "5 hours ago", for a post from the last day. */
const ago = (iso: string, now: number) => {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}${NBSP}min${NBSP}ago`;
  const hours = Math.round(mins / 60);
  return `${hours}${NBSP}hour${hours === 1 ? "" : "s"}${NBSP}ago`;
};

/** "Instagram", "Instagram and Reddit", "TikTok, Instagram and Reddit". */
const platforms = (sources: string[]) => {
  const names = sources.map((s) => SOURCE_LABEL[s] ?? s);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
};

const between = (now: number | null, before: number | null) => (now !== null && before !== null ? now - before : null);

function Tile({ label, value, suffix, delta, unit = "" }: {
  label: string;
  /** null when there is nothing to work it out from, shown as a dash rather than 0. */
  value: string | null;
  suffix?: string;
  delta: number | null;
  unit?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[22px] font-light leading-none tracking-[-0.02em] tabular-nums">
        {value ?? "—"}
        {value !== null && suffix && <span className="ml-1 text-[12px] tracking-normal text-muted-foreground">{suffix}</span>}
      </dd>
      {delta !== null && (
        <DeltaChip delta={delta} className="mt-2">{delta > 0 ? `+${delta}` : delta}{unit}</DeltaChip>
      )}
    </div>
  );
}

/** Listening's first answer: is anything wrong today, how are we doing, and what needs a reply. */
export default function MorningViewCard({ view, brandName, now }: { view: MorningView; brandName: string; now: number }) {
  const { tone, label } = VERDICT[view.verdict.level];
  const hasPosts = view.posts.now + view.posts.before > 0;

  return (
    <Panel title="Morning view" subtitle={`${brandName} · last ${MORNING_HOURS} hours, against the ${MORNING_HOURS} before`}>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <StatusChip tone={tone}>{label}</StatusChip>
        <p className="min-w-0 text-[15px] leading-snug">{view.verdict.headline}</p>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border/70 pt-5 sm:gap-6">
        <Tile
          label="Mood"
          value={view.mood.now === null ? null : `${view.mood.now}%`}
          suffix="positive"
          delta={between(view.mood.now, view.mood.before)}
          unit=" pts"
        />
        <Tile
          label="Share vs rivals"
          value={view.share.now === null ? null : `${view.share.now}%`}
          delta={between(view.share.now, view.share.before)}
          unit=" pts"
        />
        <Tile label="Posts about you" value={fmtShort(view.posts.now)} delta={hasPosts ? view.posts.now - view.posts.before : null} />
      </dl>

      {view.needsYou.length > 0 && (
        <div className="mt-6 border-t border-border/70 pt-5">
          <h3 className="text-[13.5px] font-medium">Needs you today</h3>
          <ul className="-mb-3 mt-1 divide-y divide-border/70">
            {view.needsYou.map(({ mention: m, views: seen, move }) => (
              <li key={m.id} className="py-3">
                <a href={m.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[13.5px] group-hover:underline">{m.title || m.url}</span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {views(seen)}{NBSP}views · {SOURCE_LABEL[m.source] ?? m.source} · {ago(mentionDate(m), now)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusChip tone="warn">{move}</StatusChip>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.category.length > 0 && (
        <div className="mt-6 border-t border-border/70 pt-5">
          <h3 className="text-[13.5px] font-medium">Around the category</h3>
          <ul className="-mb-2.5 mt-1 divide-y divide-border/70">
            {view.category.map((row, i) => (
              <li key={`${row.label}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{row.posts} {row.posts === 1 ? "post" : "posts"}</span>
                  <StatusChip tone={row.net === null || row.net === 0 ? "neutral" : row.net > 0 ? "good" : "bad"}>
                    {row.net === null ? "Not read yet" : `Net ${row.net > 0 ? "+" : ""}${row.net}`}
                  </StatusChip>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-1 border-t border-border/70 pt-4 text-[12px] leading-relaxed text-muted-foreground">
        {view.noViews.length > 0 && <p>{platforms(view.noViews)} posts report no views, so they can't raise an alarm.</p>}
        <p>Numbers come from the public posts found by your keywords in the last {MORNING_HOURS} hours. The AI reads each post's mood.</p>
      </div>
    </Panel>
  );
}
