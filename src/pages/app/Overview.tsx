import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, Users, Building2, Wallet, TrendingUp, Eye, Heart, MessageCircle,
  Share2, FileText, Trophy, ArrowUpRight, Sparkles, Activity, Rows3, LayoutGrid,
  Plus, Send, FileSignature, Zap,
} from "lucide-react";
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildPeakMetricsByPost } from "@/lib/metrics";
import OnboardingChecklist from "@/components/OnboardingChecklist";

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;

const Stat = ({ icon: Icon, label, value, sub, delta, to }: any) => {
  const inner = (
    <Card className="p-5 h-full rounded-2xl border-border/60 bg-card hover:shadow-elegant hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200 ease-out group cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-accent" />
        </div>
      </div>
      <div className="font-display text-3xl font-semibold mt-3 tabular-nums flex items-end gap-2">
        {value}
        {to && <ArrowUpRight className="w-4 h-4 mb-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />}
      </div>
      {delta && (
        <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium">
          <TrendingUp className="w-3 h-3" /> {delta}
        </div>
      )}
      {sub && !delta && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const Overview = () => {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState<string>("");
  const [s, setS] = useState({ clients: 0, campaigns: 0, influencers: 0, payouts: 0, live: 0, posts: 0, briefs: 0, contests: 0 });
  const [totals, setTotals] = useState({ views: 0, likes: 0, comments: 0, shares: 0, reach: 0 });
  const [metrics, setMetrics] = useState<any[]>([]);
  const [topCampaign, setTopCampaign] = useState<any>(null);
  const [topCreator, setTopCreator] = useState<any>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState<string>(twoWeeksAgo);
  const [to, setTo] = useState<string>(today);
  const [compact, setCompact] = useState<boolean>(() => localStorage.getItem("overview_compact") === "1");
  useEffect(() => { localStorage.setItem("overview_compact", compact ? "1" : "0"); }, [compact]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      const name = (data?.full_name || user.email || "").split(" ")[0].split("@")[0];
      setFirstName(name);
    });
  }, [user]);

  useEffect(() => {
    (async () => {
      const [c, ca, i, lv, pm, posts, briefs, contests, recent, topC] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }),
        supabase.from("influencers").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("post_metrics").select("captured_at, views, reach, likes, comments, shares, post_id").order("captured_at", { ascending: true }),
        supabase.from("posts").select("id", { count: "exact", head: true }),
        supabase.from("content_items").select("id", { count: "exact", head: true }),
        supabase.from("contests").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id, name, status, hashtag, budget_kes, clients(name)").order("created_at", { ascending: false }).limit(5),
        supabase.from("posts").select("id, caption, campaign_id, influencer_id, campaigns(name), influencers(handle, full_name), post_metrics(views, likes)").limit(50),
      ]);

      setS({
        clients: c.count ?? 0,
        campaigns: ca.count ?? 0,
        influencers: i.count ?? 0,
        payouts: 0,
        live: lv.count ?? 0,
        posts: posts.count ?? 0,
        briefs: briefs.count ?? 0, // content items count
        contests: contests.count ?? 0,
      });
      setMetrics(pm.data ?? []);
      setRecentCampaigns(recent.data ?? []);

      // Peak metric per post → totals + top performer. This avoids a bad zero poll wiping views out.
      const latest = buildPeakMetricsByPost(pm.data ?? []);
      const t = { views: 0, likes: 0, comments: 0, shares: 0, reach: 0 };
      Array.from(latest.values()).forEach((m: any) => {
        t.views += m.views || 0; t.likes += m.likes || 0; t.comments += m.comments || 0;
        t.shares += m.shares || 0; t.reach += m.reach || 0;
      });
      setTotals(t);

      // Top performer post
      const postsWithViews = (topC.data ?? []).map((p: any) => {
        const latestMetric = (p.post_metrics ?? []).reduce((acc: any, m: any) => (m.views > (acc?.views || 0) ? m : acc), null);
        return { ...p, views: latestMetric?.views || 0, likes: latestMetric?.likes || 0 };
      }).sort((a: any, b: any) => b.views - a.views);
      if (postsWithViews[0]?.views > 0) setTopCreator(postsWithViews[0]);

      // Top campaign by total views
      const camp: Record<string, { id: string; name: string; views: number }> = {};
      postsWithViews.forEach((p: any) => {
        if (!p.campaign_id) return;
        camp[p.campaign_id] = camp[p.campaign_id] || { id: p.campaign_id, name: p.campaigns?.name || "—", views: 0 };
        camp[p.campaign_id].views += p.views;
      });
      const topCmp = Object.values(camp).sort((a, b) => b.views - a.views)[0];
      if (topCmp) setTopCampaign(topCmp);
    })();
  }, []);

  const series = useMemo(() => {
    const fromTs = +new Date(from);
    const toTs = +new Date(to) + 86399999;
    const days = Math.max(1, Math.round((toTs - fromTs) / 86400000));
    const buckets: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(fromTs + i * 86400000).toISOString().slice(5, 10);
      buckets[d] = 0;
    }
    metrics.forEach((m: any) => {
      const ts = +new Date(m.captured_at);
      if (ts < fromTs || ts > toTs) return;
      const d = new Date(ts).toISOString().slice(5, 10);
      const eng = (m.likes || 0) + (m.comments || 0) + (m.shares || 0);
      if (d in buckets) buckets[d] = Math.max(buckets[d], eng);
    });
    return Object.entries(buckets).map(([d, v]) => ({ d, v }));
  }, [metrics, from, to]);

  const totalEng = series.reduce((a, x) => a + x.v, 0);
  const er = totals.views > 0 ? ((totals.likes + totals.comments + totals.shares) / totals.views) * 100 : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Agency console</div>
          <h1 className="font-display text-4xl font-semibold mt-1">
            {greeting()}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="text-muted-foreground mt-1">Here's where your campaigns stand today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCompact(!compact)} title="Toggle compact mode">
            {compact ? <LayoutGrid className="w-4 h-4 mr-1" /> : <Rows3 className="w-4 h-4 mr-1" />}
            {compact ? "Comfortable" : "Compact"}
          </Button>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-xs w-[150px]" aria-label="From" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-xs w-[150px]" aria-label="To" />
          <Button variant="ghost" size="sm" onClick={() => { setFrom(twoWeeksAgo); setTo(today); }}>Reset</Button>
        </div>
      </header>

      <OnboardingChecklist />


      {compact ? (
        <Card className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                [["Clients", s.clients, "/app/clients"], ["Views", fmt(totals.views)]],
                [["Campaigns", `${s.campaigns} (${s.live} live)`, "/app/campaigns"], ["Reach", fmt(totals.reach)]],
                [["Influencers", s.influencers, "/app/influencers"], ["Likes", fmt(totals.likes)]],
                [["Content items", s.briefs, "/app/content"], ["Comments", fmt(totals.comments)]],
                [["Posts tracked", s.posts, "/app/content"], ["Engagement", `${er.toFixed(2)}%`]],
                [["Contests", s.contests], ["", ""]],
              ].map((row: any, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    {row[0][2] ? <Link to={row[0][2]} className="hover:underline">{row[0][0]}</Link> : row[0][0]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row[0][1]}</TableCell>
                  <TableCell className="font-medium text-muted-foreground">{row[1][0]}</TableCell>
                  <TableCell className="text-right tabular-nums">{row[1][1]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <>
      {/* Primary KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat icon={Building2} label="Clients" value={s.clients} to="/app/clients" />
        <Stat icon={Megaphone} label="Campaigns" value={s.campaigns} delta={`${s.live} live now`} to="/app/campaigns" />
        <Stat icon={Users} label="Influencers" value={s.influencers} to="/app/influencers" />
        <Stat icon={Wallet} label="Paid (KES)" value={s.payouts.toLocaleString()} to="/app/payouts" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Stat icon={FileText} label="Content items" value={s.briefs} to="/app/content" />
        <Stat icon={Activity} label="Posts tracked" value={s.posts} to="/app/content" />
        <Stat icon={Trophy} label="Contests" value={s.contests} />
      </div>

      {/* Performance + Quick Actions */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4 mb-6">
        <Card className="p-6 rounded-2xl border-border/60">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Performance to date</div>
              <h2 className="font-display text-2xl mt-1">Across all live campaigns</h2>
            </div>
            <Badge variant="secondary" className="text-sm">{er.toFixed(2)}% engagement</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { i: Eye, l: "Views", v: fmt(totals.views) },
              { i: TrendingUp, l: "Reach", v: fmt(totals.reach) },
              { i: Heart, l: "Likes", v: fmt(totals.likes) },
              { i: MessageCircle, l: "Comments", v: fmt(totals.comments) },
              { i: Share2, l: "Shares", v: fmt(totals.shares) },
            ].map(({ i: I, l, v }) => (
              <div key={l} className="p-4 rounded-xl bg-secondary/60">
                <I className="w-4 h-4 text-muted-foreground mb-2" />
                <div className="font-display text-2xl tabular-nums">{v}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl border-border/60 flex flex-col">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Quick actions</div>
          <Link to="/app/campaigns"><Button className="w-full justify-start bg-primary text-primary-foreground hover:bg-primary/90 mb-2 h-10 rounded-lg"><Plus className="w-4 h-4 mr-2" /> New campaign</Button></Link>
          <Link to="/app/briefs"><Button variant="outline" className="w-full justify-start mb-2 h-10 rounded-lg"><FileSignature className="w-4 h-4 mr-2" /> Send brief</Button></Link>
          <Link to="/app/influencers"><Button variant="outline" className="w-full justify-start mb-4 h-10 rounded-lg"><Send className="w-4 h-4 mr-2" /> Invite creator</Button></Link>
          <div className="mt-auto pt-4 border-t border-border/60">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Live now</div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> {s.live} active</span>
              <span className="text-muted-foreground tabular-nums">{s.posts} posts</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Velocity chart */}
      <Card className="p-6 mb-6 rounded-2xl border-border/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement velocity</div>
            <h2 className="font-display text-2xl mt-1">{from} → {to}</h2>
          </div>
          <div className="flex items-center gap-2 text-success text-sm"><TrendingUp className="w-4 h-4" /> {totalEng.toLocaleString()} interactions</div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--secondary) / 0.5)" }} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                {series.map((entry, i) => {
                  const max = Math.max(...series.map(s => s.v));
                  const isPeak = entry.v === max && entry.v > 0;
                  return <Cell key={i} fill={isPeak ? "hsl(var(--primary))" : "hsl(var(--accent) / 0.35)"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
        </>
      )}

      {/* Bottom row: top performer + recent campaigns */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Highlights</div>
          {topCampaign ? (
            <Link to={`/app/campaigns/${topCampaign.id}`} className="block p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group mb-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Top campaign</div>
              <div className="flex items-center justify-between mt-1">
                <div className="font-display text-xl">{topCampaign.name}</div>
                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-sm text-accent mt-1">{fmt(topCampaign.views)} views</div>
            </Link>
          ) : (
            <div className="p-4 rounded-lg bg-secondary/30 text-sm text-muted-foreground mb-3">No campaign data yet.</div>
          )}
          {topCreator ? (
            <Link to={`/app/campaigns/${topCreator.campaign_id}`} className="block p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Top performing post</div>
              <div className="flex items-center justify-between mt-1">
                <div className="font-display text-xl">{topCreator.influencers?.full_name || topCreator.influencers?.handle || "—"}</div>
                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {fmt(topCreator.views)} views · {fmt(topCreator.likes)} likes
              </div>
            </Link>
          ) : (
            <div className="p-4 rounded-lg bg-secondary/30 text-sm text-muted-foreground">No post metrics yet.</div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Recent campaigns</div>
            <Link to="/app/campaigns" className="text-xs text-accent hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {recentCampaigns.length === 0 && <div className="text-sm text-muted-foreground">No campaigns yet.</div>}
            {recentCampaigns.map((c: any) => (
              <Link key={c.id} to={`/app/campaigns/${c.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/60 transition-colors group">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.clients?.name || "—"}</div>
                  <div className="font-display text-base truncate">{c.name}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">{c.status}</Badge>
                  <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Overview;
