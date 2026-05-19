import { useEffect, useMemo, useState } from "react";
import PublicFooter from "@/components/PublicFooter";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Heart, MessageCircle, Share2, Hash, Wallet, Users, Sparkles, MapPin, Bookmark, Radio, Trophy, BarChart3, Download, FileText, Instagram, Music2, Crown, Flame, Clock, Gauge, PieChart as PieIcon, Coins } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import logo from "@/assets/logo-pulse-mark.png";
import { exportReportToPptx, downloadReportAsPdf } from "@/lib/exportReport";
import { PostEmbed } from "@/components/PostEmbed";
import { PostThumb } from "@/components/PostThumb";
import { computeEmv, EMV_CPM_KES, EMV_DISCLAIMER } from "@/lib/emv";
import { fetchAllPostMetrics, peakMetricSnapshot, buildWindowMetricsByPost, withMetricFallbacks } from "@/lib/metrics";
import { canonicalPostUrl, cleanHandle as cleanH } from "@/lib/postUrl";

type PostWithMetrics = any;

const fmt = (n: number) => {
  if (!isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
};
const fmtKes = (n: number) => n >= 1e6 ? `KES ${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `KES ${(n/1e3).toFixed(0)}K` : `KES ${Math.round(n).toLocaleString()}`;

const normalizedText = (value?: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const contestantKey = (e: any) => {
  const handle = [e.instagram_handle, e.tiktok_handle, e.facebook_handle, e.handle].map(cleanH).find(Boolean);
  if (handle) return `handle:${handle}`;
  const email = normalizedText(e.submitter_email);
  if (email) return `email:${email}`;
  const phone = String(e.phone || "").replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  const name = normalizedText(e.full_name || e.submitter_name);
  if (name) return `name:${name}`;
  return `entry:${e.external_registration_id || e.id}`;
};


const PublicReport = () => {
  const { token } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [contests, setContests] = useState<any[]>([]);
  const [contestEntries, setContestEntries] = useState<any[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [notFound, setNotFound] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [metric, setMetric] = useState<"views"|"reach"|"impressions"|"likes"|"comments"|"shares"|"saves"|"engagement">("views");

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
    const postIds = (ps ?? []).map(p => p.id);
    const ms = postIds.length ? await fetchAllPostMetrics(supabase, postIds) : [];
    const grouped = (ps ?? []).map(p => {
      const list = ms.filter(m => m.post_id === p.id).sort((a,b) => +new Date(a.captured_at) - +new Date(b.captured_at));
      const peak = peakMetricSnapshot(list);
      return { ...p, metrics: peak, history: list };
    });
    setPosts(grouped);
    const { data: ci } = await supabase.from("campaign_influencers").select("*, influencers(*)").eq("campaign_id", link.campaign_id);
    setInfluencers(ci ?? []);
    const { data: cts } = await supabase.from("contests").select("*").eq("campaign_id", link.campaign_id).order("created_at", { ascending: false });
    setContests(cts ?? []);
    const contestIds = (cts ?? []).map((c: any) => c.id);
    if (contestIds.length) {
      const { data: ces } = await supabase.from("contest_entries").select("*").in("contest_id", contestIds).order("score", { ascending: false });
      setContestEntries(ces ?? []);
    } else {
      setContestEntries([]);
    }
    setUpdatedAt(new Date());
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, [token]);

  const fromTs = from ? +new Date(from) : -Infinity;
  const toTs = to ? +new Date(to) + 86399999 : Infinity;
  const hasRange = !!(from || to);

  // When a window is active, recompute per-post metrics as the delta
  // captured within [from, to]; otherwise use lifetime peak.
  const windowMetricsByPost = useMemo(() => {
    if (!hasRange) return null;
    const all = posts.flatMap((p: any) => (p.history || []).map((h: any) => ({ ...h, post_id: p.id })));
    return buildWindowMetricsByPost(all, fromTs, toTs);
  }, [posts, hasRange, fromTs, toTs]);

  if (notFound) return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <img src={logo} alt="Daraja Pulse" className="h-16 w-auto mx-auto mb-6" />
          <h1 className="font-display text-3xl">Report not found</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            This link may have expired or been revoked. If you were expecting to see a campaign report,
            please contact the agency that shared it with you for a refreshed link.
          </p>
          <Button asChild variant="outline" className="mt-6"><a href="/">Back to home</a></Button>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
  if (!campaign) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading report…</div>;

  const filteredPosts = posts
    .filter(p => {
      // Keep posts that either were posted in-range OR have any metric value by the selected end date.
      const t = p.posted_at ? +new Date(p.posted_at) : +new Date(p.created_at);
      const postedIn = t >= fromTs && t <= toTs;
      const m = windowMetricsByPost?.get(p.id);
      const hasActivity = m ? [m.views, m.likes, m.comments, m.shares, m.saves, m.reach, m.impressions].some((v) => Number(v || 0) > 0) : true;
      return !hasRange || postedIn || hasActivity;
    })
    .map(p => hasRange && windowMetricsByPost?.has(p.id)
      ? { ...p, metrics: windowMetricsByPost.get(p.id) }
      : p);
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
  const emv = computeEmv(totals.views, totals.impressions);
  const cpm = totals.impressions > 0 && campaign.budget_kes > 0 ? (campaign.budget_kes / totals.impressions * 1000) : 0;
  const cpv = totals.views > 0 && campaign.budget_kes > 0 ? (campaign.budget_kes / totals.views) : 0;

  // Per-creator aggregated metrics
  const byCreator = new Map<string, { views: number; likes: number; comments: number; shares: number; saves: number; posts: number }>();
  for (const p of filteredPosts) {
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
  for (const p of filteredPosts) {
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
  const valOf = (h: any) => {
    const normalized = withMetricFallbacks(h);
    if (metric === "engagement") return (normalized.likes||0)+(normalized.comments||0)+(normalized.shares||0)+(normalized.saves||0);
    return Number(normalized[metric] || 0);
  };
  // Real daily time-series. In a selected range, show range-to-date delta instead of lifetime totals.
  const allHistory = posts.flatMap(p => (p.history ?? []).map((h: any) => ({ ...h, post_id: p.id, t: +new Date(h.captured_at) })));
  let trend: { d: string; v: number }[] = [];
  if (allHistory.length > 0) {
    const minT = Number.isFinite(fromTs) ? fromTs : Math.min(...allHistory.map((h: any) => h.t));
    const maxT = Number.isFinite(toTs) ? toTs : Math.max(...allHistory.map((h: any) => h.t));
    const start = new Date(minT); start.setHours(0, 0, 0, 0);
    const end = new Date(maxT); end.setHours(23, 59, 59, 999);
    const days = Math.max(1, Math.ceil((+end - +start) / 86400000));
    for (let i = 0; i <= days; i++) {
      const dayEnd = +start + i * 86400000 + 86399999;
      const byPost = buildWindowMetricsByPost(allHistory, hasRange ? fromTs : -Infinity, dayEnd);
      let v = 0;
      for (const m of byPost.values()) v += valOf(m);
      const d = new Date(dayEnd).toISOString().slice(0, 10);
      trend.push({ d: d.slice(5), v });
    }
  }
  const metricLabel: Record<string,string> = { views: "Views", reach: "Reach", impressions: "Impressions", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", engagement: "Engagement" };

  const exportCsv = () => {
    const esc = (s: any) => { const v = String(s ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const rows: string[][] = [];
    rows.push(["Campaign", campaign.name]);
    rows.push(["Client", client?.name ?? ""]);
    rows.push(["Range", rangeLabel]);
    rows.push([]);
    rows.push(["Totals"]);
    rows.push(["Views", "Reach", "Impressions", "Likes", "Comments", "Shares", "Saves", "Engagement %", "EMV (KES)"]);
    rows.push([totals.views, totals.reach, totals.impressions, totals.likes, totals.comments, totals.shares, totals.saves, er.toFixed(2), emv].map(String));
    rows.push([]);
    rows.push(["Posts"]);
    rows.push(["Creator", "Handle", "Platform", "Status", "Posted at", "Views", "Reach", "Impressions", "Likes", "Comments", "Shares", "Saves", "Engagement %", "URL"]);
    filteredPosts.forEach(p => {
      const m = p.metrics;
      const eR = m.views ? ((m.likes + m.comments + m.shares + (m.saves || 0)) / m.views * 100).toFixed(2) : "0.00";
      rows.push([
        p.influencers?.full_name ?? "", p.influencers?.handle ?? "", p.platform ?? "", p.status ?? "",
        p.posted_at ?? "", m.views || 0, m.reach || 0, m.impressions || 0, m.likes || 0, m.comments || 0,
        m.shares || 0, m.saves || 0, eR, p.post_url ?? "",
      ].map(String));
    });
    const csv = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Daraja Pulse" className="h-10 md:h-12 w-auto" />
            <div className="hidden sm:block h-8 w-px bg-border" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live campaign report</div>
              <div className="text-xs text-muted-foreground">Auto-refreshes every minute</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onInput={e => setFrom((e.target as HTMLInputElement).value)} onChange={e => setFrom(e.target.value)} className="h-8 text-xs w-[120px] md:w-[140px]" aria-label="From date" />
              <span className="text-xs text-muted-foreground hidden sm:inline">→</span>
              <Input type="date" value={to} onInput={e => setTo((e.target as HTMLInputElement).value)} onChange={e => setTo(e.target.value)} className="h-8 text-xs w-[120px] md:w-[140px]" aria-label="To date" />
              {(from || to) && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>}
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button>
            <Button variant="outline" size="sm" className="h-8" onClick={downloadReportAsPdf}><FileText className="w-3.5 h-3.5 mr-1.5" />PDF</Button>
            <Button variant="outline" size="sm" className="h-8" disabled={exporting} onClick={async () => {
              setExporting(true);
              try {
                await exportReportToPptx({
                  campaignName: campaign.name,
                  clientName: client?.name ?? "Client",
                  hashtag: campaign.hashtag,
                  budgetKes: Number(campaign.budget_kes || 0),
                  rangeLabel,
                  totals,
                  er,
                  emv,
                  topPerformer: topPerformer ? { name: topPerformer.ci.influencers?.full_name, handle: topPerformer.ci.influencers?.handle, views: topPerformer.views, likes: byCreator.get(topPerformer.ci.influencer_id)?.likes ?? 0 } : null,
                  platformRows: platformRows.map(([k, v]) => ({ platform: k, posts: v.posts, creators: v.creators.size, views: v.views, reach: v.reach })),
                  posts: filteredPosts.map(p => ({ creator: p.influencers?.full_name ?? "—", platform: p.platform ?? "—", views: p.metrics.views || 0, likes: p.metrics.likes || 0, comments: p.metrics.comments || 0, shares: p.metrics.shares || 0, url: p.post_url })),
                  learnings: campaign.learnings,
                  clientLogoUrl: client?.logo_url,
                });
              } finally { setExporting(false); }
            }}><Download className="w-3.5 h-3.5 mr-1.5" />{exporting ? "…" : "PPT"}</Button>
            <span className="hidden lg:inline-flex items-center gap-2 text-xs text-muted-foreground ml-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> {updatedAt.toLocaleTimeString()}
            </span>
          </div>

        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        {/* Header — matches CampaignDetail */}
        <div className="flex justify-between items-start gap-6 mb-8">
          <div className="min-w-0 flex items-start gap-4 flex-1">
            {client?.logo_url ? (
              <img src={client.logo_url} alt={`${client?.name} logo`} className="w-16 h-16 rounded-md object-contain bg-white border border-border p-1.5 shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-md bg-secondary border border-border flex items-center justify-center font-display text-xl shrink-0">
                {client?.name?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{client?.name ?? "Client"}</div>
              <h1 className="font-display text-3xl md:text-5xl font-semibold mt-1 break-words">{campaign.name}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm text-muted-foreground">
                {campaign.hashtag && <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{campaign.hashtag.replace(/^#/, "")}</span>}
                {campaign.budget_kes > 0 && <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />KES {Number(campaign.budget_kes).toLocaleString()}</span>}
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{influencers.length} creator{influencers.length === 1 ? "" : "s"}</span>
              </div>
              {campaign.objective && (
                <div className="mt-3 max-w-2xl">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Campaign goal</div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{campaign.objective}</p>
                </div>
              )}
            </div>
          </div>
          <Badge variant="outline" className="capitalize">{campaign.status}</Badge>
        </div>

        {/* Performance band — same style */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-px bg-border rounded-lg overflow-hidden mb-6 border border-border">
          {([
            { key: "views", label: "Views", value: fmt(totals.views), icon: Eye },
            { key: "reach", label: "Reach", value: fmt(totals.reach), icon: Radio },
            { key: "impressions", label: "Impressions", value: fmt(totals.impressions), icon: BarChart3 },
            { key: "likes", label: "Likes", value: fmt(totals.likes), icon: Heart },
            { key: "comments", label: "Comments", value: fmt(totals.comments), icon: MessageCircle },
            { key: "shares", label: "Shares", value: fmt(totals.shares), icon: Share2 },
            { key: "saves", label: "Saves", value: fmt(totals.saves), icon: Bookmark },
            { key: "engagement", label: "Engagement", value: `${er.toFixed(1)}%`, icon: Sparkles },
          ] as const).map((s) => {
            const active = metric === s.key;
            return (
              <button key={s.key} type="button" onClick={() => setMetric(s.key as any)} className={`text-left bg-card p-5 transition-colors hover:bg-secondary/40 ${active ? "outline outline-2 -outline-offset-2 outline-accent bg-secondary/30 relative z-10" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
                  {s.icon && <s.icon className={`w-3.5 h-3.5 ${active ? "text-accent" : "text-muted-foreground"}`} />}
                </div>
                <div className="font-display text-2xl mt-2">{s.value}</div>
              </button>
            );
          })}
        </div>

        {/* Velocity + EMV */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Velocity</div>
                <h2 className="font-display text-2xl mt-1">{metricLabel[metric]} over time</h2>
                <div className="text-xs text-muted-foreground mt-1">Click any metric above to switch the chart.</div>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v))} width={40} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => fmt(Number(v))} />
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#g)" name={metricLabel[metric]} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-6 bg-gradient-ink text-primary-foreground border-0">
            <div className="text-[10px] uppercase tracking-widest opacity-70">Earned media value</div>
            <div className="font-display text-5xl font-semibold mt-2">{fmtKes(emv)}</div>
            <p className="opacity-80 text-sm mt-3">{EMV_DISCLAIMER}</p>
            <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-60">Total interactions</div>
                <div className="font-display text-2xl mt-1">{fmt(totals.likes + totals.comments + totals.shares + totals.saves)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-60">Avg views / post</div>
                <div className="font-display text-2xl mt-1">{fmt(filteredPosts.length ? totals.views / filteredPosts.length : 0)}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs opacity-80">
              <MapPin className="w-3.5 h-3.5" /> Audience: ~80% Kenya · ~20% diaspora
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
                  {(() => {
                    const eng = totals.likes + totals.comments + totals.shares + totals.saves;
                    const cpe = eng > 0 && campaign.budget_kes > 0 ? campaign.budget_kes / eng : 0;
                    return <div className="flex justify-between items-baseline"><span className="text-sm text-muted-foreground">Cost per engagement</span><span className="font-display text-xl">{cpe > 0 ? `KES ${cpe.toFixed(2)}` : "—"}</span></div>;
                  })()}
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

        {/* ── Top 3 posts showcase ───────────────────────────────────── */}
        {filteredPosts.length > 0 && (() => {
          const withEng = filteredPosts.map(p => {
            const m = p.metrics;
            const eng = (m.likes||0)+(m.comments||0)+(m.shares||0)+(m.saves||0);
            const erP = m.views ? (eng / m.views * 100) : 0;
            const intent = (m.saves||0) + (m.shares||0);
            return { p, m, eng, erP, intent };
          });
          const byViews = [...withEng].sort((a,b)=>(b.m.views||0)-(a.m.views||0))[0];
          const byEr = [...withEng].filter(x=>x.m.views>=200).sort((a,b)=>b.erP-a.erP)[0] || withEng.sort((a,b)=>b.erP-a.erP)[0];
          const byIntent = [...withEng].sort((a,b)=>b.intent-a.intent)[0];
          const picks = [
            { label: "Most viewed", icon: Eye, item: byViews, stat: byViews ? fmt(byViews.m.views||0) + " views" : "" },
            { label: "Highest engagement", icon: Sparkles, item: byEr, stat: byEr ? `${byEr.erP.toFixed(1)}% ER` : "" },
            { label: "Strongest intent", icon: Flame, item: byIntent, stat: byIntent ? `${fmt(byIntent.intent)} saves + shares` : "" },
          ].filter(x => x.item);
          const uniqueIds = new Set(picks.map(x => x.item!.p.id));
          if (uniqueIds.size === 0) return null;
          return (
            <Card className="p-6 mb-6">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Standout content</div>
                  <h2 className="font-display text-2xl mt-1">Top posts</h2>
                </div>
                <div className="text-xs text-muted-foreground">Picked across three signals</div>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {picks.map(({ label, icon: Icon, item, stat }) => (
                  <a key={label} href={item!.p.post_url || "#"} target="_blank" rel="noreferrer" className="group rounded-lg border border-border overflow-hidden hover:border-accent/50 transition-colors bg-card">
                    <div className="aspect-[4/5] bg-secondary overflow-hidden flex items-center justify-center">
                      <PostThumb url={item!.p.post_url} platform={item!.p.platform} thumbnailUrl={item!.p.thumbnail_url} caption={item!.p.caption} handle={item!.p.influencers?.handle} />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent">
                        <Icon className="w-3 h-3" /> {label}
                      </div>
                      <div className="font-display text-lg mt-1 truncate">{item!.p.influencers?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">@{(item!.p.influencers?.handle || "").replace(/^@/, "")} · {item!.p.platform}</div>
                      <div className="mt-2 font-display text-xl tabular-nums">{stat}</div>
                    </div>
                  </a>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* ── Engagement quality mix ─────────────────────────────────── */}
        {(totals.likes + totals.comments + totals.shares + totals.saves) > 0 && (() => {
          const parts = [
            { k: "Likes",    v: totals.likes,    icon: Heart,         color: "bg-accent",          hex: "hsl(var(--accent))" },
            { k: "Comments", v: totals.comments, icon: MessageCircle, color: "bg-highlight",       hex: "hsl(var(--highlight))" },
            { k: "Shares",   v: totals.shares,   icon: Share2,        color: "bg-success",         hex: "hsl(var(--success))" },
            { k: "Saves",    v: totals.saves,    icon: Bookmark,      color: "bg-muted-foreground",hex: "hsl(var(--muted-foreground))" },
          ];
          const sum = parts.reduce((a,b)=>a+b.v,0) || 1;
          const intentPct = ((totals.shares + totals.saves) / sum * 100);
          return (
            <Card className="p-6 mb-6">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement quality</div>
                  <h2 className="font-display text-2xl mt-1">What drove the engagement</h2>
                </div>
                <div className="text-xs text-muted-foreground hidden md:block">Saves &amp; shares signal stronger intent</div>
              </div>
              <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
                <div className="space-y-3">
                  <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
                    {parts.map(p => (
                      <div key={p.k} className={p.color} style={{ width: `${(p.v / sum * 100).toFixed(2)}%` }} title={`${p.k}: ${p.v}`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {parts.map(({ k, v, icon: Icon, color }) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Icon className="w-3 h-3" />{k}</div>
                          <div className="font-display text-base tabular-nums">{fmt(v)} <span className="text-xs text-muted-foreground">({(v/sum*100).toFixed(0)}%)</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center px-4 py-3 rounded-lg bg-secondary/40 border border-border min-w-[160px]">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Intent share</div>
                  <div className="font-display text-3xl mt-1">{intentPct.toFixed(0)}%</div>
                  <div className="text-[10px] text-muted-foreground mt-1">saves + shares of all interactions</div>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* ── Posting cadence heatmap ────────────────────────────────── */}
        {filteredPosts.some(p => p.posted_at) && (() => {
          const dayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
          const cells = new Map<string, { posts: number; views: number }>();
          for (const p of filteredPosts) {
            if (!p.posted_at) continue;
            const d = new Date(p.posted_at);
            const dow = (d.getDay() + 6) % 7; // Mon=0
            const hour = d.getHours();
            const key = `${dow}-${hour}`;
            const cur = cells.get(key) ?? { posts: 0, views: 0 };
            cur.posts += 1;
            cur.views += p.metrics.views || 0;
            cells.set(key, cur);
          }
          const max = Math.max(1, ...Array.from(cells.values()).map(c => c.views));
          let best = { dow: 0, hour: 0, views: 0 };
          for (const [k, v] of cells.entries()) {
            if (v.views > best.views) {
              const [d, h] = k.split("-").map(Number);
              best = { dow: d, hour: h, views: v.views };
            }
          }
          const slotLabel = (h: number) => `${((h+11)%12)+1}${h<12?"am":"pm"}`;
          const hours = [0,3,6,9,12,15,18,21];
          return (
            <Card className="p-6 mb-6">
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Posting cadence</div>
                  <h2 className="font-display text-2xl mt-1">When content lands &amp; what wins</h2>
                </div>
                {best.views > 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    Peak slot · <span className="font-medium text-foreground">{dayLabels[best.dow]} {slotLabel(best.hour)}</span> · {fmt(best.views)} views
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid" style={{ gridTemplateColumns: `48px repeat(24, minmax(0, 1fr))` }}>
                    <div />
                    {Array.from({ length: 24 }).map((_, h) => (
                      <div key={h} className="text-[9px] text-center text-muted-foreground pb-1">{hours.includes(h) ? slotLabel(h) : ""}</div>
                    ))}
                    {dayLabels.map((dl, di) => (
                      <div key={dl} className="contents">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground self-center pr-2">{dl}</div>
                        {Array.from({ length: 24 }).map((_, h) => {
                          const c = cells.get(`${di}-${h}`);
                          const intensity = c ? Math.max(0.08, c.views / max) : 0;
                          return (
                            <div
                              key={h}
                              title={c ? `${dl} ${slotLabel(h)} · ${c.posts} post${c.posts===1?"":"s"} · ${fmt(c.views)} views` : `${dl} ${slotLabel(h)}`}
                              className="aspect-square m-[1px] rounded-sm border border-border/40"
                              style={{ backgroundColor: c ? `hsl(var(--accent) / ${intensity})` : "hsl(var(--secondary))" }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Less
                {[0.15, 0.35, 0.55, 0.8, 1].map(o => (
                  <span key={o} className="w-3 h-3 rounded-sm border border-border/40" style={{ backgroundColor: `hsl(var(--accent) / ${o})` }} />
                ))}
                More
              </div>
            </Card>
          );
        })()}

        {/* ── Creator leaderboard + reach efficiency ─────────────────── */}
        {byCreator.size > 0 && (() => {
          const rows = influencers
            .map(ci => {
              const s = byCreator.get(ci.influencer_id);
              if (!s) return null;
              const inf = ci.influencers ?? {};
              const followers = Number(inf.follower_count || 0);
              const eng = s.likes + s.comments + s.shares + s.saves;
              const erP = s.views ? (eng / s.views * 100) : 0;
              const eff = followers > 0 ? (s.views / followers) : 0;
              return { ci, inf, s, followers, eng, erP, eff };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.s.views - a.s.views) as any[];
          if (rows.length === 0) return null;
          const maxViews = Math.max(1, ...rows.map(r => r.s.views));
          return (
            <Card className="p-5 mb-6 overflow-hidden">
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Creator leaderboard</div>
                <h2 className="font-display text-2xl">Who delivered &amp; who punched above their weight</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2 pr-3">#</th>
                      <th className="text-left font-medium py-2 pr-3">Creator</th>
                      <th className="text-right font-medium py-2 px-3">Posts</th>
                      <th className="text-right font-medium py-2 px-3">Views</th>
                      <th className="text-right font-medium py-2 px-3">ER</th>
                      <th className="text-right font-medium py-2 px-3"><span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" />Reach eff.</span></th>
                      <th className="text-left font-medium py-2 pl-3">Share of campaign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 12).map((r, i) => (
                      <tr key={r.ci.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <div className="font-medium truncate max-w-[180px]">{r.inf.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">@{(r.inf.handle || "").replace(/^@/, "")}</div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.s.posts}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(r.s.views)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.erP.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.followers > 0 ? `${(r.eff * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-2 pl-3 min-w-[140px]">
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${(r.s.views / maxViews * 100).toFixed(1)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground">Reach eff. = views ÷ follower count. Above 100% means the post reached well beyond their own audience.</div>
            </Card>
          );
        })()}

        {/* ── Share of voice ─────────────────────────────────────────── */}
        {totals.views > 0 && byCreator.size > 1 && (() => {
          const rows = influencers
            .map(ci => {
              const s = byCreator.get(ci.influencer_id);
              if (!s || s.views === 0) return null;
              return { name: ci.influencers?.full_name ?? "—", views: s.views, share: s.views / totals.views * 100 };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b!.views - a!.views) as { name: string; views: number; share: number }[];
          const top = rows.slice(0, 8);
          const restShare = rows.slice(8).reduce((a, r) => a + r.share, 0);
          if (restShare > 0) top.push({ name: `+${rows.length - 8} others`, views: rows.slice(8).reduce((a,r)=>a+r.views,0), share: restShare });
          return (
            <Card className="p-6 mb-6">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><PieIcon className="w-3 h-3" />Share of voice</div>
                  <h2 className="font-display text-2xl mt-1">Who owns the campaign reach</h2>
                </div>
              </div>
              <div className="space-y-2.5">
                {top.map((r, i) => (
                  <div key={r.name + i} className="flex items-center gap-3">
                    <div className="w-40 truncate text-sm">{r.name}</div>
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full ${i === 0 ? "bg-accent" : i === 1 ? "bg-highlight" : "bg-accent/60"}`} style={{ width: `${r.share.toFixed(1)}%` }} />
                    </div>
                    <div className="w-24 text-right tabular-nums text-sm">{r.share.toFixed(1)}%</div>
                    <div className="w-20 text-right tabular-nums text-xs text-muted-foreground">{fmt(r.views)}</div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* ── Cost efficiency per creator ────────────────────────────── */}
        {campaign.budget_kes > 0 && byCreator.size > 0 && (() => {
          const totalFee = influencers.reduce((a, x) => a + Number(x.fee_kes || 0), 0);
          const fallbackBudget = totalFee > 0 ? totalFee : Number(campaign.budget_kes);
          const rows = influencers
            .map(ci => {
              const s = byCreator.get(ci.influencer_id);
              if (!s) return null;
              const fee = Number(ci.fee_kes || 0) || (fallbackBudget / Math.max(1, influencers.length));
              const eng = s.likes + s.comments + s.shares + s.saves;
              const cpv = s.views > 0 ? fee / s.views : 0;
              const cpe = eng > 0 ? fee / eng : 0;
              const cpm = s.views > 0 ? (fee / s.views) * 1000 : 0;
              return { ci, s, fee, eng, cpv, cpe, cpm };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => (a.cpv === 0 ? Infinity : a.cpv) - (b.cpv === 0 ? Infinity : b.cpv)) as any[];
          if (rows.length === 0) return null;
          return (
            <Card className="p-5 mb-6 overflow-hidden">
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Coins className="w-3 h-3" />Cost efficiency</div>
                <h2 className="font-display text-2xl">Best value creators</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                      <th className="text-left font-medium py-2 pr-3">Creator</th>
                      <th className="text-right font-medium py-2 px-3">Fee</th>
                      <th className="text-right font-medium py-2 px-3">Views</th>
                      <th className="text-right font-medium py-2 px-3">CPV</th>
                      <th className="text-right font-medium py-2 px-3">CPM</th>
                      <th className="text-right font-medium py-2 pl-3">CPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 12).map((r) => (
                      <tr key={r.ci.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-medium truncate max-w-[200px]">{r.ci.influencers?.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">@{(r.ci.influencers?.handle || "").replace(/^@/, "")}</div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.fee > 0 ? fmtKes(r.fee) : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(r.s.views)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.cpv > 0 ? `KES ${r.cpv.toFixed(2)}` : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.cpm > 0 ? `KES ${r.cpm.toFixed(0)}` : "—"}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">{r.cpe > 0 ? `KES ${r.cpe.toFixed(2)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground">CPV = cost per view · CPM = cost per 1,000 views · CPE = cost per engagement. Where individual fees aren't recorded, budget is split evenly.</div>
            </Card>
          );
        })()}

        {/* Audience */}
        {influencers.length > 0 && (() => {
          const totalFollowers = influencers.reduce((a, x) => a + Number(x.influencers?.follower_count || 0), 0);
          const weightedKE = totalFollowers > 0
            ? influencers.reduce((a, x) => a + Number(x.influencers?.follower_count || 0) * Number(x.influencers?.audience_kenya_pct || 0), 0) / totalFollowers
            : 0;
          const diaspora = 100 - weightedKE;
          const langs = new Set<string>();
          influencers.forEach(x => (x.influencers?.languages || []).forEach((l: string) => langs.add(l)));

          const weight = (key: string, sub: string) => {
            if (totalFollowers === 0) return 0;
            let acc = 0;
            influencers.forEach(x => {
              const f = Number(x.influencers?.follower_count || 0);
              const v = Number(x.influencers?.[key]?.[sub] || 0);
              acc += f * v;
            });
            return acc / totalFollowers;
          };
          const ages = ["13-17","18-24","25-34","35-44","45-54","55+"].map(b => ({ bucket: b, pct: weight("audience_age_breakdown", b) }));
          const genders = ["female","male","other"].map(g => ({ gender: g, pct: weight("audience_gender_breakdown", g) }));
          const cityMap = new Map<string, number>();
          influencers.forEach(x => {
            const f = Number(x.influencers?.follower_count || 0);
            const list = (x.influencers?.audience_top_cities || []) as Array<{city:string; pct:number}>;
            list.forEach(({ city, pct }) => {
              cityMap.set(city, (cityMap.get(city) || 0) + (totalFollowers > 0 ? (f * Number(pct||0)) / totalFollowers : 0));
            });
          });
          const cities = Array.from(cityMap.entries()).map(([city, pct]) => ({ city, pct })).sort((a,b)=>b.pct-a.pct).slice(0,6);

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

              <div className="grid md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-border">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Age</div>
                  <div className="space-y-2">
                    {ages.map(a => (
                      <div key={a.bucket}>
                        <div className="flex justify-between text-xs mb-1"><span>{a.bucket}</span><span className="tabular-nums text-muted-foreground">{a.pct.toFixed(0)}%</span></div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-accent" style={{ width: `${Math.min(100, a.pct)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Gender</div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden flex mb-3">
                    <div className="bg-accent h-full" style={{ width: `${genders[0]?.pct || 0}%` }} />
                    <div className="bg-highlight h-full" style={{ width: `${genders[1]?.pct || 0}%` }} />
                    <div className="bg-muted-foreground/40 h-full" style={{ width: `${genders[2]?.pct || 0}%` }} />
                  </div>
                  <div className="space-y-1.5">
                    {genders.map((g, i) => (
                      <div key={g.gender} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${i===0?"bg-accent":i===1?"bg-highlight":"bg-muted-foreground/40"}`} />
                          <span className="capitalize">{g.gender}</span>
                        </div>
                        <span className="tabular-nums text-muted-foreground">{g.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Top cities</div>
                  <div className="space-y-2">
                    {cities.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                    {cities.map(c => (
                      <div key={c.city}>
                        <div className="flex justify-between text-xs mb-1"><span>{c.city}</span><span className="tabular-nums text-muted-foreground">{c.pct.toFixed(0)}%</span></div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-highlight" style={{ width: `${Math.min(100, c.pct)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Hashtag contests */}
        {contests.length > 0 && (() => {
          const scoreOf = (s: any) => Number(s.shares || 0) * 3 + Number(s.comments || 0) * 2 + Number(s.likes || 0);
          return (
            <div className="space-y-6 mb-6">
              {contests.map((ct) => {
                const entries = contestEntries.filter((e) => e.contest_id === ct.id);
                if (!entries.length) return null;
                const creatorSet = new Set<string>();
                for (const inf of influencers) {
                  const h = cleanH(inf.influencers?.handle);
                  if (h) creatorSet.add(h);
                }
                const isCreator = (e: any) => {
                  const hs = [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle].map(cleanH).filter(Boolean);
                  return hs.some(h => creatorSet.has(h));
                };
                const groups = new Map<string, any[]>();
                for (const e of entries) {
                  if (isCreator(e)) continue;
                  const key = contestantKey(e);
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(e);
                }
                const contestants = Array.from(groups.entries()).map(([key, rows]) => {
                  const reg = rows.find((r) => r.source === "registration") || rows[0];
                  // Dedupe by canonical URL — pick the highest-scoring duplicate.
                  const byUrl = new Map<string, any>();
                  for (const r of rows) {
                    if (!r.post_url) continue;
                    const cu = canonicalPostUrl(r.post_url);
                    const prev = byUrl.get(cu);
                    if (!prev || scoreOf(r) > scoreOf(prev)) byUrl.set(cu, r);
                  }
                  const postsR = Array.from(byUrl.values());
                  const total = postsR.reduce((s, p) => s + scoreOf(p), 0);
                  const tViews = postsR.reduce((s, p) => s + Number(p.views || 0), 0);
                  const tLikes = postsR.reduce((s, p) => s + Number(p.likes || 0), 0);
                  const tComments = postsR.reduce((s, p) => s + Number(p.comments || 0), 0);
                  const tShares = postsR.reduce((s, p) => s + Number(p.shares || 0), 0);
                  return { key, reg, posts: postsR, total, tViews, tLikes, tComments, tShares };
                }).filter(c => c.posts.length > 0).sort((a, b) => b.total - a.total);
                const ctTotals = contestants.reduce((a, c) => ({
                  views: a.views + c.tViews, likes: a.likes + c.tLikes, comments: a.comments + c.tComments, shares: a.shares + c.tShares, posts: a.posts + c.posts.length,
                }), { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 });
                return (
                  <Card key={ct.id} className="p-6">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Trophy className="w-3 h-3 text-highlight" /> Hashtag contest</div>
                        <h2 className="font-display text-2xl mt-1">{ct.name} <span className="font-mono text-base text-muted-foreground ml-1">{ct.hashtag}</span></h2>
                        <div className="text-xs text-muted-foreground mt-1">{ct.start_date} → {ct.end_date}{ct.prize ? ` · Prize: ${ct.prize}` : ""}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Contestants</div>
                        <div className="font-display text-2xl">{contestants.length}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border rounded-lg overflow-hidden border border-border mb-5">
                      {[
                        { l: "Posts", v: ctTotals.posts },
                        { l: "Views", v: fmt(ctTotals.views) },
                        { l: "Likes", v: fmt(ctTotals.likes) },
                        { l: "Comments", v: fmt(ctTotals.comments) },
                        { l: "Shares", v: fmt(ctTotals.shares) },
                      ].map((s) => (
                        <div key={s.l} className="bg-card p-4">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                          <div className="font-display text-xl mt-1">{s.v}</div>
                        </div>
                      ))}
                    </div>

                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Leaderboard</div>
                    <div className="overflow-x-auto border border-border rounded-md">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">#</th>
                            <th className="text-left px-3 py-2">Contestant</th>
                            <th className="text-left px-3 py-2">Handles</th>
                            <th className="text-right px-3 py-2">Posts</th>
                            <th className="text-right px-3 py-2">Views</th>
                            <th className="text-right px-3 py-2">Likes</th>
                            <th className="text-right px-3 py-2">Comments</th>
                            <th className="text-right px-3 py-2">Shares</th>
                            <th className="text-right px-3 py-2">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contestants.slice(0, 25).map((c, i) => (
                            <tr key={c.key} className="border-t border-border align-top">
                              <td className="px-3 py-2 tabular-nums">{i + 1}{i === 0 && <Crown className="inline w-4 h-4 text-highlight ml-1" />}</td>
                              <td className="px-3 py-2">{c.reg.full_name || c.reg.submitter_name || c.reg.handle || "Contestant"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {c.reg.instagram_handle && <span className="inline-flex items-center gap-1"><Instagram className="w-3 h-3" />@{c.reg.instagram_handle}</span>}
                                  {c.reg.tiktok_handle && <span className="inline-flex items-center gap-1"><Music2 className="w-3 h-3" />@{c.reg.tiktok_handle}</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{c.posts.length}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt(c.tViews)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt(c.tLikes)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt(c.tComments)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt(c.tShares)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">{Math.round(c.total).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
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
                      {s && (() => {
                        const cer = s.views > 0 ? ((s.likes + s.comments + s.shares + s.saves) / s.views) * 100 : 0;
                        return (
                          <div className="grid grid-cols-6 gap-1 mt-2 ml-12 text-center">
                            <div><div className="text-xs font-medium tabular-nums">{fmt(s.views)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                            <div><div className="text-xs font-medium tabular-nums">{fmt(s.likes)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                            <div><div className="text-xs font-medium tabular-nums">{fmt(s.comments)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Comm.</div></div>
                            <div><div className="text-xs font-medium tabular-nums">{fmt(s.shares)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Shares</div></div>
                            <div><div className="text-xs font-medium tabular-nums">{fmt(s.saves)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">Saves</div></div>
                            <div><div className="text-xs font-medium tabular-nums">{cer.toFixed(1)}%</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">ER</div></div>
                          </div>
                        );
                      })()}
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
            {filteredPosts.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-md">
                <p className="text-sm text-muted-foreground">No posts published yet — check back soon.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredPosts.map(p => (
                  <li key={p.id} className="p-3 rounded-md border border-border hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm min-w-0 truncate">
                        <span className="font-medium">{p.influencers?.full_name}</span>
                        <span className="text-muted-foreground"> · {p.platform}</span>
                      </div>
                      <Badge variant="outline" className="capitalize">{p.status}</Badge>
                    </div>
                    {p.post_url && (
                      <div className="mt-3 grid md:grid-cols-[minmax(0,220px)_1fr] gap-4 items-start">
                        <div className="no-print w-full max-w-[220px]">
                          <PostThumb
                            url={p.post_url}
                            platform={p.platform}
                            thumbnailUrl={(p as any).thumbnail_url}
                            caption={(p as any).caption}
                            handle={p.influencers?.handle || p.influencers?.full_name}
                          />
                        </div>
                        <div className="min-w-0">
                          <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-accent break-all block">{p.post_url}</a>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-center">
                            <div><div className="font-display text-base">{fmt(p.metrics.views || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                            <div><div className="font-display text-base">{fmt(p.metrics.likes || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                            <div><div className="font-display text-base">{fmt(p.metrics.comments || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Comments</div></div>
                            <div><div className="font-display text-base">{fmt(p.metrics.shares || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Shares</div></div>
                            <div><div className="font-display text-base">{fmt(p.metrics.saves || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saves</div></div>
                            <div><div className="font-display text-base">{fmt(p.metrics.reach || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reach</div></div>
                          </div>
                        </div>
                      </div>
                    )}
                    {!p.post_url && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-center">
                      <div><div className="font-display text-base">{fmt(p.metrics.views || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.likes || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.comments || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Comments</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.shares || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Shares</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.saves || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saves</div></div>
                      <div><div className="font-display text-base">{fmt(p.metrics.reach || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reach</div></div>
                    </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
export default PublicReport;
