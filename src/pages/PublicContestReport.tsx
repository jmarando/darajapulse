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

const normalizedText = (v?: string | null) => (v || "").trim().toLowerCase().replace(/\s+/g, " ");
const identifiersOf = (e: any): string[] => {
  const ids: string[] = [];
  for (const h of [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle]) {
    const c = cleanH(h); if (c) ids.push(`h:${c}`);
  }
  const email = normalizedText(e.submitter_email); if (email) ids.push(`e:${email}`);
  const phone = String(e.phone || "").replace(/\D/g, ""); if (phone.length >= 7) ids.push(`p:${phone}`);
  const name = normalizedText(e.full_name || e.submitter_name);
  if (name && name.split(" ").length >= 2) ids.push(`n:${name}`);
  const ext = (e.external_registration_id || "").trim(); if (ext) ids.push(`r:${ext}`);
  return ids;
};
const groupEntriesByContestant = (rows: any[]): any[][] => {
  const parent = new Map<number, number>();
  const find = (i: number): number => { while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i)!)!); i = parent.get(i)!; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  rows.forEach((_, i) => parent.set(i, i));
  const idToIdx = new Map<string, number>();
  rows.forEach((r, i) => {
    for (const id of identifiersOf(r)) {
      if (idToIdx.has(id)) union(i, idToIdx.get(id)!);
      else idToIdx.set(id, i);
    }
  });
  const groups = new Map<number, any[]>();
  rows.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r);
  });
  return Array.from(groups.values());
};

