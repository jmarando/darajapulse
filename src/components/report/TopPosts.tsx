import { Eye, Flame, Sparkles, type LucideIcon } from "lucide-react";
import { PostThumb } from "@/components/PostThumb";
import { ReportCard } from "@/components/report/ReportOverview";
import { compact, platformLabel } from "@/lib/reportInsights";
import type { TopPick, TopPickKind } from "@/lib/topPosts";
import { cn } from "@/lib/utils";

const KINDS: Record<TopPickKind, { label: string; icon: LucideIcon; unit: string; value: (p: TopPick) => string }> = {
  views: { label: "Most viewed", icon: Eye, unit: "views", value: (p) => compact(Number(p.metrics.views || 0)) },
  engagement: { label: "Highest engagement", icon: Sparkles, unit: "engagement rate", value: (p) => `${p.rate.toFixed(1)}%` },
  intent: { label: "Strongest intent", icon: Flame, unit: "saves and shares", value: (p) => compact(p.intent) },
};

function Est({ className }: { className?: string }) {
  return (
    <span className={cn("rounded border border-border px-1 py-px text-[10.5px]", className)} title="Partly estimated from views and likes, because the platform doesn't report it">est.</span>
  );
}

/** The posts that stood out, each a link to the post with its picture and figures. */
export function TopPosts({ picks, className }: { picks: TopPick[]; className?: string }) {
  if (picks.length === 0) return null;
  return (
    <ReportCard className={className} title="Top posts" subtitle="The most viewed, the most engaging and the strongest on saves and shares">
      <div className="grid gap-4 md:grid-cols-3">
        {picks.map((p) => {
          const { label, icon: Icon, unit, value } = KINDS[p.kind];
          const m = p.metrics;
          const estimated = (key: string) => !!m.estimated_fields?.[key];
          const interactionsEstimated = estimated("shares") || estimated("saves");
          const handle = String(p.post.influencers?.handle ?? "").replace(/^@/, "");
          const meta = [handle && `@${handle}`, platformLabel(p.post.platform)].filter(Boolean).join(" · ");
          const figures: { label: string; value: string; estimated: boolean }[] = [
            { label: "Views", value: compact(Number(m.views || 0)), estimated: false },
            { label: "Likes", value: compact(Number(m.likes || 0)), estimated: false },
            { label: "Comments", value: compact(Number(m.comments || 0)), estimated: false },
            { label: "Shares", value: compact(Number(m.shares || 0)), estimated: estimated("shares") },
            { label: "Saves", value: compact(Number(m.saves || 0)), estimated: estimated("saves") },
            { label: "Engagement", value: `${p.rate.toFixed(1)}%`, estimated: interactionsEstimated },
          ];
          return (
            <a
              key={p.kind}
              href={p.post.post_url || "#"}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:border-foreground/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex aspect-[4/5] items-center justify-center overflow-hidden bg-secondary">
                <PostThumb
                  postId={p.post.id}
                  url={p.post.post_url ?? ""}
                  platform={p.post.platform}
                  thumbnailUrl={p.post.thumbnail_url}
                  caption={p.post.caption}
                  handle={p.post.influencers?.handle}
                  asLink={false}
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </div>
                <div className="mt-2 truncate text-[14px] font-medium">{p.post.influencers?.full_name ?? "—"}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">{meta}</div>
                <div className="mt-4 text-[28px] font-light leading-none tracking-[-0.02em] tabular-nums">{value(p)}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {unit}
                  {p.kind !== "views" && interactionsEstimated && <Est className="ml-1.5" />}
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/70 pt-4 xl:grid-cols-3 xl:gap-x-3">
                  {figures.map((f) => (
                    <div key={f.label}>
                      <dt className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted-foreground">
                        {f.label}
                        {f.estimated && <Est />}
                      </dt>
                      <dd className="mt-0.5 text-[14px] font-medium tabular-nums">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </a>
          );
        })}
      </div>
    </ReportCard>
  );
}
