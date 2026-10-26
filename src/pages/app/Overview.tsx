import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, FileSignature, LayoutGrid, Plus, Rows3, Send, Sparkles } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AddUpBars, ReportCard } from "@/components/report/ReportOverview";
import { campaignBreakdown, type CampaignViews } from "@/lib/overviewBreakdown";

import OnboardingChecklist from "@/components/OnboardingChecklist";
import { useNavCounts } from "@/hooks/useNavCounts";

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

type Attention = { tone: "ok" | "warn" | "bad"; title: string; detail: string; to?: string };
const TONES = {
  ok: { icon: CheckCircle2, cls: "bg-status-good/10 text-status-good" },
  warn: { icon: AlertTriangle, cls: "bg-status-warn/10 text-status-warn" },
  bad: { icon: AlertCircle, cls: "bg-status-bad/10 text-status-bad" },
} as const;

const Overview = () => {
  const { user } = useAuth();
  const { pendingDrafts } = useNavCounts();
  const [firstName, setFirstName] = useState<string>("");
  const [s, setS] = useState({ clients: 0, campaigns: 0, influencers: 0, payouts: 0, live: 0, posts: 0, briefs: 0, contests: 0 });
  const [totals, setTotals] = useState({ views: 0, likes: 0, comments: 0, shares: 0, reach: 0 });
  const [loaded, setLoaded] = useState(false);
  const [byCampaign, setByCampaign] = useState<CampaignViews[] | null>(null);
  const [topCampaign, setTopCampaign] = useState<any>(null);
  const [topCreator, setTopCreator] = useState<any>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);
  // Draft campaigns that already have posts: the scheduled metrics refresh skips them.
  const [skippedDrafts, setSkippedDrafts] = useState<{ id: string; name: string; posts: number }[]>([]);

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
    supabase.from("campaigns").select("id, name, posts(count)").eq("status", "draft").then(({ data }) => {
      const rows = (data ?? []) as unknown as { id: string; name: string; posts: { count: number }[] | null }[];
      setSkippedDrafts(rows.map((c) => ({ id: c.id, name: c.name, posts: Number(c.posts?.[0]?.count ?? 0) })).filter((c) => c.posts > 0));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only the legacy `series` output uses the date range, and this page no longer shows it, so ask for one day.
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc("dashboard_overview" as any, { _from: today, _to: today });
      if (cancelled || error || !data) { if (!cancelled) setLoaded(true); return; }
      const d: any = data;
      setS({
        clients: d.clients ?? 0,
        campaigns: d.campaigns ?? 0,
        influencers: d.influencers ?? 0,
        payouts: 0,
        live: d.live ?? 0,
        posts: d.posts ?? 0,
        briefs: d.briefs ?? 0,
        contests: d.contests ?? 0,
      });
      setTotals({
        views: Number(d.totals?.views ?? 0),
        likes: Number(d.totals?.likes ?? 0),
        comments: Number(d.totals?.comments ?? 0),
        shares: Number(d.totals?.shares ?? 0),
        reach: Number(d.totals?.reach ?? 0),
      });
      // Absent until the faster dashboard_overview migration is applied.
      setByCampaign(Array.isArray(d.by_campaign) ? (d.by_campaign as { id: string; name: string; views: number | string }[]).map((c) => ({ id: c.id, name: c.name, views: Number(c.views || 0) })) : null);
      setRecentCampaigns(d.recent ?? []);
      if (d.top_campaign) setTopCampaign({ id: d.top_campaign.id, name: d.top_campaign.name, views: Number(d.top_campaign.views || 0) });
      if (d.top_post) {
        setTopCreator({
          id: d.top_post.post_id,
          caption: d.top_post.caption,
          views: Number(d.top_post.views || 0),
          likes: Number(d.top_post.likes || 0),
          campaigns: { name: d.top_post.campaign_name },
          influencers: { handle: d.top_post.handle, full_name: d.top_post.full_name },
        });
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const er = totals.views > 0 ? ((totals.likes + totals.comments + totals.shares) / totals.views) * 100 : 0;
  const breakdown = byCampaign ? campaignBreakdown(byCampaign, totals.views, s.campaigns) : null;
  // Until the migration is applied there is no breakdown; give that room to the other cards rather than leave a gap.
  const wide = loaded && !breakdown;

  const attention: Attention[] = [
    ...skippedDrafts.map((c) => ({
      tone: "bad" as const,
      title: `${c.name} is still a draft`,
      detail: `Its ${c.posts} post${c.posts === 1 ? " is" : "s are"} skipped by the scheduled metrics refresh. Set it to Live to resume.`,
      to: `/app/campaigns/${c.id}`,
    })),
    ...(pendingDrafts > 0
      ? [{ tone: "warn" as const, title: `${pendingDrafts} video draft${pendingDrafts === 1 ? "" : "s"} to review`, detail: "Creators can't post until their video is approved.", to: "/app/approvals" }]
      : []),
  ];
  if (attention.length === 0) attention.push({ tone: "ok", title: "Nothing waiting on you", detail: "Every campaign with posts is in the scheduled refresh and no drafts are pending." });

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto px-4 py-6 sm:p-8">
      <header className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <div className="text-sm text-muted-foreground">Agency console</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold mt-1 break-words">
            {greeting()}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="text-muted-foreground mt-1">Here's where your campaigns stand today.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCompact(!compact)} title="Toggle compact mode">
          {compact ? <LayoutGrid className="w-4 h-4 mr-1" /> : <Rows3 className="w-4 h-4 mr-1" />}
          {compact ? "Comfortable" : "Compact"}
        </Button>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-full"><Link to="/app/campaigns"><Plus className="w-4 h-4 mr-1.5" />New campaign</Link></Button>
        <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/app/briefs"><FileSignature className="w-4 h-4 mr-1.5" />Send brief</Link></Button>
        <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/app/influencers"><Send className="w-4 h-4 mr-1.5" />Invite creator</Link></Button>
      </div>

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
                [["Clients", s.clients, "/app/clients"], ["Views", loaded ? fmt(totals.views) : "—"]],
                [["Campaigns", `${s.campaigns} (${s.live} live)`, "/app/campaigns"], ["Reach", loaded ? fmt(totals.reach) : "—"]],
                [["Creators", s.influencers, "/app/influencers"], ["Likes", loaded ? fmt(totals.likes) : "—"]],
                [["Drafts to review", pendingDrafts, "/app/approvals"], ["Comments", loaded ? fmt(totals.comments) : "—"]],
                [["Posts tracked", s.posts, "/app/reports"], ["Engagement", loaded ? `${er.toFixed(2)}%` : "—"]],
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
        <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-12">
          <ReportCard title="Views" subtitle="Across all your campaigns" className={cn("flex flex-col", wide ? "lg:col-span-7" : "lg:col-span-4")}>
            <div className="text-[56px] font-light leading-none tracking-[-0.035em] tabular-nums">{loaded ? fmt(totals.views) : "—"}</div>
            <p className="mt-4 max-w-[38ch] text-[13.5px] leading-relaxed text-muted-foreground">
              {loaded
                ? `${s.posts.toLocaleString()} posts across ${s.campaigns} campaign${s.campaigns === 1 ? "" : "s"}, ${s.live} live. ${er.toFixed(1)}% of views turned into a like, comment or share.`
                : "Loading your campaigns…"}
            </p>
            <dl className="mt-auto divide-y divide-border/70 pt-4">
              {[
                { label: "Likes", value: fmt(totals.likes) },
                { label: "Comments", value: fmt(totals.comments) },
                { label: "Shares", value: fmt(totals.shares) },
                { label: "Reach", value: fmt(totals.reach) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="font-medium tabular-nums">{loaded ? r.value : "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              As reported by each platform. Campaign pages also estimate shares and reach where a platform doesn't report them, so those can be higher.
            </p>
          </ReportCard>

          {breakdown ? (
            <ReportCard title="Views by campaign" subtitle={`${fmt(totals.views)} views, campaign by campaign`} className="lg:col-span-5">
              <AddUpBars items={breakdown.items} total={totals.views} />
              <p className="mt-5 rounded-xl border border-border/70 bg-background/70 p-3.5 text-[13px] leading-relaxed">{breakdown.callout}</p>
            </ReportCard>
          ) : !loaded ? (
            <ReportCard title="Views by campaign" className="lg:col-span-5">
              <div className="h-56 animate-pulse rounded-xl bg-secondary/60" aria-hidden />
            </ReportCard>
          ) : null}

          <ReportCard
            title="Needs attention"
            subtitle={attention[0].tone === "ok" ? "All clear" : `${attention.length} thing${attention.length === 1 ? "" : "s"} waiting on you`}
            className={wide ? "lg:col-span-5" : "lg:col-span-3"}
          >
            <ul className="-my-1 divide-y divide-border/70">
              {attention.map((a) => {
                const T = TONES[a.tone];
                const body = (
                  <>
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", T.cls)}>
                      <T.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium leading-snug">{a.title}</div>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{a.detail}</p>
                    </div>
                  </>
                );
                return (
                  <li key={a.title}>
                    {a.to ? <Link to={a.to} className="flex gap-3 rounded-lg py-3 hover:bg-secondary/40">{body}</Link> : <div className="flex gap-3 py-3">{body}</div>}
                  </li>
                );
              })}
            </ul>
          </ReportCard>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Clients", value: s.clients, to: "/app/clients" },
          { label: "Campaigns", value: s.campaigns, sub: `${s.live} live`, to: "/app/campaigns" },
          { label: "Creators", value: s.influencers, to: "/app/influencers" },
          { label: "Contests", value: s.contests, to: "/app/contests" },
        ].map((t) => (
          <Link key={t.label} to={t.to} className="group rounded-[16px] border border-border/70 bg-card px-4 py-3.5 transition-colors hover:bg-secondary/40">
            <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
              {t.label}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[26px] font-light leading-none tracking-[-0.02em] tabular-nums">{loaded ? t.value : "—"}</span>
              {loaded && t.sub && <span className="text-[12px] text-muted-foreground">{t.sub}</span>}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <section className="bg-pattern-card relative flex min-h-[260px] flex-col overflow-hidden rounded-[20px] p-6 text-white lg:col-span-5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Top campaign
          </span>
          {topCampaign ? (
            <div className="mt-auto pt-8">
              <div className="flex items-baseline gap-3">
                <span className="text-[44px] font-light leading-none tracking-[-0.035em] tabular-nums">{fmt(topCampaign.views)}</span>
                <span className="text-[12.5px] text-white/70">views</span>
              </div>
              <h3 className="mt-4 font-sans text-[20px] font-medium leading-tight">{topCampaign.name}</h3>
              {topCreator && (
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/75">
                  Best post across the agency: {topCreator.influencers?.full_name || topCreator.influencers?.handle || "a creator"} with {fmt(topCreator.views)} views and {fmt(topCreator.likes)} likes.
                </p>
              )}
              <Link to={`/app/campaigns/${topCampaign.id}`} className="mt-5 inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-foreground hover:bg-white/90">
                Open campaign <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          ) : (
            <p className="mt-auto pt-8 text-[13.5px] text-white/75">{loaded ? "No campaign data yet." : "Loading…"}</p>
          )}
        </section>

        <ReportCard title="Recent campaigns" action={<Link to="/app/campaigns" className="text-[12.5px] text-muted-foreground hover:text-foreground">View all</Link>} className="lg:col-span-7">
          <ul className="-my-1 divide-y divide-border/70">
            {recentCampaigns.length === 0 && <li className="py-3 text-sm text-muted-foreground">{loaded ? "No campaigns yet." : "Loading…"}</li>}
            {recentCampaigns.map((c: any) => (
              <li key={c.id}>
                <Link to={`/app/campaigns/${c.id}`} className="group flex min-w-0 items-center justify-between gap-3 rounded-lg py-3 hover:bg-secondary/40">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-muted-foreground">{c.clients?.name || "No client"}</div>
                    <div className="truncate text-[14px] font-medium">{c.name}</div>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] capitalize",
                    c.status === "live" ? "bg-status-good/10 text-status-good" : c.status === "draft" ? "bg-status-warn/10 text-status-warn" : "bg-secondary text-muted-foreground",
                  )}>{c.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </ReportCard>
      </div>
    </div>
  );
};

export default Overview;