const summarizeContestant = (rows: any[]) => {
  const reg = rows.find(r => r.source === "registration" || r.source === "csv_import" || r.source === "external_feed") || rows[0];
  const byUrl = new Map<string, any>();
  for (const row of rows) {
    const candidates = [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])];
    for (const post of candidates) {
      const k = canonicalPostUrl(post?.post_url);
      if (!k) continue;
      const prev = byUrl.get(k);
      if (!prev || scoreOf(post) > scoreOf(prev)) byUrl.set(k, post);
    }
  }
  const allPosts = Array.from(byUrl.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
  // Only the best-performing post per platform counts. Cross-platform
  // crossposts (TikTok + Instagram + Facebook) still sum together.
  const bestPerPlatform = new Map<string, any>();
  for (const p of allPosts) {
    const plat = String(p.platform || "other").toLowerCase();
    const prev = bestPerPlatform.get(plat);
    if (!prev || scoreOf(p) > scoreOf(prev)) bestPerPlatform.set(plat, p);
  }
  const posts = Array.from(bestPerPlatform.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
  const total = posts.reduce((s, p) => s + scoreOf(p), 0);
  const leader = reg ?? rows[0];
  return {
    ...leader,
    full_name: rows.map(r => r.full_name).find(Boolean) || rows.map(r => r.submitter_name).find(Boolean) || leader.full_name,
    instagram_handle: rows.map(r => r.instagram_handle).find(Boolean) || leader.instagram_handle,
    tiktok_handle: rows.map(r => r.tiktok_handle).find(Boolean) || leader.tiktok_handle,
    facebook_handle: rows.map(r => r.facebook_handle).find(Boolean) || leader.facebook_handle,
    _posts: posts,
    _allPosts: allPosts,
    score: total,
    views: posts.reduce((s, p) => s + Number(p.views || 0), 0),
    likes: posts.reduce((s, p) => s + Number(p.likes || 0), 0),
    comments: posts.reduce((s, p) => s + Number(p.comments || 0), 0),
    shares: posts.reduce((s, p) => s + Number(p.shares || 0), 0),
  };
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
      const [{ data: es }, { data: inf }, { data: excl }] = await Promise.all([
        supabase.from("contest_entries").select("*").eq("contest_id", cid),
        supabase.from("influencers").select("handle, alt_handles"),
        (supabase as any).from("contest_excluded_handles").select("handle").eq("contest_id", cid),
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
      for (const r of excl ?? []) {
        const h = cleanH((r as any).handle); if (h) s.add(h);
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

  // Group entries by contestant (union-find across handles/email/name) and sum scores across ALL posts.
  const allContestants = useMemo(() => {
    const groups = groupEntriesByContestant(visibleEntries);
    return groups.map(summarizeContestant).sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [visibleEntries]);

  // Announced winners (any grouped contestant whose rows include a status='winner').
  const winnerIds = useMemo(() => {
    const handles = new Set<string>();
    for (const e of visibleEntries) {
      if (e.status === "winner") {
        for (const h of [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle]) {
          const c = cleanH(h); if (c) handles.add(c);
        }
      }
    }
    const ids = new Set<string>();
    for (const c of allContestants) {
      const hs = [c.handle, c.instagram_handle, c.tiktok_handle, c.facebook_handle].map(cleanH).filter(Boolean) as string[];
      if (hs.some(h => handles.has(h))) ids.add(c.id);
    }
    return ids;
  }, [allContestants, visibleEntries]);

  const winners = useMemo(
    () => allContestants
      .filter((c: any) => winnerIds.has(c.id))
      .sort((a: any, b: any) => Number(a?.metadata?.placement_rank ?? 99) - Number(b?.metadata?.placement_rank ?? 99)),
    [allContestants, winnerIds]
  );
  const contestants = useMemo(() => allContestants.filter((c: any) => !winnerIds.has(c.id)), [allContestants, winnerIds]);

  // Totals across all unique counted posts (deduped by URL).
  const { totals, platformRows, totalPosts } = useMemo(() => {
    let views = 0, likes = 0, comments = 0, shares = 0, postCount = 0;
    const map = new Map<string, { posts: number; views: number; eng: number }>();
    for (const c of contestants) {
      const posts: any[] = Array.isArray((c as any)._posts) ? (c as any)._posts : [];
      for (const p of posts) {
        postCount += 1;
        views += Number(p.views || 0);
        likes += Number(p.likes || 0);
        comments += Number(p.comments || 0);
        shares += Number(p.shares || 0);
        const k = String(p.platform || "other").toLowerCase();
        const cur = map.get(k) ?? { posts: 0, views: 0, eng: 0 };
        cur.posts += 1;
        cur.views += Number(p.views || 0);
        cur.eng += Number(p.likes || 0) + Number(p.comments || 0) + Number(p.shares || 0);
        map.set(k, cur);
      }
    }
    return {
      totals: { views, likes, comments, shares, eng: likes + comments + shares },
      platformRows: Array.from(map.entries()).sort((a, b) => b[1].views - a[1].views),
      totalPosts: postCount,
    };
  }, [contestants]);

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
            { label: "Entries", value: fmt(totalPosts), icon: Trophy },
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

        {/* Announced winners — grouped by week/round */}
        {winners.length > 0 && (() => {
          const byRound = new Map<string, any[]>();
          for (const w of winners) {
            const r = w?.metadata?.round ?? "—";
            const k = String(r);
            if (!byRound.has(k)) byRound.set(k, []);
            byRound.get(k)!.push(w);
          }
          const rounds = Array.from(byRound.entries()).sort((a, b) => {
            const na = Number(a[0]); const nb = Number(b[0]);
            if (isNaN(na) && isNaN(nb)) return 0;
            if (isNaN(na)) return 1;
            if (isNaN(nb)) return -1;
            return nb - na; // most recent week first
          });
          return (
            <Card className="p-5 mb-6 overflow-hidden border-highlight/40 bg-highlight/5">
              <div className="mb-4 flex items-center gap-2">
                <Crown className="w-4 h-4 text-highlight" />
                <div className="text-[10px] uppercase tracking-widest text-highlight font-semibold">Announced winners</div>
                <span className="text-xs text-muted-foreground">· removed from the running</span>
              </div>
              <div className="space-y-5">
                {rounds.map(([round, list]) => (
                  <div key={round}>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                      {round === "—" ? "Earlier rounds" : `Week ${round}`}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {list
                        .sort((a, b) => Number(a?.metadata?.placement_rank ?? 99) - Number(b?.metadata?.placement_rank ?? 99))
                        .map((w: any) => {
                          const placement = w?.metadata?.placement || "Winner";
                          const prize = w?.metadata?.prize;
                          return (
                            <div key={w.id} className="rounded-md border border-border bg-card p-3">
                              <div className="text-[10px] uppercase tracking-widest text-highlight font-semibold">{placement}</div>
                              <div className="font-medium mt-1">{w.full_name || w.handle || "Winner"}</div>
                              <div className="text-xs text-muted-foreground">@{w.handle || w.instagram_handle || w.tiktok_handle || w.facebook_handle}</div>
                              {prize && <div className="text-xs text-muted-foreground mt-1">🎁 {prize}</div>}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

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
                  {contestants.map((c: any, i: number) => {
                    const rank = i + 1;
                    const isWinner = c.status === "winner" || rank === 1;
                    const posts: any[] = Array.isArray(c._posts) ? c._posts : [];
                    return (
                      <Fragment key={c.id}>
                        <tr className={`border-b border-border ${isWinner ? "bg-accent/5" : ""}`}>
                          <td className={`py-2 pr-3 font-semibold align-top ${rank <= 3 ? "text-accent" : "text-muted-foreground"}`}>
                            {rank === 1 ? <Crown className="w-4 h-4 inline mr-1 text-highlight" /> : null}#{rank}
                          </td>
                          <td className="py-2 px-3 align-top">
                            <div className="font-medium">{c.full_name || c.submitter_name || c.handle || "Contestant"}</div>
                            <div className="text-xs text-muted-foreground">
                              {[c.instagram_handle && `@${c.instagram_handle}`, c.tiktok_handle && `@${c.tiktok_handle}`, c.facebook_handle && `@${c.facebook_handle}`].filter(Boolean).join(" · ")}
                            </div>
                            {posts.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">{posts.length} post{posts.length === 1 ? "" : "s"} summed</div>}
                          </td>
                          <td className="py-2 px-3 align-top text-muted-foreground font-medium">Total</td>
                          <td className="py-2 px-3 text-right tabular-nums align-top font-semibold">{fmt(Number(c.views || 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums align-top font-semibold">{fmt(Number(c.likes || 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums align-top font-semibold">{fmt(Number(c.comments || 0))}</td>
                          <td className="py-2 pl-3 text-right tabular-nums font-semibold align-top">{Math.round(c.score || 0).toLocaleString()}</td>
                        </tr>
                        {posts.length > 1 && posts.map((p: any, pi: number) => {
                          const url = (p.post_url || "").trim();
                          const ok = /^https?:\/\//i.test(url);
                          const plat = String(p.platform || "other").toLowerCase();
                          return (
                            <tr key={`${c.id}-${p.id ?? pi}`} className="bg-secondary/20 text-xs text-muted-foreground">
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 px-3 pl-6 italic">↳ post {pi + 1}</td>
                              <td className="py-1 px-3">
                                {ok ? (
                                  <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 capitalize hover:text-accent hover:underline">
                                    <PlatformIcon p={plat} /> {plat}
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 capitalize"><PlatformIcon p={plat} /> {plat}</span>
                                )}
                              </td>
                              <td className="py-1 px-3 text-right tabular-nums">{fmt(Number(p.views || 0))}</td>
                              <td className="py-1 px-3 text-right tabular-nums">{fmt(Number(p.likes || 0))}</td>
                              <td className="py-1 px-3 text-right tabular-nums">{fmt(Number(p.comments || 0))}</td>
                              <td className="py-1 pl-3 text-right tabular-nums">{Math.round(scoreOf(p)).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 text-[10px] text-muted-foreground">Score = views×1 + likes×1 + comments×2 + shares×3, summed across every platform each contestant entered.</div>
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
