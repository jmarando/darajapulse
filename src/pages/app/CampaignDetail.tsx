import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Plus, Link2, Copy, ExternalLink, RefreshCw, Eye, Heart, MessageCircle, Share2, Users, Hash, Wallet, Mail, MessageSquare, Pencil, Check, MoreHorizontal, Send, X, Bookmark, Radio, BarChart3, Trophy, Music2 } from "lucide-react";
import { toast } from "sonner";

const CampaignDetail = () => {
  const { id } = useParams();
  const [c, setC] = useState<any>(null);
  const [rosterAll, setRosterAll] = useState<any[]>([]);
  const [ci, setCi] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [link, setLink] = useState<any>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [post, setPost] = useState<any>({ influencer_id: "", platform: "tiktok", post_url: "", caption: "" });
  const [rosterOpen, setRosterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newInfl, setNewInfl] = useState<any>({ full_name: "", handle: "", primary_platform: "tiktok", niche: "", follower_count: 0 });
  const [addFee, setAddFee] = useState<string>("");
  const [addDeliv, setAddDeliv] = useState<string>("1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFee, setEditFee] = useState<string>("");
  const [editDeliv, setEditDeliv] = useState<string>("1");
  const [selectedCi, setSelectedCi] = useState<any>(null);

  const load = async () => {
    const { data: c1 } = await supabase.from("campaigns").select("*, clients(name, slug)").eq("id", id).single();
    setC(c1);
    const { data: ciAll } = await supabase.from("campaign_influencers").select("*, influencers(*)").eq("campaign_id", id);
    setCi(ciAll ?? []);
    const { data: r } = await supabase.from("influencers").select("*");
    setRosterAll(r ?? []);
    const { data: p } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", id);
    setPosts(p ?? []);
    const postIds = (p ?? []).map((x: any) => x.id);
    if (postIds.length) {
      const { data: m } = await supabase.from("post_metrics").select("*").in("post_id", postIds).order("captured_at", { ascending: false });
      setMetrics(m ?? []);
    } else setMetrics([]);
    const { data: l } = await supabase.from("report_links").select("*").eq("campaign_id", id).maybeSingle();
    setLink(l);
  };
  useEffect(() => { load(); }, [id]);

  const addInfl = async (influencer_id: string) => {
    const fee = Number(addFee) || 0;
    const deliv = Number(addDeliv) || 1;
    const { error } = await supabase.from("campaign_influencers").insert({ campaign_id: id, influencer_id, fee_kes: fee, deliverables_count: deliv });
    if (error) return toast.error(error.message);
    toast.success("Added"); setAddFee(""); setAddDeliv("1"); load();
  };

  const updateCi = async (ciId: string, patch: any) => {
    const { error } = await supabase.from("campaign_influencers").update(patch).eq("id", ciId);
    if (error) return toast.error(error.message);
    load();
  };

  const saveEdit = async (ciId: string) => {
    await updateCi(ciId, { fee_kes: Number(editFee) || 0, deliverables_count: Number(editDeliv) || 1 });
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
      const { error: e2 } = await supabase.from("campaign_influencers").insert({ campaign_id: id, influencer_id: data.id, fee_kes: Number(addFee) || 0, deliverables_count: Number(addDeliv) || 1 });
      if (e2) { toast.error(e2.message); return; }
      toast.success("Influencer created and added");
      setNewInfl({ full_name: "", handle: "", primary_platform: "tiktok", niche: "", follower_count: 0 });
      setAddFee(""); setAddDeliv("1");
      setCreating(false); setRosterOpen(false); load();
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

  const generateLink = async () => {
    const { error } = await supabase.from("report_links").insert({ campaign_id: id });
    if (error) return toast.error(error.message);
    load();
  };

  const setStatus = async (status: string) => {
    await supabase.from("campaigns").update({ status: status as any }).eq("id", id);
    load();
  };

  // Latest metric per post
  const latestByPost = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of metrics) if (!map.has(m.post_id)) map.set(m.post_id, m);
    return map;
  }, [metrics]);

  const totals = useMemo(() => {
    let views = 0, likes = 0, comments = 0, shares = 0, saves = 0, reach = 0, impressions = 0;
    for (const m of latestByPost.values()) {
      views += Number(m.views || 0);
      likes += Number(m.likes || 0);
      comments += Number(m.comments || 0);
      shares += Number(m.shares || 0);
      saves += Number(m.saves || 0);
      reach += Number(m.reach || 0);
      impressions += Number(m.impressions || 0);
    }
    const er = views ? ((likes + comments + shares + saves) / views) * 100 : 0;
    const emv = Math.round((impressions || views) * 0.012);
    return { views, likes, comments, shares, saves, reach, impressions, er, emv };
  }, [latestByPost]);

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

  if (!c) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const slugPath = c.clients?.slug && c.slug ? `/${c.clients.slug}/${c.slug}` : "";
  const reportUrl = link ? `${window.location.origin}${slugPath}/report/${link.token}` : "";
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;

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

      {/* Header */}
      <div className="flex justify-between items-start gap-6 mb-8">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.clients?.name}</div>
          <h1 className="font-display text-4xl font-semibold mt-1 truncate">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm text-muted-foreground">
            {c.hashtag && <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{c.hashtag.replace(/^#/, "")}</span>}
            {c.budget_kes > 0 && <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />KES {Number(c.budget_kes).toLocaleString()}</span>}
            <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{rosterTotals.confirmed}/{ci.length} confirmed</span>
            {rosterTotals.fees > 0 && <span className="inline-flex items-center gap-1">Fees committed: KES {rosterTotals.fees.toLocaleString()}</span>}
            {rosterTotals.deliv > 0 && <span>{rosterTotals.deliv} deliverable{rosterTotals.deliv === 1 ? "" : "s"}</span>}
          </div>
          {c.brief && <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">{c.brief}</p>}
        </div>
        <Select value={c.status} onValueChange={setStatus}>
          <SelectTrigger className={`w-40 capitalize border ${statusTone[c.status] ?? ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>{["draft","pitched","won","live","reporting","closed"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Performance band */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-px bg-border rounded-lg overflow-hidden mb-6 border border-border">
        {[
          { label: "Views", value: fmt(totals.views), icon: Eye },
          { label: "Likes", value: fmt(totals.likes), icon: Heart },
          { label: "Comments", value: fmt(totals.comments), icon: MessageCircle },
          { label: "Shares", value: fmt(totals.shares), icon: Share2 },
          { label: "Saves", value: fmt(totals.saves), icon: Bookmark },
          { label: "Reach", value: fmt(totals.reach), icon: Radio },
          { label: "Engagement", value: `${totals.er.toFixed(1)}%`, icon: BarChart3 },
          { label: "Earned Media", value: `KES ${fmt(totals.emv)}`, icon: Wallet },
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

      {/* Roster — full width table */}
      <Card className="p-0 overflow-hidden mb-6">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Roster</div>
            <h2 className="font-display text-2xl">Creators</h2>
          </div>
          <Dialog open={rosterOpen} onOpenChange={(o) => { setRosterOpen(o); if (!o) setCreating(false); }}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" /> Add creator</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{creating ? "Create new influencer" : "Add influencer to campaign"}</DialogTitle></DialogHeader>
              {creating ? (
                <form onSubmit={createAndAddInfl} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Full name</Label><Input required value={newInfl.full_name} onChange={e => setNewInfl({ ...newInfl, full_name: e.target.value })} /></div>
                    <div><Label>Handle</Label><Input value={newInfl.handle} onChange={e => setNewInfl({ ...newInfl, handle: e.target.value })} placeholder="@..." /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Platform</Label>
                      <Select value={newInfl.primary_platform} onValueChange={v => setNewInfl({ ...newInfl, primary_platform: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["tiktok","instagram","youtube","twitter","facebook"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Followers</Label><Input type="number" value={newInfl.follower_count} onChange={e => setNewInfl({ ...newInfl, follower_count: e.target.value })} /></div>
                  </div>
                  <div><Label>Niche</Label><Input value={newInfl.niche} onChange={e => setNewInfl({ ...newInfl, niche: e.target.value })} placeholder="Food / Beauty / Comedy" /></div>
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border mt-1">
                    <div><Label>Fee (KES)</Label><Input type="number" value={addFee} onChange={e => setAddFee(e.target.value)} placeholder="0" /></div>
                    <div>
                      <Label># of posts</Label>
                      <Input type="number" min="1" value={addDeliv} onChange={e => setAddDeliv(e.target.value)} />
                      <p className="text-[10px] text-muted-foreground mt-1">How many pieces of content (Reels, Stories, TikToks) the creator will deliver.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setCreating(false)} disabled={submitting}>Back</Button>
                    <Button type="submit" className="flex-1 bg-primary" disabled={submitting}>{submitting ? "Saving…" : "Create & add"}</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                    <div><Label>Fee (KES)</Label><Input type="number" value={addFee} onChange={e => setAddFee(e.target.value)} placeholder="0" /></div>
                    <div>
                      <Label># of posts</Label>
                      <Input type="number" min="1" value={addDeliv} onChange={e => setAddDeliv(e.target.value)} />
                      <p className="text-[10px] text-muted-foreground mt-1">Pieces of content the creator will deliver.</p>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-72 overflow-auto mt-2">
                    {rosterAll.filter(r => !ci.some(x => x.influencer_id === r.id)).map(r => (
                      <button key={r.id} onClick={() => addInfl(r.id)} className="w-full text-left p-3 rounded-md hover:bg-secondary flex justify-between items-center">
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
                  <th className="text-right font-medium px-3 py-3"># Posts</th>
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
                    <tr key={x.id} onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return; setSelectedCi(x); }} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors group cursor-pointer">
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
                      <td className="px-3 py-3 text-right tabular-nums">
                        {isEditing ? (
                          <Input className="h-8 text-sm text-right w-20 ml-auto" type="number" min="1" value={editDeliv} onChange={e => setEditDeliv(e.target.value)} />
                        ) : (
                          x.deliverables_count
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
                              <DropdownMenuItem onClick={() => { setEditingId(x.id); setEditFee(String(x.fee_kes ?? 0)); setEditDeliv(String(x.deliverables_count ?? 1)); }}>
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

      {/* Posts — full width below */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Activity</div>
            <h2 className="font-display text-2xl">Posts</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              toast.loading("Refreshing TikTok metrics…", { id: "tt" });
              const { data, error } = await supabase.functions.invoke("tiktok-poll", { body: { campaign_id: id } });
              if (error) return toast.error(error.message, { id: "tt" });
              toast.success(`Polled ${(data?.results ?? []).reduce((a: number, r: any) => a + (r.polled ?? 0), 0)} posts`, { id: "tt" });
              load();
            }}><RefreshCw className="w-3 h-3 mr-1" /> Refresh TikTok</Button>
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
                    <Select value={post.platform} onValueChange={v => setPost({ ...post, platform: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["tiktok","instagram","youtube","twitter","facebook"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
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
          <ul className="grid md:grid-cols-2 gap-3">
            {posts.map(p => {
              const m = latestByPost.get(p.id);
              return (
                <li key={p.id} className="p-3 rounded-md border border-border hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm min-w-0 truncate">
                      <span className="font-medium">{p.influencers?.full_name}</span>
                      <span className="text-muted-foreground"> · {p.platform}</span>
                    </div>
                    <Badge variant="outline" className="capitalize">{p.status}</Badge>
                  </div>
                  {p.post_url && <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-accent break-all block mt-1">{p.post_url}</a>}
                  {m && (
                    <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                      <div><div className="font-display text-base">{fmt(m.views || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Views</div></div>
                      <div><div className="font-display text-base">{fmt(m.likes || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Likes</div></div>
                      <div><div className="font-display text-base">{fmt(m.comments || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Comments</div></div>
                      <div><div className="font-display text-base">{fmt(m.shares || 0)}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Shares</div></div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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

      {/* Creator detail sheet */}
      <Sheet open={!!selectedCi} onOpenChange={(o) => !o && setSelectedCi(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedCi && (() => {
            const inf = selectedCi.influencers;
            const stats = byInfluencer.get(selectedCi.influencer_id);
            const creatorPosts = posts.filter(p => p.influencer_id === selectedCi.influencer_id);
            const briefUrl = `${window.location.origin}/b/${selectedCi.brief_token}`;
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
                    <Card className="p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables</div><div className="font-display text-xl mt-1">{selectedCi.deliverables_count}</div></Card>
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
