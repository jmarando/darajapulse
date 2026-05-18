import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Link2, Copy, ExternalLink, RefreshCw, Eye, Heart, MessageCircle, Share2, Users, Hash, Wallet, Mail, MessageSquare, Pencil, Check, MoreHorizontal, Send, X, Bookmark, Radio, BarChart3, Trophy, Music2, Sparkles, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PostEmbed } from "@/components/PostEmbed";
import { PostThumb } from "@/components/PostThumb";
import { PostMetricsEditor } from "@/components/PostMetricsEditor";
import { PlatformPicker } from "@/components/PlatformPicker";
import { ContestsSection } from "./ContestsSection";
import { ResponsiveContainer, AreaChart, Area, Tooltip, XAxis, YAxis } from "recharts";
import { AgencyTeamPicker } from "@/components/AgencyTeamPicker";
import { DeliverablesEditor, breakdownTotal, breakdownSummary, normalizeBreakdown, type Breakdown } from "@/components/DeliverablesEditor";
import { computeEmv, EMV_DISCLAIMER } from "@/lib/emv";
import { buildPeakMetricsByPost, buildWindowMetricsByPost, fetchAllPostMetrics } from "@/lib/metrics";


const CampaignDetail = () => {
  const { id } = useParams();
  const [c, setC] = useState<any>(null);
  const [rosterAll, setRosterAll] = useState<any[]>([]);
  const [ci, setCi] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [contestEntries, setContestEntries] = useState<any[]>([]);
  const [link, setLink] = useState<any>(null);
  const [planLink, setPlanLink] = useState<any>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [post, setPost] = useState<any>({ influencer_id: "", platform: "tiktok", post_url: "", caption: "" });
  const [rosterOpen, setRosterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [rosterSearch, setRosterSearch] = useState("");
  const [newInfl, setNewInfl] = useState<any>({ full_name: "", handle: "", primary_platform: "tiktok", niche: "", follower_count: 0 });
  const [addFee, setAddFee] = useState<string>("");
  const [addBreakdown, setAddBreakdown] = useState<Breakdown>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFee, setEditFee] = useState<string>("");
  const [editBreakdown, setEditBreakdown] = useState<Breakdown>({});
  const [selectedCi, setSelectedCi] = useState<any>(null);
  const [learnings, setLearnings] = useState<string>("");
  const [savingLearnings, setSavingLearnings] = useState(false);
  const [generatingLearnings, setGeneratingLearnings] = useState(false);
  const [metric, setMetric] = useState<"views"|"reach"|"likes"|"comments"|"shares"|"saves"|"engagement"|"emv">("views");
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
  const [briefTemplates, setBriefTemplates] = useState<any[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  // When a campaign has no creator roster but does have contest activity, treat it as contest-only:
  // default the active tab to "contests" and adapt hero KPIs / hide the empty creators tab.
  const isContestOnly = ci.length === 0 && contestEntries.length > 0;
  const activeTab = searchParams.get("tab") || (isContestOnly ? "contests" : "overview");
  const setActiveTab = (v: string) => setSearchParams((sp) => { sp.set("tab", v); return sp; }, { replace: true });

  const generateLearnings = async () => {
    setGeneratingLearnings(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-learnings", { body: { campaign_id: id } });
      if (error) { toast.error(error.message); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.learnings) { setLearnings(data.learnings); toast.success("Draft generated — review and Save"); }
    } finally {
      setGeneratingLearnings(false);
    }
  };

  const load = async () => {
    const { data: c1 } = await supabase.from("campaigns").select("*, clients(name, slug, logo_url), brief_templates:brief_template_id(*)").eq("id", id).single();
    setC(c1);
    setLearnings(c1?.learnings ?? "");
    if (c1?.client_id) {
      const { data: tpls } = await supabase.from("brief_templates").select("id,name").eq("client_id", c1.client_id).order("created_at", { ascending: false });
      setBriefTemplates(tpls ?? []);
    }
    const { data: ciAll } = await supabase.from("campaign_influencers").select("*, influencers(*)").eq("campaign_id", id);
    setCi(ciAll ?? []);
    const { data: r } = await supabase.from("influencers").select("*");
    setRosterAll(r ?? []);
    const { data: p } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", id);
    setPosts(p ?? []);
    const postIds = (p ?? []).map((x: any) => x.id);
    if (postIds.length) {
      try {
        setMetrics(await fetchAllPostMetrics(supabase, postIds));
      } catch (error: any) {
        toast.error(error.message || "Could not load metrics");
        setMetrics([]);
      }
    } else setMetrics([]);
    const { data: l } = await supabase.from("report_links").select("*").eq("campaign_id", id).maybeSingle();
    setLink(l);
    const { data: pl } = await supabase.from("plan_links").select("*").eq("campaign_id", id).maybeSingle();
    setPlanLink(pl);
    const { data: contests } = await supabase.from("contests").select("id").eq("campaign_id", id);
    const contestIds = (contests ?? []).map((x: any) => x.id);
    if (contestIds.length) {
      const { data: ce } = await supabase.from("contest_entries").select("views,likes,comments,shares,saves").in("contest_id", contestIds);
      setContestEntries(ce ?? []);
    } else setContestEntries([]);
  };
  useEffect(() => { load(); }, [id]);

  const addInfl = async (influencer_id?: string) => {
    const inflId = influencer_id ?? picked?.id;
    if (!inflId) return;
    const fee = Number(addFee) || 0;
    const total = breakdownTotal(addBreakdown);
    const deliv = total > 0 ? total : 1;
    const { error } = await supabase.from("campaign_influencers").insert({ campaign_id: id, influencer_id: inflId, fee_kes: fee, deliverables_count: deliv, deliverables_breakdown: addBreakdown as any });
    if (error) return toast.error(error.message);
    toast.success("Added"); setAddFee(""); setAddBreakdown({}); setPicked(null); setRosterOpen(false); load();
  };

  const updateCi = async (ciId: string, patch: any) => {
    const { error } = await supabase.from("campaign_influencers").update(patch).eq("id", ciId);
    if (error) return toast.error(error.message);
    load();
  };

  const saveEdit = async (ciId: string) => {
    const total = breakdownTotal(editBreakdown);
    await updateCi(ciId, { fee_kes: Number(editFee) || 0, deliverables_count: total > 0 ? total : 1, deliverables_breakdown: editBreakdown as any });
    setEditingId(null);
  };

  const createAndAddInfl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInfl.full_name || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from("influencers").insert({
        ...newInfl,
        follower_count: Number(newInfl.follower_count) || 0,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("Influencer created — now set fee & deliverables");
      setNewInfl({ full_name: "", handle: "", primary_platform: "tiktok", niche: "", follower_count: 0 });
      setPicked(data);
      setCreating(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const addPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("posts").insert({ ...post, campaign_id: id, status: "live", posted_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Post added"); setPostOpen(false); setPost({ influencer_id: "", platform: "tiktok", post_url: "", caption: "" }); load();
  };

  const deletePost = async (postRow: any) => {
    const label = postRow.influencers?.full_name || postRow.post_url || "this post";
    if (!confirm(`Delete ${label}'s content from this campaign? Metrics for this post will also be removed.`)) return;
    const { error } = await supabase.from("posts").delete().eq("id", postRow.id);
    if (error) return toast.error(error.message);
    toast.success("Post deleted");
    setPreviewPost((current: any) => current?.id === postRow.id ? null : current);
    load();
  };

  const saveMetrics = async (postId: string, fields: { views: number; likes: number; comments: number; shares: number; saves?: number; reach?: number }) => {
    const { error } = await supabase.from("post_metrics").insert({ post_id: postId, ...fields });
    if (error) return toast.error(error.message);
    toast.success("Metrics saved");
    load();
  };

  const autoFetchPost = async (postId: string) => {
    toast.loading("Fetching public stats…", { id: `pf-${postId}` });
    const { data, error } = await supabase.functions.invoke("fetch-public-metrics", { body: { post_id: postId } });
    if (error) return toast.error(error.message, { id: `pf-${postId}` });
    const r = data?.results?.[0];
    if (r?.ok) toast.success("Stats fetched", { id: `pf-${postId}` });
    else toast.error(r?.error || "Could not fetch — enter manually", { id: `pf-${postId}` });
    load();
  };

  const autoFetchAll = async () => {
    toast.loading("Auto-fetching all posts…", { id: "pf-all" });
    const { data, error } = await supabase.functions.invoke("fetch-public-metrics", { body: { campaign_id: id } });
    if (error) return toast.error(error.message, { id: "pf-all" });
    toast.success(`Fetched ${data?.ok ?? 0} of ${data?.total ?? 0} posts`, { id: "pf-all" });
    load();
  };

  const generateLink = async () => {
    const { error } = await supabase.from("report_links").insert({ campaign_id: id });
    if (error) return toast.error(error.message);
    load();
  };

  const generatePlanLink = async () => {
    const { error } = await supabase.from("plan_links").insert({ campaign_id: id });
    if (error) return toast.error(error.message);
    toast.success("Plan link generated");
    load();
  };

  const revokePlanLink = async () => {
    if (!planLink) return;
    if (!confirm("Revoke this plan link? The shared URL will stop working.")) return;
    const { error } = await supabase.from("plan_links").update({ is_active: false }).eq("id", planLink.id);
    if (error) return toast.error(error.message);
    toast.success("Plan link revoked");
    load();
  };

  const setStatus = async (status: string) => {
    await supabase.from("campaigns").update({ status: status as any }).eq("id", id);
    load();
  };

  const saveLearnings = async () => {
    setSavingLearnings(true);
    const { error } = await supabase.from("campaigns").update({ learnings }).eq("id", id);
    setSavingLearnings(false);
    if (error) return toast.error(error.message);
    toast.success("Learnings saved");
  };

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Filter metrics by selected date range (captured_at), using window deltas
  // because social metrics are cumulative — a sum of lifetime peaks would not
  // change as the user moves the date range around.
  const { fromMs, toMs, hasRange } = useMemo(() => {
    const f = dateRange?.from ? +new Date(new Date(dateRange.from).setHours(0,0,0,0)) : -Infinity;
    const t = dateRange?.to ? +new Date(new Date(dateRange.to).setHours(23,59,59,999)) : Infinity;
    return { fromMs: f, toMs: t, hasRange: !!(dateRange?.from || dateRange?.to) };
  }, [dateRange]);

  const latestByPost = useMemo(() => {
    return hasRange
      ? buildWindowMetricsByPost(metrics, fromMs, toMs)
      : buildPeakMetricsByPost(metrics);
  }, [metrics, hasRange, fromMs, toMs]);

  const totals = useMemo(() => {
    let views = 0, likes = 0, comments = 0, shares = 0, saves = 0, reach = 0, impressions = 0;
    if (contestEntries.length > 0) {
      // Contest-driven campaign: use contest entry metrics as the source of truth.
      for (const e of contestEntries) {
        views += Number(e.views || 0);
        likes += Number(e.likes || 0);
        comments += Number(e.comments || 0);
        shares += Number(e.shares || 0);
        saves += Number(e.saves || 0);
      }
    } else {
      for (const m of latestByPost.values()) {
        views += Number(m.views || 0);
        likes += Number(m.likes || 0);
        comments += Number(m.comments || 0);
        shares += Number(m.shares || 0);
        saves += Number(m.saves || 0);
        reach += Number(m.reach || 0);
        impressions += Number(m.impressions || 0);
      }
    }
    const er = views ? ((likes + comments + shares + saves) / views) * 100 : 0;
    const emv = computeEmv(views, impressions);
    return { views, likes, comments, shares, saves, reach, impressions, er, emv };
  }, [latestByPost, contestEntries]);

  // Per-platform breakdown (mirrors public report)
  const platformRows = useMemo(() => {
    const map = new Map<string, { posts: number; creators: Set<string>; views: number; reach: number; followers: number }>();
    for (const p of posts) {
      const m = latestByPost.get(p.id);
      const key = (p.platform as string) || "other";
      const cur = map.get(key) ?? { posts: 0, creators: new Set<string>(), views: 0, reach: 0, followers: 0 };
      cur.posts += 1;
      if (p.influencer_id) cur.creators.add(p.influencer_id);
      cur.views += Number(m?.views || 0);
      cur.reach += Number(m?.reach || 0);
      map.set(key, cur);
    }
    for (const x of ci) {
      const plat = (x.influencers?.primary_platform as string) || "other";
      const cur = map.get(plat);
      if (cur) cur.followers += Number(x.influencers?.follower_count || 0);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].views - a[1].views);
  }, [posts, latestByPost, ci]);

  // Audience demographics (mirrors public report)
  const audience = useMemo(() => {
    const totalFollowers = ci.reduce((a, x) => a + Number(x.influencers?.follower_count || 0), 0);
    const weightedKE = totalFollowers > 0
      ? ci.reduce((a, x) => a + Number(x.influencers?.follower_count || 0) * Number(x.influencers?.audience_kenya_pct || 0), 0) / totalFollowers
      : 0;
    const langs = new Set<string>();
    ci.forEach(x => (x.influencers?.languages || []).forEach((l: string) => langs.add(l)));

    // Weighted age/gender/cities by follower count
    const weight = (key: string, sub: string) => {
      if (totalFollowers === 0) return 0;
      let acc = 0;
      ci.forEach(x => {
        const f = Number(x.influencers?.follower_count || 0);
        const v = Number(x.influencers?.[key]?.[sub] || 0);
        acc += f * v;
      });
      return acc / totalFollowers;
    };
    const ageBuckets = ["13-17","18-24","25-34","35-44","45-54","55+"];
    const ages = ageBuckets.map(b => ({ bucket: b, pct: weight("audience_age_breakdown", b) }));
    const genders = ["female","male","other"].map(g => ({ gender: g, pct: weight("audience_gender_breakdown", g) }));

    const cityMap = new Map<string, number>();
    ci.forEach(x => {
      const f = Number(x.influencers?.follower_count || 0);
      const list = (x.influencers?.audience_top_cities || []) as Array<{city:string; pct:number}>;
      list.forEach(({ city, pct }) => {
        cityMap.set(city, (cityMap.get(city) || 0) + (totalFollowers > 0 ? (f * Number(pct||0)) / totalFollowers : 0));
      });
    });
    const cities = Array.from(cityMap.entries()).map(([city, pct]) => ({ city, pct })).sort((a,b)=>b.pct-a.pct).slice(0,6);

    return { totalFollowers, weightedKE, diaspora: 100 - weightedKE, langs, ages, genders, cities };
  }, [ci]);

  // Per-influencer aggregated metrics
  const byInfluencer = useMemo(() => {
    const map = new Map<string, { views: number; likes: number; comments: number; shares: number; saves: number; posts: number }>();
    for (const p of posts) {
      const m = latestByPost.get(p.id);
      if (!m) continue;
      const key = p.influencer_id;
      const cur = map.get(key) ?? { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, posts: 0 };
      cur.views += Number(m.views || 0);
      cur.likes += Number(m.likes || 0);
      cur.comments += Number(m.comments || 0);
      cur.shares += Number(m.shares || 0);
      cur.saves += Number(m.saves || 0);
      cur.posts += 1;
      map.set(key, cur);
    }
    return map;
  }, [posts, latestByPost]);

  const topPerformer = useMemo(() => {
    let best: { ci: any; views: number } | null = null;
    for (const x of ci) {
      const s = byInfluencer.get(x.influencer_id);
      if (!s) continue;
      if (!best || s.views > best.views) best = { ci: x, views: s.views };
    }
    return best;
  }, [ci, byInfluencer]);

  const rosterTotals = useMemo(() => {
    const fees = ci.reduce((a, x) => a + Number(x.fee_kes || 0), 0);
    const deliv = ci.reduce((a, x) => a + Number(x.deliverables_count || 0), 0);
    const confirmed = ci.filter(x => ["confirmed","live","completed"].includes(x.status)).length;
    return { fees, deliv, confirmed };
  }, [ci]);

  const metricLabel: Record<string,string> = { views: "Views", reach: "Reach", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", engagement: "Engagement", emv: "Earned Media (KES)" };
  const valOf = (m: any) => {
    if (metric === "engagement") return (m.likes||0)+(m.comments||0)+(m.shares||0)+(m.saves||0);
    if (metric === "emv") return computeEmv(Number(m.views || 0), Number(m.impressions || 0));
    return Number((m as any)[metric] || 0);
  };
  const trend = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => +new Date(a.captured_at) - +new Date(b.captured_at));
    if (sorted.length === 0) return [];

    // Determine x-axis bounds:
    // - If user picked a range, use it.
    // - Else span from earliest signal (first post posted_at OR first metric captured_at) to now.
    const postedTimes = (posts || []).map((p: any) => p.posted_at ? +new Date(p.posted_at) : null).filter((x): x is number => !!x);
    const firstCapture = +new Date(sorted[0].captured_at);
    const lastCapture = +new Date(sorted[sorted.length - 1].captured_at);
    const naturalMin = Math.min(firstCapture, ...(postedTimes.length ? postedTimes : [firstCapture]));
    const naturalMax = Math.max(lastCapture, Date.now());

    const minDay = dateRange?.from ? +new Date(new Date(dateRange.from).setHours(0,0,0,0)) : new Date(naturalMin).setHours(0,0,0,0);
    const maxDay = dateRange?.to ? +new Date(new Date(dateRange.to).setHours(23,59,59,999)) : new Date(naturalMax).setHours(23,59,59,999);

    const dayMs = 86400000;
    const totalDays = Math.max(1, Math.ceil((maxDay - minDay) / dayMs));
    // Bucket by day if range <= 60 days, else aggregate to ~30 buckets.
    const N = totalDays <= 1 ? 8 : Math.min(totalDays, 30);
    const span = Math.max(maxDay - minDay, 1);

    // Group all metric rows by post for fast lookup.
    const byPost = new Map<string, any[]>();
    for (const m of sorted) {
      const arr = byPost.get(m.post_id) || [];
      arr.push(m);
      byPost.set(m.post_id, arr);
    }

    const points: { d: string; v: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = minDay + (span * (i + 1)) / N; // end of bucket
      let total = 0;
      for (const [postId, arr] of byPost.entries()) {
        const pointMetrics = hasRange
          ? buildWindowMetricsByPost(arr, minDay, t).get(postId)
          : buildPeakMetricsByPost(arr.filter((m) => +new Date(m.captured_at) <= t)).get(postId);
        if (pointMetrics) total += valOf(pointMetrics);
      }
      const date = new Date(t);
      const label = totalDays <= 1
        ? `${date.getHours().toString().padStart(2,'0')}:00`
        : `${date.getMonth()+1}/${date.getDate()}`;
      points.push({ d: label, v: total });
    }
    return points;
  }, [metrics, posts, dateRange, metric, hasRange]);

  if (!c) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const slugPath = c.clients?.slug && c.slug ? `/${c.clients.slug}/${c.slug}` : "";
  const reportUrl = link ? `${window.location.origin}${slugPath}/report/${link.token}` : "";
  const planUrl = planLink && planLink.is_active ? `${window.location.origin}${slugPath}/plan/${planLink.token}` : "";
  const fmt = (n: number) => {
    if (!isFinite(n)) return "—";
    if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
    return `${Math.round(n)}`;
  };
  const fmtKes = (n: number) => n >= 1e6 ? `KES ${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `KES ${(n/1e3).toFixed(0)}K` : `KES ${Math.round(n).toLocaleString()}`;

  const statusTone: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-border",
    pitched: "bg-secondary text-foreground border-border",
    won: "bg-success/15 text-success border-success/30",
    live: "bg-accent text-accent-foreground border-accent",
    reporting: "bg-highlight/20 text-foreground border-highlight/40",
    closed: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to="/app/campaigns" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" /> All campaigns
      </Link>

      {/* Hero */}
      <div className="mb-8">
        <div className="flex justify-between items-start gap-6">
          <div className="min-w-0 flex-1 flex items-start gap-4">
            {c.clients?.logo_url ? (
              <img src={c.clients.logo_url} alt={`${c.clients?.name} logo`} className="w-14 h-14 rounded-md object-contain bg-white border border-border p-1 shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-md bg-secondary border border-border flex items-center justify-center font-display text-lg shrink-0">
                {c.clients?.name?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.clients?.name}</div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold mt-1 break-words">{c.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-muted-foreground">
              {(c.hashtag || c.brief_templates?.hashtag) && <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{(c.hashtag || c.brief_templates?.hashtag).replace(/^#/, "")}</span>}
              {c.budget_kes > 0 && <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />Budget KES {Number(c.budget_kes).toLocaleString()}</span>}
              <span className="inline-flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest">Brief</span>
                <Select
                  value={c.brief_template_id ?? "__none__"}
                  onValueChange={async (v) => {
                    const newVal = v === "__none__" ? null : v;
                    const { error } = await supabase.from("campaigns").update({ brief_template_id: newVal }).eq("id", c.id);
                    if (error) return toast.error(error.message);
                    toast.success(newVal ? "Brief linked" : "Brief unlinked");
                    load();
                  }}
                >
                  <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue placeholder="No brief linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No brief linked</SelectItem>
                    {briefTemplates.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Link to="/app/briefs" className="inline-flex items-center gap-1 hover:text-foreground" title="Manage briefs"><ExternalLink className="w-3 h-3" /></Link>
              </span>
            </div>
            {(c.brief_templates?.objective || c.brief || c.brief_templates?.brief) && (
              <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed line-clamp-2">
                {c.brief_templates?.objective || c.brief || c.brief_templates?.brief}
              </p>
            )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={c.status} onValueChange={setStatus}>
              <SelectTrigger className={`w-36 capitalize border ${statusTone[c.status] ?? ""}`}><SelectValue /></SelectTrigger>
              <SelectContent>{["draft","pitched","won","live","reporting","closed"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-primary"><Send className="w-4 h-4 mr-2" /> Share</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Plan link · pre-launch</DropdownMenuLabel>
                {planUrl ? (
                  <>
                    <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(planUrl); toast.success("Plan link copied"); }}><Copy className="w-4 h-4 mr-2" /> Copy plan link</DropdownMenuItem>
                    <DropdownMenuItem asChild><a href={planUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> Open plan</a></DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={generatePlanLink}><Link2 className="w-4 h-4 mr-2" /> Generate plan link</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Live report</DropdownMenuLabel>
                {link ? (
                  <>
                    <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(reportUrl); toast.success("Report link copied"); }}><Copy className="w-4 h-4 mr-2" /> Copy report link</DropdownMenuItem>
                    <DropdownMenuItem asChild><a href={reportUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> Open report</a></DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={generateLink}><Link2 className="w-4 h-4 mr-2" /> Generate report link</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setActiveTab("share")}><Sparkles className="w-4 h-4 mr-2" /> Manage sharing</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 4 hero KPIs — swap creator/fee tiles for contest stats on contest-only campaigns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden mt-6 border border-border">
          {(isContestOnly
            ? [
                { l: "Views", v: fmt(totals.views), icon: Eye, sub: `${contestEntries.length} entr${contestEntries.length === 1 ? "y" : "ies"}` },
                { l: "Engagement", v: `${totals.er.toFixed(1)}%`, icon: BarChart3, sub: `${fmt(totals.likes + totals.comments + totals.shares + totals.saves)} interactions` },
                { l: "Entries", v: fmt(contestEntries.length), icon: Trophy, sub: "contest submissions" },
                { l: "Top engagement", v: fmt(totals.likes + totals.comments + totals.shares + totals.saves), icon: Heart, sub: "likes + comments + shares" },
              ]
            : [
                { l: "Views", v: fmt(totals.views), icon: Eye, sub: `${posts.length} post${posts.length === 1 ? "" : "s"}` },
                { l: "Engagement", v: `${totals.er.toFixed(1)}%`, icon: BarChart3, sub: `${fmt(totals.likes + totals.comments + totals.shares + totals.saves)} interactions` },
                { l: "Creators", v: `${rosterTotals.confirmed}/${ci.length}`, icon: Users, sub: "confirmed" },
                { l: "Fees committed", v: rosterTotals.fees > 0 ? fmtKes(rosterTotals.fees) : "—", icon: Wallet, sub: `${rosterTotals.deliv} deliverable${rosterTotals.deliv === 1 ? "" : "s"}` },
              ]
          ).map((s, i) => (
            <div key={i} className="bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                <s.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="font-display text-2xl mt-2">{s.v}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {!isContestOnly && (
            <TabsTrigger value="creators">Creators &amp; content<span className="ml-1.5 text-xs opacity-60">{ci.length}</span></TabsTrigger>
          )}
          <TabsTrigger value="contests">Contests</TabsTrigger>
          <TabsTrigger value="share">Share &amp; wrap</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">

      {/* Reporting window */}
      {(() => {
        const today = new Date();
        const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
        const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
        const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
        // Week starts Monday
        const startOfWeek = (d: Date) => { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; return addDays(x, -day); };
        const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
        const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const presets: { label: string; range: DateRange }[] = [
          { label: "This week", range: { from: startOfWeek(today), to: endOfDay(today) } },
          { label: "Last 7 days", range: { from: startOfDay(addDays(today, -6)), to: endOfDay(today) } },
          { label: "Last 14 days", range: { from: startOfDay(addDays(today, -13)), to: endOfDay(today) } },
          { label: "This month", range: { from: startOfMonth(today), to: endOfDay(today) } },
          { label: "Last month", range: { from: startOfMonth(addDays(startOfMonth(today), -1)), to: endOfMonth(addDays(startOfMonth(today), -1)) } },
        ];
        const sameDay = (a?: Date, b?: Date) => a && b && +startOfDay(a) === +startOfDay(b);
        const activePreset = presets.find(p => sameDay(p.range.from, dateRange?.from) && sameDay(p.range.to, dateRange?.to));
        return (
          <Card className="p-4 flex flex-wrap items-center gap-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mr-2">Reporting window</div>
            <Button size="sm" variant={!dateRange?.from ? "default" : "outline"} onClick={() => setDateRange(undefined)}>All time</Button>
            {presets.map(p => (
              <Button key={p.label} size="sm" variant={activePreset?.label === p.label ? "default" : "outline"} onClick={() => setDateRange(p.range)}>{p.label}</Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className={cn("ml-auto", !activePreset && dateRange?.from && "border-accent")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateRange?.from ? (
                    dateRange.to ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}` : format(dateRange.from, "MMM d, yyyy")
                  ) : "Custom range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </Card>
        );
      })()}


      {/* Performance band */}
      {(() => {
        const tiles = [
          { key: "views", label: "Views", value: fmt(totals.views), icon: Eye, raw: totals.views, available: true },
          { key: "likes", label: "Likes", value: fmt(totals.likes), icon: Heart, raw: totals.likes, available: true },
          { key: "comments", label: "Comments", value: fmt(totals.comments), icon: MessageCircle, raw: totals.comments, available: true },
          { key: "engagement", label: "Engagement", value: `${totals.er.toFixed(1)}%`, icon: BarChart3, raw: totals.er, available: true },
          { key: "shares", label: "Shares", value: fmt(totals.shares), icon: Share2, raw: totals.shares, available: totals.shares > 0 },
          { key: "saves", label: "Saves", value: fmt(totals.saves), icon: Bookmark, raw: totals.saves, available: totals.saves > 0 },
          { key: "reach", label: "Reach", value: fmt(totals.reach), icon: Radio, raw: totals.reach, available: totals.reach > 0 },
          { key: "emv", label: "Earned Media", value: fmtKes(totals.emv), icon: Wallet, raw: totals.emv, available: true },
        ] as const;
        const hasUnavailable = tiles.some(t => !t.available);
        return (
          <div className="mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-border rounded-lg overflow-hidden border border-border">
              {tiles.map((s) => {
                const active = metric === s.key;
                const dim = !s.available;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setMetric(s.key as any)}
                    className={`text-left bg-card px-3 py-4 transition-colors hover:bg-secondary/40 ${active ? "outline outline-2 -outline-offset-2 outline-accent bg-secondary/30 relative z-10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 min-h-[1.25rem]">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight whitespace-normal break-words">{s.label}</div>
                      {s.icon && <s.icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-accent" : "text-muted-foreground"}`} />}
                    </div>
                    <div className={`font-display text-2xl mt-2 tabular-nums ${dim ? "text-muted-foreground/60" : ""}`}>
                      {dim ? "—" : s.value}
                    </div>
                  </button>
                );
              })}
            </div>
            {hasUnavailable && (
              <p className="text-[11px] text-muted-foreground mt-2 px-1">
                Reach, shares and saves aren't returned by Instagram's public metrics — they appear once added manually or pulled from creators' insights.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1 px-1">{EMV_DISCLAIMER}</p>
          </div>
        );
      })()}

      {/* Trend chart for selected metric */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Trend</div>
            <h2 className="font-display text-2xl mt-1">{metricLabel[metric]} over time</h2>
            <div className="text-xs text-muted-foreground mt-1">Click any metric above to switch the chart.</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateRange?.from ? (
              dateRange.to ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}` : format(dateRange.from, "MMM d, yyyy")
            ) : "All time"}
          </div>
        </div>
        {trend.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No metric history yet.</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="cdg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => fmt(Number(v))} width={50} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => fmt(Number(v))} />
                <Area type="monotone" dataKey="v" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#cdg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Top performer */}
      {topPerformer && (
        <Card className="p-5 mb-6 bg-gradient-ink text-primary-foreground border-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"><Trophy className="w-6 h-6" /></div>
              <div>
                <div className="text-[10px] uppercase tracking-widest opacity-70">Top performer</div>
                <div className="font-display text-2xl mt-0.5">{topPerformer.ci.influencers?.full_name}</div>
                <div className="text-sm opacity-80">@{topPerformer.ci.influencers?.handle?.replace(/^@/, "")} · {byInfluencer.get(topPerformer.ci.influencer_id)?.posts} post{byInfluencer.get(topPerformer.ci.influencer_id)?.posts === 1 ? "" : "s"}</div>
              </div>
            </div>
            <div className="flex gap-6 text-right">
              <div><div className="font-display text-3xl">{fmt(topPerformer.views)}</div><div className="text-[10px] uppercase tracking-widest opacity-70">Views</div></div>
              <div><div className="font-display text-3xl">{fmt(byInfluencer.get(topPerformer.ci.influencer_id)?.likes ?? 0)}</div><div className="text-[10px] uppercase tracking-widest opacity-70">Likes</div></div>
            </div>
          </div>
        </Card>
      )}

      {/* Channel mix */}
      {platformRows.length > 0 && (
        <Card className="p-5 mb-6">
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

      {/* Audience demographics */}
      {ci.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Audience</div>
          <h2 className="font-display text-2xl mt-1 mb-4">Who we reached</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <div className="flex justify-between items-baseline text-sm mb-1.5">
                <span>Kenya</span><span className="font-display text-lg">{audience.weightedKE.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
                <div className="bg-accent h-full" style={{ width: `${audience.weightedKE}%` }} />
                <div className="bg-highlight/60 h-full" style={{ width: `${audience.diaspora}%` }} />
              </div>
              <div className="flex justify-between items-baseline text-sm mt-1.5">
                <span className="text-muted-foreground">Diaspora & rest of world</span>
                <span className="text-muted-foreground">{audience.diaspora.toFixed(0)}%</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border">
                <div><div className="font-display text-2xl">{fmt(audience.totalFollowers)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Combined followers</div></div>
                <div><div className="font-display text-2xl">{ci.length}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Creators</div></div>
                <div><div className="font-display text-2xl">{audience.langs.size || 1}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Languages</div></div>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Languages</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(audience.langs).map(l => <Badge key={l} variant="outline" className="text-xs">{l}</Badge>)}
                {audience.langs.size === 0 && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          </div>

          {/* Age / Gender / Cities */}
          <div className="grid md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-border">
            {/* Age */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Age</div>
              <div className="space-y-2">
                {audience.ages.map(a => (
                  <div key={a.bucket}>
                    <div className="flex justify-between text-xs mb-1"><span>{a.bucket}</span><span className="tabular-nums text-muted-foreground">{a.pct.toFixed(0)}%</span></div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${Math.min(100, a.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gender */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Gender</div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden flex mb-3">
                <div className="bg-accent h-full" style={{ width: `${audience.genders[0]?.pct || 0}%` }} />
                <div className="bg-highlight h-full" style={{ width: `${audience.genders[1]?.pct || 0}%` }} />
                <div className="bg-muted-foreground/40 h-full" style={{ width: `${audience.genders[2]?.pct || 0}%` }} />
              </div>
              <div className="space-y-1.5">
                {audience.genders.map((g, i) => (
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

            {/* Cities */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Top cities</div>
              <div className="space-y-2">
                {audience.cities.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                {audience.cities.map(c => (
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
      )}

        </TabsContent>

        <TabsContent value="creators" className="space-y-6 mt-0">

      {/* Agency team on this campaign */}
      {c?.id && (
        <Card className="p-5 mb-6">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Agency team on this campaign</div>
          <AgencyTeamPicker scope={{ type: "campaign", campaign_id: c.id }} title="Who's running this campaign" />
        </Card>
      )}

      {/* Roster — full width table */}
      <Card className="p-0 overflow-hidden mb-6">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Roster</div>
            <h2 className="font-display text-2xl">Creators</h2>
          </div>
          <Dialog open={rosterOpen} onOpenChange={(o) => { setRosterOpen(o); if (!o) { setCreating(false); setPicked(null); setRosterSearch(""); setAddFee(""); setAddBreakdown({}); } }}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" /> Add creator</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {picked ? `Set fee for ${picked.full_name}` : creating ? "Create new influencer" : "Add creator to campaign"}
                </DialogTitle>
              </DialogHeader>

              {picked ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-md bg-secondary/50 border text-sm">
                    <div className="font-medium">{picked.full_name}</div>
                    <div className="text-xs text-muted-foreground">{picked.handle ? `@${picked.handle.replace(/^@/, "")}` : "—"} · {picked.primary_platform}</div>
                  </div>
                  <div><Label>Fee (KES)</Label><Input type="number" autoFocus value={addFee} onChange={e => setAddFee(e.target.value)} placeholder="0" /></div>
                  <div>
                    <Label>Deliverables across platforms</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Add a row per platform — one combined brief covers all of them, no separate invites.</p>
                    <div className="mt-1.5"><DeliverablesEditor value={addBreakdown} onChange={setAddBreakdown} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setPicked(null)}>Back</Button>
                    <Button type="button" className="flex-1 bg-primary" onClick={() => addInfl()}>Add to campaign</Button>
                  </div>
                </div>
              ) : creating ? (
                <form onSubmit={createAndAddInfl} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Full name</Label><Input required value={newInfl.full_name} onChange={e => setNewInfl({ ...newInfl, full_name: e.target.value })} /></div>
                    <div><Label>Handle</Label><Input value={newInfl.handle} onChange={e => setNewInfl({ ...newInfl, handle: e.target.value })} placeholder="@..." /></div>
                  </div>
                  <div>
                    <Label>Platform</Label>
                    <PlatformPicker value={newInfl.primary_platform} onChange={v => setNewInfl({ ...newInfl, primary_platform: v })} />
                  </div>
                  <div><Label>Followers</Label><Input type="number" value={newInfl.follower_count} onChange={e => setNewInfl({ ...newInfl, follower_count: e.target.value })} /></div>
                  <div><Label>Niche</Label><Input value={newInfl.niche} onChange={e => setNewInfl({ ...newInfl, niche: e.target.value })} placeholder="Food / Beauty / Comedy" /></div>
                  <div className="flex gap-2 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setCreating(false)} disabled={submitting}>Back</Button>
                    <Button type="submit" className="flex-1 bg-primary" disabled={submitting}>{submitting ? "Saving…" : "Continue"}</Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">You'll set fee & deliverables in the next step.</p>
                </form>
              ) : (
                <>
                  <Input
                    placeholder="Search your roster…"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    className="mb-2"
                  />
                  <div className="space-y-1 max-h-72 overflow-auto">
                    {rosterAll
                      .filter(r => !ci.some(x => x.influencer_id === r.id))
                      .filter(r => !rosterSearch || `${r.full_name} ${r.handle ?? ""}`.toLowerCase().includes(rosterSearch.toLowerCase()))
                      .map(r => (
                        <button key={r.id} onClick={() => { setPicked(r); setAddBreakdown({ [r.primary_platform || "tiktok"]: { video: 1 } }); }} className="w-full text-left p-3 rounded-md hover:bg-secondary flex justify-between items-center">
                          <span>{r.full_name} <span className="text-muted-foreground text-xs">· {r.primary_platform}</span></span>
                          <Plus className="w-4 h-4" />
                        </button>
                      ))}
                    {rosterAll.filter(r => !ci.some(x => x.influencer_id === r.id)).length === 0 && (
                      <p className="text-sm text-muted-foreground p-3 text-center">{rosterAll.length === 0 ? "No influencers in your roster yet." : "All your influencers are already on this campaign."}</p>
                    )}
                  </div>
                  <Button variant="outline" className="w-full mt-2" onClick={() => setCreating(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Create new influencer
                  </Button>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {ci.length === 0 ? (
          <div className="text-center py-14">
            <Users className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">No creators on this campaign yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="text-left font-medium px-5 py-3">Creator</th>
                  <th className="text-left font-medium px-3 py-3">Platform</th>
                  <th className="text-left font-medium px-3 py-3">Status</th>
                  <th className="text-right font-medium px-3 py-3">Fee (KES)</th>
                  <th className="text-right font-medium px-3 py-3">Deliverables</th>
                  <th className="text-right font-medium px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ci.map(x => {
                  const briefUrl = `${window.location.origin}${slugPath}/brief/${x.brief_token}`;
                  const statusDot: Record<string,string> = {
                    invited: "bg-muted-foreground/40",
                    negotiating: "bg-highlight",
                    confirmed: "bg-success",
                    live: "bg-accent",
                    completed: "bg-foreground",
                    declined: "bg-destructive",
                  };
                  const statusLabel: Record<string,string> = {
                    invited: "Invite sent",
                    negotiating: "Negotiating",
                    confirmed: "Confirmed",
                    live: "Live",
                    completed: "Completed",
                    declined: "Declined",
                  };
                  const isEditing = editingId === x.id;
                  const mailto = `mailto:${x.influencers?.email ?? ""}?subject=${encodeURIComponent(`${c.clients?.name} × ${c.name} — collaboration brief`)}&body=${encodeURIComponent(`Hi ${x.influencers?.full_name?.split(" ")[0] ?? ""},\n\nWe'd love to have you on this campaign. View your brief and confirm here:\n${briefUrl}\n\nThanks!`)}`;
                  const wa = x.influencers?.phone_mpesa ? `https://wa.me/${String(x.influencers.phone_mpesa).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${x.influencers?.full_name?.split(" ")[0] ?? ""}! ${c.clients?.name} × ${c.name} brief: ${briefUrl}`)}` : null;
                  return (
                    <tr key={x.id} onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return; setCreatorFilter(x.influencer_id); document.getElementById("posts-section")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={`border-b border-border last:border-0 hover:bg-secondary/40 transition-colors group cursor-pointer ${creatorFilter === x.influencer_id ? "bg-accent/10" : ""}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-display text-base shrink-0">{x.influencers?.full_name?.[0]}</div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{x.influencers?.full_name}</div>
                            {x.influencers?.handle && <div className="text-xs text-muted-foreground truncate">@{x.influencers.handle.replace(/^@/, "")}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 capitalize text-muted-foreground">{x.influencers?.primary_platform}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot[x.status] ?? "bg-muted-foreground/40"}`} />
                          {statusLabel[x.status] ?? x.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {isEditing ? (
                          <Input className="h-8 text-sm text-right" type="number" value={editFee} onChange={e => setEditFee(e.target.value)} />
                        ) : (
                          Number(x.fee_kes || 0).toLocaleString()
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums align-top">
                        {isEditing ? (
                          <div className="text-left min-w-[200px]"><DeliverablesEditor value={editBreakdown} onChange={setEditBreakdown} /></div>
                        ) : (
                          <div>
                            <div className="font-medium">{x.deliverables_count}</div>
                            {breakdownSummary(x.deliverables_breakdown) && (
                              <div className="text-[10px] text-muted-foreground">{breakdownSummary(x.deliverables_breakdown)}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                            <Button size="icon" className="h-8 w-8 bg-primary" onClick={() => saveEdit(x.id)}><Check className="w-4 h-4" /></Button>
                          </div>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Send invite</DropdownMenuLabel>
                              <DropdownMenuItem asChild><a href={mailto}><Mail className="w-4 h-4 mr-2" /> Email brief</a></DropdownMenuItem>
                              {wa && <DropdownMenuItem asChild><a href={wa} target="_blank" rel="noreferrer"><MessageSquare className="w-4 h-4 mr-2" /> WhatsApp brief</a></DropdownMenuItem>}
                              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(briefUrl); toast.success("Brief link copied"); }}>
                                <Copy className="w-4 h-4 mr-2" /> Copy brief link
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild><a href={briefUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> Preview brief</a></DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Set status</DropdownMenuLabel>
                              {[
                                { v: "invited", l: "Invite sent" },
                                { v: "negotiating", l: "Negotiating" },
                                { v: "confirmed", l: "Confirmed" },
                                { v: "live", l: "Live" },
                                { v: "completed", l: "Completed" },
                                { v: "declined", l: "Declined" },
                              ].map(s => (
                                <DropdownMenuItem key={s.v} onClick={() => updateCi(x.id, { status: s.v })}>
                                  <span className={`w-1.5 h-1.5 rounded-full mr-2 ${statusDot[s.v]}`} /> {s.l}
                                  {x.status === s.v && <Check className="w-3 h-3 ml-auto" />}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setEditingId(x.id); setEditFee(String(x.fee_kes ?? 0)); const norm = normalizeBreakdown(x.deliverables_breakdown, x.influencers?.primary_platform || "tiktok"); setEditBreakdown(Object.keys(norm).length ? norm : { [x.influencers?.primary_platform || "tiktok"]: { video: Number(x.deliverables_count) || 1 } }); }}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit fee & posts
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Posts grid (merged from old Content tab) */}
      <Card id="posts-section" className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Activity</div>
            <h2 className="font-display text-2xl">Posts</h2>
            {creatorFilter && (() => {
              const c = ci.find(x => x.influencer_id === creatorFilter);
              return (
                <button onClick={() => setCreatorFilter(null)} className="mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-accent/15 border border-accent/30 hover:bg-accent/25">
                  Filtered: {c?.influencers?.full_name ?? "creator"}
                  <X className="w-3 h-3" />
                </button>
              );
            })()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={autoFetchAll}><Sparkles className="w-3 h-3 mr-1" /> Auto-fetch all</Button>
            <Dialog open={postOpen} onOpenChange={setPostOpen}>
              <DialogTrigger asChild><Button size="sm" className="bg-primary" disabled={ci.length === 0}><Plus className="w-3 h-3 mr-1" /> Add post</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add a published post</DialogTitle></DialogHeader>
                <form onSubmit={addPost} className="space-y-3">
                  <div>
                    <Label>Influencer</Label>
                    <Select value={post.influencer_id} onValueChange={v => setPost({ ...post, influencer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{ci.map(x => <SelectItem key={x.influencer_id} value={x.influencer_id}>{x.influencers?.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Platform</Label>
                    <PlatformPicker value={post.platform} onChange={v => setPost({ ...post, platform: v })} />
                  </div>
                  <div><Label>Post URL</Label><Input required value={post.post_url} onChange={e => setPost({ ...post, post_url: e.target.value })} /></div>
                  <div><Label>Caption</Label><Input value={post.caption} onChange={e => setPost({ ...post, caption: e.target.value })} /></div>
                  <Button type="submit" className="w-full bg-primary">Save</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {posts.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-md">
            <p className="text-sm text-muted-foreground">No posts captured yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add the first live post or refresh TikTok metrics.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {posts.filter(p => !creatorFilter || p.influencer_id === creatorFilter).map(p => {
              const m = latestByPost.get(p.id);
              const postedAt = p.posted_at ? new Date(p.posted_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
              return (
                <li key={p.id} className="rounded-lg border border-border bg-card overflow-hidden flex flex-col hover:shadow-elegant transition-shadow">
                  <button type="button" onClick={() => setPreviewPost(p)} className="block text-left">
                    <PostThumb
                      url={p.post_url}
                      platform={p.platform}
                      thumbnailUrl={p.thumbnail_url}
                      caption={p.caption}
                      handle={p.influencers?.handle || p.influencers?.full_name}
                    />
                  </button>
                  <div className="px-3 py-2 border-t border-border space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs min-w-0 truncate">
                        <span className="font-medium">{p.influencers?.full_name}</span>
                        {p.influencers?.handle && <span className="text-muted-foreground"> · @{p.influencers.handle}</span>}
                      </div>
                      <Badge variant="outline" className="capitalize text-[10px] py-0 h-5 shrink-0">{p.status}</Badge>
                    </div>
                    {p.caption && (
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">{p.caption}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      {postedAt && <span>{postedAt}</span>}
                      <div className="inline-flex items-center gap-2">
                        <button type="button" onClick={() => setPreviewPost(p)} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Eye className="w-3 h-3" /> Preview
                        </button>
                        <button type="button" onClick={() => deletePost(p)} className="inline-flex items-center gap-1 hover:text-destructive" aria-label="Delete post">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  <PostMetricsEditor
                    post={p}
                    metrics={m}
                    onSave={async (fields) => { await saveMetrics(p.id, fields); }}
                    onAutoFetch={async () => { await autoFetchPost(p.id); }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Production</div>
          <h2 className="font-display text-2xl">Content calendar</h2>
          <p className="text-xs text-muted-foreground mt-1">Plan, upload, review and approve content for this campaign — managed in the standalone Content module.</p>
        </div>
        <a href={`/app/content?campaign=${id}`} className="text-sm text-accent hover:underline">Open in Content module →</a>
      </Card>

        </TabsContent>

        <TabsContent value="contests" className="space-y-6 mt-0">
          <ContestsSection campaignId={id!} />
        </TabsContent>

        <TabsContent value="share" className="space-y-6 mt-0">

      {/* Learnings & recommendations */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Narrative</div>
            <h2 className="font-display text-2xl">Learnings & recommendations</h2>
            <p className="text-xs text-muted-foreground mt-1">Shown to the client on the live report.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={generateLearnings} disabled={generatingLearnings}>
              {generatingLearnings ? "Generating…" : "✨ Generate with AI"}
            </Button>
            <Button size="sm" onClick={saveLearnings} disabled={savingLearnings} className="bg-primary">
              {savingLearnings ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <Textarea value={learnings} onChange={e => setLearnings(e.target.value)} rows={8} placeholder="What worked, what didn't, and what to do next time. Click ✨ Generate with AI to draft from the live report data." />
      </Card>

      {/* Plan share link — for client approval before launch */}
      <Card className="p-6 mt-6">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Plan link</div>
            <div className="font-display text-xl mt-1">Share the roster with the brand</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">A view-only public page showing the brief summary and creator lineup (handle, platform, posts, fee). Send to the client for sign-off before launch.</p>
          </div>
          {planUrl ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Input readOnly value={planUrl} className="w-[22rem]" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(planUrl); toast.success("Copied"); }}><Copy className="w-4 h-4" /></Button>
              <a href={planUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="icon"><ExternalLink className="w-4 h-4" /></Button></a>
              <Button variant="ghost" size="sm" onClick={revokePlanLink}><X className="w-4 h-4 mr-1" /> Revoke</Button>
            </div>
          ) : (
            <Button onClick={generatePlanLink}><Link2 className="w-4 h-4 mr-2" /> Generate plan link</Button>
          )}
        </div>
      </Card>

      {/* Report link — moved below */}
      <Card className="p-6 mt-6 bg-gradient-ink text-primary-foreground border-0">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest opacity-70">Live client report</div>
            <div className="font-display text-2xl mt-1">Share with the brand</div>
            <p className="text-sm opacity-80 mt-1 max-w-md">A tokenized public page that updates as posts roll in. Forward internally without seats or logins.</p>
          </div>
          {link ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Input readOnly value={reportUrl} className="w-[22rem] bg-white/10 border-white/20 text-primary-foreground placeholder:text-white/40" />
              <Button variant="secondary" size="icon" onClick={() => { navigator.clipboard.writeText(reportUrl); toast.success("Copied"); }}><Copy className="w-4 h-4" /></Button>
              <a href={reportUrl} target="_blank" rel="noreferrer"><Button variant="secondary" size="icon"><ExternalLink className="w-4 h-4" /></Button></a>
            </div>
          ) : (
            <Button onClick={generateLink} className="bg-accent text-accent-foreground hover:bg-accent/90"><Link2 className="w-4 h-4 mr-2" /> Generate report link</Button>
          )}
        </div>
      </Card>

        </TabsContent>
      </Tabs>

      {/* Creator detail sheet */}
      {/* Post preview dialog */}
      <Dialog open={!!previewPost} onOpenChange={(o) => !o && setPreviewPost(null)}>
        <DialogContent className="max-w-2xl">
          {previewPost && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>{previewPost.influencers?.full_name}</span>
                  {previewPost.influencers?.handle && <span className="text-sm text-muted-foreground font-normal">@{previewPost.influencers.handle}</span>}
                  <Badge variant="outline" className="capitalize ml-auto text-xs">{previewPost.platform}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto space-y-3">
                <PostEmbed url={previewPost.post_url} platform={previewPost.platform} />
                {previewPost.caption && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Caption</div>
                    <p className="text-sm whitespace-pre-line leading-relaxed">{previewPost.caption}</p>
                  </div>
                )}
                <div className="text-xs text-muted-foreground flex items-center justify-between gap-3 pt-2 border-t">
                  <a href={previewPost.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground break-all">
                    <ExternalLink className="w-3 h-3 shrink-0" /> {previewPost.post_url}
                  </a>
                  {previewPost.posted_at && <span className="shrink-0">Posted {new Date(previewPost.posted_at).toLocaleString()}</span>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedCi} onOpenChange={(o) => !o && setSelectedCi(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedCi && (() => {
            const inf = selectedCi.influencers;
            const stats = byInfluencer.get(selectedCi.influencer_id);
            const creatorPosts = posts.filter(p => p.influencer_id === selectedCi.influencer_id);
            const briefUrl = `${window.location.origin}${slugPath}/brief/${selectedCi.brief_token}`;
            return (
              <>
                <SheetHeader className="text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center font-display text-2xl">{inf?.full_name?.[0]}</div>
                    <div className="min-w-0">
                      <SheetTitle className="font-display text-2xl">{inf?.full_name}</SheetTitle>
                      <div className="text-sm text-muted-foreground">@{inf?.handle?.replace(/^@/, "")} · {inf?.primary_platform}</div>
                    </div>
                  </div>
                </SheetHeader>

                <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden border border-border mt-6">
                  {[
                    { l: "Followers", v: inf?.follower_count ? fmt(inf.follower_count) : "—" },
                    { l: "Niche", v: inf?.niche || "—" },
                    { l: "Status", v: selectedCi.status },
                  ].map((s, i) => (
                    <div key={i} className="bg-card p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                      <div className="font-display text-lg mt-1 truncate capitalize">{s.v}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Deal</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fee</div><div className="font-display text-xl mt-1">KES {Number(selectedCi.fee_kes || 0).toLocaleString()}</div></Card>
                    <Card className="p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables</div><div className="font-display text-xl mt-1">{selectedCi.deliverables_count}</div>{breakdownSummary(selectedCi.deliverables_breakdown) && <div className="text-[10px] text-muted-foreground mt-0.5">{breakdownSummary(selectedCi.deliverables_breakdown)}</div>}</Card>
                  </div>
                </div>

                {stats && (
                  <div className="mt-6">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Performance ({stats.posts} post{stats.posts === 1 ? "" : "s"})</div>
                    <div className="grid grid-cols-5 gap-px bg-border rounded-lg overflow-hidden border border-border">
                      {[
                        { l: "Views", v: fmt(stats.views) },
                        { l: "Likes", v: fmt(stats.likes) },
                        { l: "Comm.", v: fmt(stats.comments) },
                        { l: "Shares", v: fmt(stats.shares) },
                        { l: "Saves", v: fmt(stats.saves) },
                      ].map((s, i) => (
                        <div key={i} className="bg-card p-3 text-center">
                          <div className="font-display text-base">{s.v}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {creatorPosts.length > 0 && (
                  <div className="mt-6">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Posts</div>
                    <ul className="space-y-2">
                      {creatorPosts.map(p => (
                        <li key={p.id} className="p-3 rounded-md border border-border">
                          <div className="text-xs text-muted-foreground capitalize">{p.platform} · {p.status}</div>
                          {p.post_url && <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-accent break-all block mt-1">{p.post_url}</a>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Contact</div>
                  <div className="space-y-1 text-sm">
                    {inf?.email && <div className="text-muted-foreground">{inf.email}</div>}
                    {inf?.phone_mpesa && <div className="text-muted-foreground">{inf.phone_mpesa}</div>}
                    {!inf?.email && !inf?.phone_mpesa && <div className="text-muted-foreground italic">No contact details on file</div>}
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(briefUrl); toast.success("Brief link copied"); }}><Copy className="w-4 h-4 mr-2" /> Copy brief</Button>
                  <a href={briefUrl} target="_blank" rel="noreferrer" className="flex-1"><Button variant="outline" className="w-full"><ExternalLink className="w-4 h-4 mr-2" /> Open brief</Button></a>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
};
export default CampaignDetail;
