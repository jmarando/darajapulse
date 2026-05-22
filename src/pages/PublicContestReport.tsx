import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, Eye, Heart, MessageCircle, Share2, Hash, Calendar, Crown, Instagram, Music2, Facebook, Link2 } from "lucide-react";
import { canonicalPostUrl, cleanHandle as cleanH } from "@/lib/postUrl";
import PublicFooter from "@/components/PublicFooter";

const fmt = (n: number) => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const fmtDate = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(+d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// Score: shares ×3 + comments ×2 + likes ×1 + views ×1
const scoreOf = (e: { shares?: any; comments?: any; likes?: any; views?: any }) =>
  Number(e.shares || 0) * 3 + Number(e.comments || 0) * 2 + Number(e.likes || 0) + Number(e.views || 0);

const postTime = (post: any) => {
  const t = new Date(post?.posted_at || post?.created_at || 0).getTime();
  return Number.isFinite(t) && t > 0 ? t : Number.MAX_SAFE_INTEGER;
};
const sourceRank = (post: any) => {
  const source = String(post?.source || "").toLowerCase();
  if (source === "manual" || source === "public_form") return 0;
  if (source === "registration" || source === "csv_import" || source === "external_feed") return 1;
  return 2;
};
const pickCountedPost = (rows: any[]) => {
  const byUrl = new Map<string, any>();
  for (const row of rows) {
    const candidates = [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])];
    for (const post of candidates) {
      const key = canonicalPostUrl(post?.post_url);
      if (!key) continue;
      const prev = byUrl.get(key);
      if (!prev || sourceRank(post) < sourceRank(prev) || (sourceRank(post) === sourceRank(prev) && scoreOf(post) > scoreOf(prev))) byUrl.set(key, post);
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => scoreOf(b) - scoreOf(a) || sourceRank(a) - sourceRank(b) || postTime(a) - postTime(b))[0] || null;
};

const PlatformIcon = ({ p, className }: { p: string; className?: string }) => {
  const Icon = p === "instagram" ? Instagram : p === "tiktok" ? Music2 : p === "facebook" ? Facebook : Link2;
  return <Icon className={className ?? "w-3.5 h-3.5"} />;
};

