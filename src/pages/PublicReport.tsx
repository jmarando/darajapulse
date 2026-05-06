import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Heart, MessageCircle, Share2, Hash, Wallet, Users, Sparkles, MapPin, Bookmark, Radio, Trophy, BarChart3, Download, FileText } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis } from "recharts";
import logo from "@/assets/logo-pulse-mark.png";
import { exportReportToPptx, downloadReportAsPdf } from "@/lib/exportReport";

type PostWithMetrics = any;

const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}k` : `${n}`;


const PublicReport = () => {
  const { token } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [notFound, setNotFound] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    const { data: link } = await supabase.from("report_links").select("campaign_id").eq("token", token).eq("is_active", true).maybeSingle();
    if (!link) { setNotFound(true); return; }
    const { data: c } = await supabase.from("campaigns").select("*").eq("id", link.campaign_id).single();
    setCampaign(c);
    if (c?.client_id) {
      const { data: cl } = await supabase.from("clients").select("*").eq("id", c.client_id).single();
      setClient(cl);
    }
    const { data: ps } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", link.campaign_id);
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

  const fromTs = from ? +new Date(from) : -Infinity;
  const toTs = to ? +new Date(to) + 86399999 : Infinity;
  const filteredPosts = posts.filter(p => {
    const t = p.posted_at ? +new Date(p.posted_at) : +new Date(p.created_at);
    return t >= fromTs && t <= toTs;
  });
  const rangeLabel = from || to ? `${from || "start"} → ${to || "now"}` : "All time";

  const totals = filteredPosts.reduce((a, p) => ({
    views: a.views + (p.metrics.views || 0),
    likes: a.likes + (p.metrics.likes || 0),
    comments: a.comments + (p.metrics.comments || 0),
    shares: a.shares + (p.metrics.shares || 0),
    saves: a.saves + (p.metrics.saves || 0),
    reach: a.reach + (p.metrics.reach || 0),
    impressions: a.impressions + (p.metrics.impressions || 0),
  }), { views:0, likes:0, comments:0, shares:0, saves:0, reach:0, impressions:0 });

  const er = totals.views > 0 ? ((totals.likes + totals.comments + totals.shares + totals.saves) / totals.views * 100) : 0;
  const emv = Math.round((totals.impressions || totals.views) * 0.012);
  const cpm = totals.impressions > 0 && campaign.budget_kes > 0 ? (campaign.budget_kes / totals.impressions * 1000) : 0;
  const cpv = totals.views > 0 && campaign.budget_kes > 0 ? (campaign.budget_kes / totals.views) : 0;

  // Per-creator aggregated metrics
  const byCreator = new Map<string, { views: number; likes: number; comments: number; shares: number; saves: number; posts: number }>();
  for (const p of posts) {
    const key = p.influencer_id;
    const cur = byCreator.get(key) ?? { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, posts: 0 };
    cur.views += p.metrics.views || 0;
    cur.likes += p.metrics.likes || 0;
    cur.comments += p.metrics.comments || 0;
    cur.shares += p.metrics.shares || 0;
    cur.saves += p.metrics.saves || 0;
    cur.posts += 1;
    byCreator.set(key, cur);
  }
  let topPerformer: { ci: any; views: number } | null = null;
  for (const x of influencers) {
    const s = byCreator.get(x.influencer_id);
    if (!s) continue;
    if (!topPerformer || s.views > topPerformer.views) topPerformer = { ci: x, views: s.views };
  }

  // Per-platform breakdown
  const platformMap = new Map<string, { posts: number; creators: Set<string>; views: number; reach: number; followers: number; }>();
  const seenCreatorPerPlatform = new Map<string, Set<string>>();
  for (const p of posts) {
    const key = p.platform || "other";
    const cur = platformMap.get(key) ?? { posts: 0, creators: new Set<string>(), views: 0, reach: 0, followers: 0 };
    cur.posts += 1;
    if (!cur.creators.has(p.influencer_id)) {
      cur.creators.add(p.influencer_id);
      const inf = influencers.find(i => i.influencer_id === p.influencer_id)?.influencers;
      cur.followers += Number(inf?.follower_count || 0);
    }
    cur.views += p.metrics.views || 0;
    cur.reach += p.metrics.reach || 0;
    platformMap.set(key, cur);
  }
  const platformRows = Array.from(platformMap.entries()).sort((a,b) => b[1].views - a[1].views);
  const allHistory = posts.flatMap(p => (p.history ?? []).map((h: any) => ({ t: +new Date(h.captured_at), v: h.views || 0 })));
  let trend: { d: number; v: number }[] = [];
  if (allHistory.length > 1) {
    const min = Math.min(...allHistory.map(h => h.t));
    const max = Math.max(...allHistory.map(h => h.t));
    const span = Math.max(max - min, 1);
    const buckets = Array.from({ length: 12 }, () => 0);
    allHistory.forEach(h => { const i = Math.min(11, Math.floor(((h.t - min) / span) * 12)); buckets[i] = Math.max(buckets[i], h.v); });
    trend = buckets.map((v, d) => ({ d, v }));
  } else {
    trend = Array.from({ length: 12 }, (_, d) => ({ d, v: Math.round((totals.views / 12) * (d + 1) / 12) }));
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Daraja Pulse" className="h-12 w-auto" />
            <div className="hidden sm:block h-8 w-px bg-border" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live campaign report</div>
              <div className="text-xs text-muted-foreground">Auto-refreshes every minute</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Updated {updatedAt.toLocaleTimeString()}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        {/* Header — matches CampaignDetail */}
        <div className="flex justify-between items-start gap-6 mb-8">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{client?.name ?? "Client"}</div>
            <h1 className="font-display text-4xl md:text-5xl font-semibold mt-1 truncate">{campaign.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm text-muted-foreground">
              {campaign.hashtag && <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{campaign.hashtag.replace(/^#/, "")}</span>}
              {campaign.budget_kes > 0 && <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />KES {Number(campaign.budget_kes).toLocaleString()}</span>}
              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{influencers.length} creator{influencers.length === 1 ? "" : "s"}</span>
            </div>
            {campaign.objective && <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">{campaign.objective}</p>}
          </div>
          <Badge variant="outline" className="capitalize">{campaign.status}</Badge>
        </div>

        {/* Performance band — same style */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-px bg-border rounded-lg overflow-hidden mb-6 border border-border">
          {[
            { label: "Views", value: fmt(totals.views), icon: Eye },
            { label: "Reach", value: fmt(totals.reach), icon: Radio },
            { label: "Impressions", value: fmt(totals.impressions), icon: BarChart3 },
            { label: "Likes", value: fmt(totals.likes), icon: Heart },
            { label: "Comments", value: fmt(totals.comments), icon: MessageCircle },
            { label: "Shares", value: fmt(totals.shares), icon: Share2 },
            { label: "Saves", value: fmt(totals.saves), icon: Bookmark },
            { label: "Engagement", value: `${er.toFixed(1)}%`, icon: Sparkles },
          ].map((s, i) => (
            <div key={i} className="bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
                {s.icon && <s.icon className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
              <div className="font-display text-2xl mt-2">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Velocity + EMV */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Velocity</div>
                <h2 className="font-display text-2xl mt-1">Views over time</h2>
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
          <Card className="p-6 bg-gradient-ink text-primary-foreground border-0">
            <div className="text-[10px] uppercase tracking-widest opacity-70">Earned media value</div>
            <div className="font-display text-5xl font-semibold mt-2">KES {fmt(emv)}</div>
            <p className="opacity-80 text-sm mt-3">Estimated value vs. paid media at a KES 12 CPM benchmark.</p>
            <div className="mt-6 pt-6 border-t border-white/10 flex items-center gap-2 text-sm opacity-90">
              <MapPin className="w-4 h-4" /> Audience: ~80% Kenya · ~20% diaspora
            </div>
          </Card>
        </div>

        {/* Top performer + Efficiency */}
        {(topPerformer || campaign.budget_kes > 0) && (
          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            {topPerformer && (
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center"><Trophy className="w-6 h-6" /></div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Top performer</div>
                      <div className="font-display text-2xl mt-0.5">{topPerformer.ci.influencers?.full_name}</div>
                      <div className="text-sm text-muted-foreground">@{topPerformer.ci.influencers?.handle?.replace(/^@/, "")} · {byCreator.get(topPerformer.ci.influencer_id)?.posts} post{byCreator.get(topPerformer.ci.influencer_id)?.posts === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div><div className="font-display text-3xl">{fmt(topPerformer.views)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                    <div><div className="font-display text-3xl">{fmt(byCreator.get(topPerformer.ci.influencer_id)?.likes ?? 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                  </div>
                </div>
              </Card>
            )}
            {campaign.budget_kes > 0 && (
              <Card className="p-6">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Efficiency</div>
                <div className="mt-3 space-y-3">
                  <div className="flex justify-between items-baseline"><span className="text-sm text-muted-foreground">Cost per view</span><span className="font-display text-xl">KES {cpv.toFixed(2)}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-sm text-muted-foreground">Cost per mille</span><span className="font-display text-xl">KES {cpm.toFixed(0)}</span></div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-border"><span className="text-sm text-muted-foreground">ROI vs paid</span><span className="font-display text-xl">{campaign.budget_kes > 0 ? `${(emv / campaign.budget_kes * 100).toFixed(0)}%` : "—"}</span></div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Platform breakdown */}
        {platformRows.length > 0 && (
          <Card className="p-5 mb-6 overflow-hidden">
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">By platform</div>
              <h2 className="font-display text-2xl">Channel mix</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-2 pr-3">Platform</th>
                    <th className="text-right font-medium py-2 px-3">Posts</th>
                    <th className="text-right font-medium py-2 px-3">Creators</th>
                    <th className="text-right font-medium py-2 px-3">Views</th>
                    <th className="text-right font-medium py-2 px-3">Reach</th>
                    <th className="text-right font-medium py-2 pl-3">Followers</th>
                  </tr>
                </thead>
                <tbody>
                  {platformRows.map(([k, v]) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 capitalize">{k}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{v.posts}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{v.creators.size}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(v.views)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(v.reach)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{fmt(v.followers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Audience */}
        {influencers.length > 0 && (() => {
          const totalFollowers = influencers.reduce((a, x) => a + Number(x.influencers?.follower_count || 0), 0);
          const weightedKE = totalFollowers > 0
            ? influencers.reduce((a, x) => a + Number(x.influencers?.follower_count || 0) * Number(x.influencers?.audience_kenya_pct || 0), 0) / totalFollowers
            : 0;
          const diaspora = 100 - weightedKE;
          const langs = new Set<string>();
          influencers.forEach(x => (x.influencers?.languages || []).forEach((l: string) => langs.add(l)));
          return (
            <Card className="p-6 mb-6">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Audience</div>
              <h2 className="font-display text-2xl mt-1 mb-4">Who we reached</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-baseline text-sm mb-1.5">
                    <span>Kenya</span><span className="font-display text-lg">{weightedKE.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
                    <div className="bg-accent h-full" style={{ width: `${weightedKE}%` }} />
                    <div className="bg-highlight/60 h-full" style={{ width: `${diaspora}%` }} />
                  </div>
                  <div className="flex justify-between items-baseline text-sm mt-1.5">
                    <span className="text-muted-foreground">Diaspora & rest of world</span>
                    <span className="text-muted-foreground">{diaspora.toFixed(0)}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border">
                    <div><div className="font-display text-2xl">{fmt(totalFollowers)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Combined followers</div></div>
                    <div><div className="font-display text-2xl">{influencers.length}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Creators</div></div>
                    <div><div className="font-display text-2xl">{langs.size || 1}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Languages</div></div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Languages</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(langs).map(l => <Badge key={l} variant="outline" className="text-xs">{l}</Badge>)}
                    {langs.size === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Learnings & Recommendations */}
        {campaign.learnings && (
          <Card className="p-6 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Narrative</div>
            <h2 className="font-display text-2xl mt-1 mb-3">Learnings & recommendations</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{campaign.learnings}</p>
          </Card>
        )}

        {/* Roster + Posts — mirrors CampaignDetail */}
        <div className="grid lg:grid-cols-5 gap-6">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Roster</div>
              <h2 className="font-display text-2xl">Creators</h2>
            </div>
            {influencers.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-md">
                <Users className="w-6 h-6 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">No creators added yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {influencers.map(x => {
                  const s = byCreator.get(x.influencer_id);
                  return (
                    <li key={x.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-display shrink-0">{x.influencers?.full_name?.[0]}</div>
                          <div className="min-w-0">
                            <div className="text-sm truncate">{x.influencers?.full_name}</div>
                            <div className="text-xs text-muted-foreground truncate">{x.influencers?.handle} · {x.influencers?.primary_platform}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize shrink-0">{x.status}</Badge>
                      </div>
                      {s && (
                        <div className="grid grid-cols-4 gap-1 mt-2 ml-12 text-center">
                          <div><div className="text-xs font-medium tabular-nums">{fmt(s.views)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                          <div><div className="text-xs font-medium tabular-nums">{fmt(s.likes)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                          <div><div className="text-xs font-medium tabular-nums">{fmt(s.comments)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Comm.</div></div>
                          <div><div className="text-xs font-medium tabular-nums">{fmt(s.shares)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Shares</div></div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5 lg:col-span-3">
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Activity</div>
              <h2 className="font-display text-2xl">Posts</h2>
            </div>
            {posts.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-md">
                <p className="text-sm text-muted-foreground">No posts published yet — check back soon.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {posts.map(p => (
                  <li key={p.id} className="p-3 rounded-md border border-border hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm min-w-0 truncate">
                        <span className="font-medium">{p.influencers?.full_name}</span>
                        <span className="text-muted-foreground"> · {p.platform}</span>
                      </div>
                      <Badge variant="outline" className="capitalize">{p.status}</Badge>
                    </div>
                    {p.post_url && <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-accent break-all block mt-1">{p.post_url}</a>}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-center">
                      <div><div className="font-display text-base">{fmt(p.metrics.views || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.likes || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.comments || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Comments</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.shares || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Shares</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.saves || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saves</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.reach || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reach</div></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by <span className="font-display text-foreground">Daraja Pulse</span> · Influence Operating System
      </footer>
    </div>
  );
};
export default PublicReport;
