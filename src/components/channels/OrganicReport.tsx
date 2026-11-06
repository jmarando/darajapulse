import { DeltaChip, StatusChip } from "@/components/dash/chips";
import { Panel } from "@/components/dash/Panel";
import { PostingCadence } from "@/components/report/PostingCadence";
import { TopPosts } from "@/components/report/TopPosts";
import { compact, platformLabel } from "@/lib/reportInsights";
import type { AudienceRow } from "../../../supabase/functions/_shared/brand-pull";
import type { OrganicReport as Report, Tile } from "../../../supabase/functions/_shared/organic-report";

/** A number no source gave is a dash, never 0. */
const number = (v: number | null) => (v === null ? "—" : compact(v));
const percent = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const signed = (v: number, show: (n: number) => string) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${show(Math.abs(v))}`;

const FORMAT_LABEL: Record<string, string> = { video: "Video", photo: "Photo", carousel: "Carousel", text: "Text", other: "Other" };
const CADENCE_NOTE = "Views by the day and hour each post was published, in Nairobi time. Darker means more views.";

function TileBox({ label, tile, show, compare, unit }: { label: string; tile: Tile; show: (v: number | null) => string; compare: boolean; unit?: (v: number) => string }) {
  return (
    <div data-tile className="flex flex-col items-start bg-card px-4 py-4 last:col-span-2 lg:last:col-span-1">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="mt-2 text-[28px] font-light leading-none tracking-[-0.02em] tabular-nums">{show(tile.value)}</span>
      {compare && tile.change !== null && <DeltaChip delta={tile.change} className="mt-2">{signed(tile.change, unit ?? compact)}</DeltaChip>}
    </div>
  );
}

function AudienceList({ title, rows }: { title: string; rows: AudienceRow[] }) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium">{title}</h3>
      <ul className="space-y-1.5">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span>{r.key}</span>
            <span className="tabular-nums text-muted-foreground">{total ? `${Math.round((r.value / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The organic report, the same in the app, the brand portal and on a share link. All its numbers come from one module. */
export default function OrganicReport({ report, compare }: { report: Report; compare: boolean }) {
  const { tiles, platforms, picks, formats, cadence, connected, sourcesLine, notes } = report;
  const audience = connected.audience;
  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden p-0 sm:p-0">
        <div className="grid grid-cols-2 gap-px bg-border/70 sm:grid-cols-3 lg:grid-cols-5">
          <TileBox label="Followers" tile={tiles.followers} show={number} compare={compare} />
          <TileBox label="Posts" tile={tiles.posts} show={number} compare={compare} />
          <TileBox label="Views" tile={tiles.views} show={number} compare={compare} />
          <TileBox label="Interactions" tile={tiles.interactions} show={number} compare={compare} />
          <TileBox label="Engagement rate" tile={tiles.rate} show={percent} compare={compare} unit={(v) => `${v.toFixed(1)}%`} />
        </div>
      </Panel>

      {platforms.length > 0 && (
        <Panel title="By account">
          <ul className="divide-y divide-border/70">
            {platforms.map((p) => (
              <li key={p.channel_id} data-account title={p.tag === "Connected" ? "From Meta" : "Public numbers"} className="grid gap-x-4 gap-y-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.7fr))] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{p.name}</span>
                    <StatusChip tone={p.tag === "Connected" ? "good" : "neutral"}>{p.tag}</StatusChip>
                  </div>
                  <div className="truncate text-[12.5px] text-muted-foreground">@{p.handle} · {platformLabel(p.platform)}</div>
                </div>
                <dl className="contents">
                  {[
                    { label: "Followers", value: number(p.followers), extra: compare && p.change !== null ? signed(p.change, compact) : null },
                    { label: "Posts", value: String(p.posts), extra: null },
                    { label: "Views", value: number(p.views), extra: null },
                    { label: "Engagement", value: percent(p.rate), extra: null },
                  ].map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
                      <dd className="text-[14px] font-medium tabular-nums">
                        {f.value}
                        {f.extra && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{f.extra}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <TopPosts picks={picks} brandPosts />

      {formats.length > 0 && (
        <Panel title="What worked" subtitle="Average views per post, by format">
          <ul className="space-y-2">
            {formats.map((f) => (
              <li key={f.format} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span>{FORMAT_LABEL[f.format] ?? f.format} <span className="text-muted-foreground">· {f.posts} {f.posts === 1 ? "post" : "posts"}</span></span>
                <span className="font-medium tabular-nums">{number(f.avgViews === null ? null : Math.round(f.avgViews))}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <PostingCadence cadence={cadence} subtitle={CADENCE_NOTE} />

      {connected.any ? (
        <Panel title="From Meta" subtitle="Official numbers, for connected accounts only">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {[
              { label: "Average reach per post", value: number(connected.avgReach === null ? null : Math.round(connected.avgReach)) },
              { label: "Organic views", value: number(connected.organicViews) },
              { label: "Paid views", value: number(connected.paidViews) },
            ].map((f) => (
              <div key={f.label}>
                <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 text-[20px] font-light tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
          {audience && (
            <div className="mt-5 grid gap-5 border-t border-border/70 pt-5 sm:grid-cols-3">
              <AudienceList title="Country" rows={audience.country} />
              <AudienceList title="Age" rows={audience.age} />
              <AudienceList title="Gender" rows={audience.gender} />
            </div>
          )}
        </Panel>
      ) : (
        <p className="text-[13px] text-muted-foreground">Connect Facebook and Instagram to see reach, paid vs organic and audience.</p>
      )}

      {(sourcesLine || notes.length > 0) && (
        <div className="space-y-1 text-[12.5px] text-muted-foreground">
          {sourcesLine && <p>{sourcesLine}</p>}
          {notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}
    </div>
  );
}