const PublicContestReport = () => {
  const { token } = useParams<{ token: string }>();
  const [contest, setContest] = useState<any | null>(null);
  const [client, setClient] = useState<any | null>(null);
  const [campaign, setCampaign] = useState<any | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [creatorHandles, setCreatorHandles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await supabase.rpc("get_contest_by_token", { _token: token });
      if (!data) { setNotFound(true); setLoading(false); return; }
      setContest(data);
      setClient((data as any).client);
      setCampaign((data as any).campaign);
      const cid = (data as any).id;
      const [{ data: es }, { data: inf }] = await Promise.all([
        supabase.from("contest_entries").select("*").eq("contest_id", cid),
        supabase.from("influencers").select("handle, alt_handles"),
      ]);
      setEntries(es ?? []);
      const s = new Set<string>();
      for (const r of inf ?? []) {
        const h = cleanH((r as any).handle);
        if (h) s.add(h);
        for (const a of ((r as any).alt_handles ?? [])) {
          const c = cleanH(a); if (c) s.add(c);
        }
      }
      setCreatorHandles(s);
      setLoading(false);
    })();
  }, [token]);

  // Paid creators (agency roster) must never appear in contestant standings.
  const visibleEntries = useMemo(() => {
    if (creatorHandles.size === 0) return entries;
    return entries.filter((e) => {
      const hs = [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle].map(cleanH).filter(Boolean);
      return !hs.some((h) => creatorHandles.has(h as string));
    });
  }, [entries, creatorHandles]);

  // Group entries by contestant key (handle, then fallbacks) and pick best post per contestant.
  const contestants = useMemo(() => {
    const key = (e: any) => {
      const h = [e.instagram_handle, e.tiktok_handle, e.facebook_handle, e.handle].map(cleanH).find(Boolean);
      if (h) return `handle:${h}`;
      return `entry:${e.id}`;
    };
    const groups = new Map<string, any[]>();
    for (const e of visibleEntries) {
      const k = key(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    }
    return Array.from(groups.values())
      .map((rows) => {
        const reg = rows.find((r) => r.source === "registration") || rows[0];
        const best = pickCountedPost(rows);
        const posts = best ? [best] : [];
        return { reg, posts, best, score: best ? scoreOf(best) : 0 };
      })
      .sort((a, b) => b.score - a.score);
  }, [visibleEntries]);

  const totals = useMemo(() => {
    let views = 0, likes = 0, comments = 0, shares = 0;
    for (const e of visibleEntries) {
      views += Number(e.views || 0);
      likes += Number(e.likes || 0);
      comments += Number(e.comments || 0);
      shares += Number(e.shares || 0);
    }
    return { views, likes, comments, shares, eng: likes + comments + shares };
  }, [visibleEntries]);

  const platformRows = useMemo(() => {
    const map = new Map<string, { posts: number; views: number; eng: number }>();
    for (const e of visibleEntries) {
      const k = String(e.platform || "other");
      const cur = map.get(k) ?? { posts: 0, views: 0, eng: 0 };
      cur.posts += 1;
      cur.views += Number(e.views || 0);
      cur.eng += Number(e.likes || 0) + Number(e.comments || 0) + Number(e.shares || 0);
      map.set(k, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].views - a[1].views);
  }, [visibleEntries]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (notFound || !contest) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Contest report not found or no longer active.</div>;

  const today = new Date();
  const isLive = today >= new Date(contest.start_date) && today <= new Date(contest.end_date);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
        {/* Hero */}
        <div className="flex items-start justify-between mb-8 gap-6 flex-wrap">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            {client?.logo_url ? (
              <img src={client.logo_url} alt={`${client?.name} logo`} className="w-16 h-16 rounded-md object-contain bg-white border border-border p-1.5 shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
                <Trophy className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {client?.name ?? "Contest"}{campaign?.name && <> · {campaign.name}</>}
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-semibold mt-1 break-words">{contest.name}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{(contest.hashtag || "").replace(/^#/, "")}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(contest.start_date)} → {fmtDate(contest.end_date)}</span>
                {contest.prize && <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />{contest.prize}</span>}
              </div>
            </div>
          </div>
          <Badge variant={isLive ? "default" : "outline"} className={`${isLive ? "bg-success text-success-foreground hover:bg-success" : ""}`}>
            {isLive ? "Live" : (today > new Date(contest.end_date) ? "Ended" : "Scheduled")}
          </Badge>
        </div>

        {/* KPI band */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border rounded-lg overflow-hidden mb-6 border border-border">
          {[
            { label: "Contestants", value: fmt(contestants.length), icon: Users },
            { label: "Entries", value: fmt(visibleEntries.length), icon: Trophy },
            { label: "Views", value: fmt(totals.views), icon: Eye },
            { label: "Engagement", value: fmt(totals.eng), icon: Heart },
            { label: "Shares", value: fmt(totals.shares), icon: Share2 },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="bg-card p-4">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <Icon className="w-3 h-3" /> {kpi.label}
                </div>
                <div className="font-display text-2xl mt-1 tabular-nums">{kpi.value}</div>
              </div>
            );
          })}
        </div>

        {/* Leaderboard */}
        <Card className="p-5 mb-6 overflow-hidden">
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Standings</div>
            <h2 className="font-display text-2xl flex items-center gap-2"><Crown className="w-5 h-5 text-highlight" /> Leaderboard</h2>
          </div>
          {contestants.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">No approved entries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-2 pr-3">Rank</th>
                    <th className="text-left font-medium py-2 px-3">Contestant</th>
                    <th className="text-left font-medium py-2 px-3">Platform</th>
                    <th className="text-right font-medium py-2 px-3">Views</th>
                    <th className="text-right font-medium py-2 px-3">Likes</th>
                    <th className="text-right font-medium py-2 px-3">Comments</th>
                    <th className="text-right font-medium py-2 pl-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {contestants.slice(0, 50).map(({ reg, best, score }, i) => {
                    const rank = i + 1;
                    const isWinner = reg.status === "winner" || rank === 1;
                    return (
                      <tr key={reg.id} className={`border-b border-border last:border-0 ${isWinner ? "bg-accent/5" : ""}`}>
                        <td className={`py-2 pr-3 font-semibold ${rank <= 3 ? "text-accent" : "text-muted-foreground"}`}>
                          {rank === 1 ? <Crown className="w-4 h-4 inline mr-1 text-highlight" /> : null}#{rank}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium">{reg.full_name || reg.submitter_name || reg.handle || "Contestant"}</div>
                          <div className="text-xs text-muted-foreground">
                            {[reg.instagram_handle && `@${reg.instagram_handle}`, reg.tiktok_handle && `@${reg.tiktok_handle}`, reg.facebook_handle && `@${reg.facebook_handle}`].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          {best ? (
                            <a href={best.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs hover:underline">
                              <PlatformIcon p={best.platform} /> <span className="capitalize">{best.platform}</span>
                            </a>
                          ) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(Number(best?.views || 0))}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(Number(best?.likes || 0))}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(Number(best?.comments || 0))}</td>
                        <td className="py-2 pl-3 text-right tabular-nums font-semibold">{Math.round(score).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 text-[10px] text-muted-foreground">Score = shares×3 + comments×2 + likes×1, one counted video per contestant.</div>
        </Card>

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
                    <th className="text-right font-medium py-2 px-3">Entries</th>
                    <th className="text-right font-medium py-2 px-3">Views</th>
                    <th className="text-right font-medium py-2 pl-3">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {platformRows.map(([k, v]) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 capitalize inline-flex items-center gap-1.5"><PlatformIcon p={k} /> {k}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{v.posts}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(v.views)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{fmt(v.eng)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      <PublicFooter />
    </div>
  );
};

export default PublicContestReport;
