import { useEffect, useState } from "react";
import { ArrowUpRight, Eye, Heart } from "lucide-react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { fmtCadence, fmtCompact, type ChannelInsights as Insights, type InsightPost, type Listing } from "@/lib/storefront";

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

/** The number a post is ranked and charted by: its views, or its likes, comments and shares where views aren't given. */
const postNumber = (p: InsightPost, byViews: boolean) => (byViews ? p.views : p.interactions) ?? 0;

/**
 * What an account's latest public posts say a buyer can expect: a typical post's views, how often it posts, its
 * engagement, a bar for each of the latest posts and its best three. Loaded when the listing is opened.
 */
export default function ChannelInsights({ item, accent }: { item: Listing; accent: string }) {
  const [state, setState] = useState<{ loading: boolean; data: Insights | null }>({ loading: true, data: null });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, data: null });
    supabase.rpc("get_public_listing_insights", { _item_id: item.id }).then(({ data }) => {
      if (alive) setState({ loading: false, data: (data as unknown as Insights | null) ?? null });
    });
    return () => { alive = false; };
  }, [item.id]);

  if (state.loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
        <div className="h-20 animate-pulse rounded-xl bg-secondary" />
        <div className="h-28 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }
  const data = state.data;
  if (!data?.summary) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Numbers from this account's latest posts aren't in yet.</p>;
  }
  const s = data.summary;
  if (!s.posts) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No public posts came back for this account in the last 90 days.</p>;
  }

  const byViews = data.recent.filter((p) => p.views !== null).length >= 3;
  const bars = data.recent;
  const max = Math.max(1, ...bars.map((p) => postNumber(p, byViews)));
  const typical = byViews ? s.median_views : s.median_interactions;
  const medianLine = typical ? Math.min(100, (typical / max) * 100) : null;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border">
        <div className="p-3">
          <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{byViews ? "Typical views" : "Typical interactions"}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{typical ? fmtCompact(typical) : "—"}</dd>
        </div>
        <div className="p-3">
          <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Posts</dt>
          <dd className="mt-1 text-lg font-semibold">{fmtCadence(s.posts_per_week)}</dd>
        </div>
        <div className="p-3">
          <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{s.engagement_rate ? `${s.engagement_rate.toFixed(1)}%` : "—"}</dd>
        </div>
      </dl>

      {bars.length >= 3 && (
        <figure>
          <div className="relative flex h-28 items-end gap-1 border-b border-border" role="img"
            aria-label={`${byViews ? "Views" : "Likes, comments and shares"} on the latest ${bars.length} posts, from ${fmtCompact(Math.min(...bars.map((p) => postNumber(p, byViews))))} to ${fmtCompact(max)}`}>
            {medianLine !== null && (
              <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40" style={{ bottom: `${medianLine}%` }} />
            )}
            {bars.map((p, n) => {
              const value = postNumber(p, byViews);
              const height = Math.max(3, (value / max) * 100);
              const label = `${day(p.posted_at)}: ${fmtCompact(value)} ${byViews ? "views" : "likes, comments and shares"}`;
              const bar = <span className="block w-full rounded-t-sm transition-opacity hover:opacity-80" style={{ height: `${height}%`, background: accent }} />;
              return p.url ? (
                <a key={`${p.posted_at}-${n}`} href={p.url} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className="flex h-full flex-1 items-end">{bar}</a>
              ) : (
                <span key={`${p.posted_at}-${n}`} title={label} className="flex h-full flex-1 items-end">{bar}</span>
              );
            })}
          </div>
          <figcaption className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="shrink-0 whitespace-nowrap">{day(bars[0]?.posted_at)}</span>
            <span className="text-center">{byViews ? "Views" : "Likes, comments and shares"} on the latest {bars.length} posts{medianLine !== null ? " · dashes mark a typical post" : ""}</span>
            <span className="shrink-0 whitespace-nowrap">{day(bars[bars.length - 1]?.posted_at)}</span>
          </figcaption>
        </figure>
      )}

      {data.top.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Best recent posts</h4>
          <ol className="mt-2 grid grid-cols-3 gap-2">
            {data.top.map((p, n) => (
              <li key={`${p.url ?? n}`}>
                <a href={p.url ?? undefined} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-lg border border-border bg-secondary">
                  <div className="relative aspect-[4/5]">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex h-full items-center justify-center p-2 text-center text-[11px] leading-snug text-muted-foreground">{p.caption?.slice(0, 80) ?? "Post"}</div>
                    )}
                    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                      {byViews ? <Eye className="h-3 w-3" aria-hidden /> : <Heart className="h-3 w-3" aria-hidden />}
                      {fmtCompact(postNumber(p, byViews))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
                    <span>{day(p.posted_at)}</span>
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        From the latest {s.posts} public post{s.posts === 1 ? "" : "s"} (nothing older than 90 days), read {day(data.read_at)}.
        {s.engagement_rate ? ` Engagement is likes, comments and shares as a share of ${s.engagement_basis === "views" ? "views" : "followers"}.` : ""}
      </p>
    </div>
  );
}
