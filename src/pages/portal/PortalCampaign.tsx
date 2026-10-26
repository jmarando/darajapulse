import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PostThumb } from "@/components/PostThumb";
import { buildPeakMetricsByPost, fetchAllPostMetrics, type MetricSnapshot } from "@/lib/metrics";
import { FreshnessChips, ReportCard, ReportOverview } from "@/components/report/ReportOverview";
import { compact, platformLabel, type ReportPost } from "@/lib/reportInsights";

const PortalCampaign = () => {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [history, setHistory] = useState<MetricSnapshot[]>([]);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from("campaigns").select("*, clients(name, logo_url)").eq("id", id).maybeSingle();
      setCampaign(c);
      const { data: p } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", id);
      setPosts(p ?? []);
      const ids = (p ?? []).map((x) => x.id);
      if (ids.length) setHistory(await fetchAllPostMetrics(supabase, ids));
      setLoadedAt(Date.now());
    })();
  }, [id]);

  const metrics = useMemo(() => Object.fromEntries(buildPeakMetricsByPost(history)), [history]);
  // Every reading per post, so the overview can say how current each platform is.
  const reportPosts = useMemo<ReportPost[]>(() => {
    const byPost = new Map<string, MetricSnapshot[]>();
    for (const m of history) {
      const list = byPost.get(m.post_id!);
      if (list) list.push(m); else byPost.set(m.post_id!, [m]);
    }
    return posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      influencer_id: p.influencer_id,
      creator: p.influencers?.full_name ?? null,
      post_url: p.post_url,
      posted_at: p.posted_at,
      created_at: p.created_at,
      history: byPost.get(p.id) ?? [],
    }));
  }, [posts, history]);

  if (!campaign) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const totals = posts.reduce((acc, p) => {
    const m = metrics[p.id];
    if (m) { acc.likes += m.likes || 0; acc.comments += m.comments || 0; acc.shares += m.shares || 0; }
    return acc;
  }, { likes: 0, comments: 0, shares: 0 });
  const sharesEstimated = posts.some((p) => metrics[p.id]?.estimated_fields?.shares);
  const creatorCount = new Set(posts.map((p) => p.influencer_id).filter(Boolean)).size;
  const byViews = [...posts].sort((a, b) => (metrics[b.id]?.views || 0) - (metrics[a.id]?.views || 0));

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="text-sm text-muted-foreground">{campaign.clients?.name}</div>
      <h1 className="font-display text-4xl font-semibold mt-1">{campaign.name}</h1>
      {campaign.brief && <p className="mt-2 max-w-[70ch] text-muted-foreground">{campaign.brief}</p>}

      <FreshnessChips posts={reportPosts} now={loadedAt} className="mb-4 mt-6" />
      <ReportOverview
        posts={reportPosts}
        totals={totals}
        estimated={{ shares: sharesEstimated }}
        creators={creatorCount}
        view="client"
        now={loadedAt}
      />

      <ReportCard title="Posts" subtitle={`${posts.length} post${posts.length === 1 ? "" : "s"}, most viewed first`}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {byViews.map((p) => {
            const m = metrics[p.id];
            return (
              <article key={p.id} className="overflow-hidden rounded-xl border border-border/70 bg-background/40">
                <PostThumb postId={p.id} url={p.post_url} platform={p.platform} thumbnailUrl={p.thumbnail_url} caption={p.caption} handle={p.influencers?.handle || p.influencers?.full_name} />
                <div className="p-3">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium">{p.influencers?.full_name || "Creator"}</span>
                    <span className="shrink-0 text-muted-foreground">{platformLabel(p.platform)}</span>
                  </div>
                  {m ? (
                    <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
                      {([["Views", m.views], ["Likes", m.likes], ["Comments", m.comments], ["Shares", m.shares]] as const).map(([label, value]) => (
                        <div key={label}>
                          <dd className="text-[13px] font-medium tabular-nums">{compact(Number(value || 0))}</dd>
                          <dt className="text-[11px] text-muted-foreground">{label}</dt>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-2 text-[12px] text-muted-foreground">No figures yet</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </ReportCard>
    </div>
  );
};
export default PortalCampaign;
