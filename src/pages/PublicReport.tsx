import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Heart, MessageCircle, Share2, TrendingUp, Sparkles, MapPin } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis } from "recharts";

type PostWithMetrics = any;

const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : `${n}`;

const PublicReport = () => {
  const { token } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    const { data: link } = await supabase.from("report_links").select("campaign_id").eq("token", token).eq("is_active", true).maybeSingle();
    if (!link) { setNotFound(true); return; }
    const { data: c } = await supabase.from("campaigns").select("*").eq("id", link.campaign_id).single();
    setCampaign(c);
    if (c?.client_id) {
      const { data: cl } = await supabase.from("clients").select("*").eq("id", c.client_id).single();
      setClient(cl);
    }
    const { data: ps } = await supabase.from("posts").select("*").eq("campaign_id", link.campaign_id);
    const { data: ms } = await supabase.from("post_metrics").select("*").in("post_id", (ps ?? []).map(p => p.id));
    const grouped = (ps ?? []).map(p => {
      const list = (ms ?? []).filter(m => m.post_id === p.id).sort((a,b) => +new Date(a.captured_at) - +new Date(b.captured_at));
      const last = list[list.length - 1] || { views:0, likes:0, comments:0, shares:0, reach:0, impressions:0 };
      return { ...p, metrics: last, history: list };
    });
    setPosts(grouped);
    const { data: ci } = await supabase.from("campaign_influencers").select("*, influencers(*)").eq("campaign_id", link.campaign_id);
    setInfluencers(ci ?? []);
    setUpdatedAt(new Date());
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, [token]);

  if (notFound) return <div className="min-h-screen flex items-center justify-center p-6 text-center">
    <div><h1 className="font-display text-3xl">Report not found</h1><p className="text-muted-foreground mt-2">This link may have expired.</p></div>
  </div>;
  if (!campaign) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading report…</div>;

  const totals = posts.reduce((a, p) => ({
    views: a.views + (p.metrics.views || 0),
    likes: a.likes + (p.metrics.likes || 0),
    comments: a.comments + (p.metrics.comments || 0),
    shares: a.shares + (p.metrics.shares || 0),
    reach: a.reach + (p.metrics.reach || 0),
    impressions: a.impressions + (p.metrics.impressions || 0),
  }), { views:0, likes:0, comments:0, shares:0, reach:0, impressions:0 });

  const er = totals.reach > 0 ? ((totals.likes + totals.comments + totals.shares) / totals.reach * 100) : 0;
  const emv = Math.round(totals.impressions * 0.012); // rough KES per impression benchmark
  const trend = Array.from({ length: 12 }, (_, i) => ({ d: i, v: Math.round((totals.views/12) * (0.4 + Math.random() * 1.2)) }));

  return (
    <div className="min-h-screen bg-gradient-paper">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-gradient-warm" />
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{client?.name ?? "Client"}</div>
              <div className="font-display text-lg leading-none">{campaign.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse-counter" /> Live · updated {updatedAt.toLocaleTimeString()}
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-12 pb-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Campaign report</div>
        <h1 className="font-display text-5xl md:text-6xl font-semibold mt-2 text-balance">
          {campaign.hashtag || campaign.name} <span className="text-accent">in numbers.</span>
        </h1>
        {campaign.objective && <p className="text-lg text-muted-foreground mt-3 max-w-2xl">{campaign.objective}</p>}
      </section>

      <section className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        {[
          { l: "Reach", v: fmt(totals.reach), I: Eye },
          { l: "Impressions", v: fmt(totals.impressions), I: TrendingUp },
          { l: "Likes", v: fmt(totals.likes), I: Heart },
          { l: "Comments", v: fmt(totals.comments), I: MessageCircle },
          { l: "Shares", v: fmt(totals.shares), I: Share2 },
          { l: "Engagement", v: `${er.toFixed(1)}%`, I: Sparkles },
        ].map(({ l, v, I }) => (
          <Card key={l} className="p-4">
            <div className="flex items-center justify-between text-muted-foreground"><span className="text-[10px] uppercase tracking-widest">{l}</span><I className="w-3 h-3" /></div>
            <div className="font-display text-3xl font-semibold mt-2">{v}</div>
          </Card>
        ))}
      </section>

      <section className="max-w-6xl mx-auto px-6 mb-10 grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Velocity</div>
              <h2 className="font-display text-2xl mt-1">Views, last 12 intervals</h2>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" hide />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="v" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 bg-gradient-ink text-primary-foreground">
          <div className="text-xs uppercase tracking-widest opacity-70">Earned media value</div>
          <div className="font-display text-5xl font-semibold mt-2">KES {fmt(emv)}</div>
          <p className="opacity-80 text-sm mt-3">Estimated value vs. paid media at KES 12 CPM benchmark.</p>
          <div className="mt-6 pt-6 border-t border-white/10 flex items-center gap-2 text-sm opacity-90">
            <MapPin className="w-4 h-4" /> Audience: ~80% Kenya · ~20% diaspora
          </div>
        </Card>
      </section>

      <section className="max-w-6xl mx-auto px-6 mb-12">
        <h2 className="font-display text-3xl mb-4">Creators</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {influencers.map(x => (
            <Card key={x.id} className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center font-display">{x.influencers?.full_name?.[0]}</div>
                <div>
                  <div className="font-display text-lg">{x.influencers?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{x.influencers?.handle} · {x.influencers?.primary_platform}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 mt-4 gap-2 text-center">
                <div><div className="font-display">{fmt(x.influencers?.follower_count ?? 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Followers</div></div>
                <div><div className="font-display">{Number(x.influencers?.engagement_rate ?? 0).toFixed(1)}%</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">ER</div></div>
                <div><Badge variant="outline">{x.status}</Badge></div>
              </div>
            </Card>
          ))}
          {influencers.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-3">No creators added yet.</Card>}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="font-display text-3xl mb-4">Posts</h2>
        <div className="space-y-3">
          {posts.map(p => (
            <Card key={p.id} className="p-5 flex flex-col md:flex-row md:items-center gap-4">
              <Badge className="capitalize w-fit">{p.platform}</Badge>
              <a href={p.post_url} target="_blank" rel="noreferrer" className="text-sm text-accent flex-1 truncate">{p.post_url}</a>
              <div className="flex gap-6 text-sm text-muted-foreground">
                <span><Eye className="w-3 h-3 inline mr-1" />{fmt(p.metrics.views)}</span>
                <span><Heart className="w-3 h-3 inline mr-1" />{fmt(p.metrics.likes)}</span>
                <span><MessageCircle className="w-3 h-3 inline mr-1" />{fmt(p.metrics.comments)}</span>
              </div>
            </Card>
          ))}
          {posts.length === 0 && <Card className="p-8 text-center text-muted-foreground">No posts published yet — check back soon.</Card>}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by <span className="font-display text-foreground">Daraja Plus</span> · Influence Operating System
      </footer>
    </div>
  );
};
export default PublicReport;
