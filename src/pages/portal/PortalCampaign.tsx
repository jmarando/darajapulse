import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PostThumb } from "@/components/PostThumb";
import { buildPeakMetricsByPost, fetchAllPostMetrics } from "@/lib/metrics";

const PortalCampaign = () => {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from("campaigns").select("*, clients(name, logo_url)").eq("id", id).maybeSingle();
      setCampaign(c);
      const { data: p } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", id);
      setPosts(p ?? []);
      const ids = (p ?? []).map((x: any) => x.id);
      if (ids.length) {
        const m = await fetchAllPostMetrics(supabase, ids);
        setMetrics(Object.fromEntries(buildPeakMetricsByPost(m ?? [])));
      }
    })();
  }, [id]);

  if (!campaign) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const totals = posts.reduce((acc, p) => {
    const m = metrics[p.id];
    if (m) { acc.views += m.views || 0; acc.likes += m.likes || 0; acc.comments += m.comments || 0; acc.shares += m.shares || 0; }
    return acc;
  }, { views: 0, likes: 0, comments: 0, shares: 0 });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{campaign.clients?.name}</div>
      <h1 className="font-display text-4xl font-semibold mt-1">{campaign.name}</h1>
      <p className="text-muted-foreground mt-2">{campaign.brief}</p>

      <div className="grid grid-cols-4 gap-3 mt-6">
        {[["Views", totals.views], ["Likes", totals.likes], ["Comments", totals.comments], ["Shares", totals.shares]].map(([l, v]) => (
          <Card key={l as string} className="p-4 text-center">
            <div className="font-display text-2xl">{Number(v).toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
          </Card>
        ))}
      </div>

      <h2 className="font-display text-2xl mt-8 mb-3">Posts</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map(p => (
          <Card key={p.id} className="p-3">
            <div className="text-xs text-muted-foreground mb-2">{p.influencers?.full_name} · {p.platform}</div>
            <PostThumb url={p.post_url} platform={p.platform} thumbnailUrl={p.thumbnail_url} caption={p.caption} handle={p.influencers?.handle || p.influencers?.full_name} />
            {metrics[p.id] && (
              <div className="grid grid-cols-4 gap-1 text-center mt-2 text-xs">
                <div>{(metrics[p.id].views || 0).toLocaleString()}<div className="text-[9px] text-muted-foreground">views</div></div>
                <div>{(metrics[p.id].likes || 0).toLocaleString()}<div className="text-[9px] text-muted-foreground">likes</div></div>
                <div>{(metrics[p.id].comments || 0).toLocaleString()}<div className="text-[9px] text-muted-foreground">cmts</div></div>
                <div>{(metrics[p.id].shares || 0).toLocaleString()}<div className="text-[9px] text-muted-foreground">shares</div></div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
export default PortalCampaign;
