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
import { ArrowLeft, Plus, Link2, Copy, ExternalLink, RefreshCw, Eye, Heart, MessageCircle, Share2, Users, Hash, Wallet, Mail, MessageSquare, Pencil, Check } from "lucide-react";
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

  const load = async () => {
    const { data: c1 } = await supabase.from("campaigns").select("*, clients(name)").eq("id", id).single();
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
    let views = 0, likes = 0, comments = 0, shares = 0;
    for (const m of latestByPost.values()) {
      views += Number(m.views || 0);
      likes += Number(m.likes || 0);
      comments += Number(m.comments || 0);
      shares += Number(m.shares || 0);
    }
    const er = views ? ((likes + comments + shares) / views) * 100 : 0;
    return { views, likes, comments, shares, er };
  }, [latestByPost]);

  const rosterTotals = useMemo(() => {
    const fees = ci.reduce((a, x) => a + Number(x.fee_kes || 0), 0);
    const deliv = ci.reduce((a, x) => a + Number(x.deliverables_count || 0), 0);
    const confirmed = ci.filter(x => ["confirmed","live","completed"].includes(x.status)).length;
    return { fees, deliv, confirmed };
  }, [ci]);

  if (!c) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const reportUrl = link ? `${window.location.origin}/r/${link.token}` : "";
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border rounded-lg overflow-hidden mb-6 border border-border">
        {[
          { label: "Views", value: fmt(totals.views), icon: Eye },
          { label: "Likes", value: fmt(totals.likes), icon: Heart },
          { label: "Comments", value: fmt(totals.comments), icon: MessageCircle },
          { label: "Shares", value: fmt(totals.shares), icon: Share2 },
          { label: "Engagement", value: `${totals.er.toFixed(1)}%`, icon: null as any },
        ].map((s, i) => (
          <div key={i} className="bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
              {s.icon && <s.icon className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
            <div className="font-display text-3xl mt-2">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Roster + Posts */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Roster */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Roster</div>
              <h2 className="font-display text-2xl">Creators</h2>
            </div>
            <Dialog open={rosterOpen} onOpenChange={(o) => { setRosterOpen(o); if (!o) setCreating(false); }}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" /> Add</Button></DialogTrigger>
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
                      <div><Label>Deliverables</Label><Input type="number" min="1" value={addDeliv} onChange={e => setAddDeliv(e.target.value)} /></div>
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
                      <div><Label>Deliverables</Label><Input type="number" min="1" value={addDeliv} onChange={e => setAddDeliv(e.target.value)} /></div>
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
            <div className="text-center py-10 border border-dashed border-border rounded-md">
              <Users className="w-6 h-6 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">No creators on this campaign yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {ci.map(x => {
                const briefUrl = `${window.location.origin}/b/${x.brief_token}`;
                const statusTones: Record<string,string> = {
                  invited: "bg-muted text-muted-foreground",
                  negotiating: "bg-highlight/20 text-foreground",
                  confirmed: "bg-success/15 text-success",
                  live: "bg-accent text-accent-foreground",
                  completed: "bg-secondary text-foreground",
                  declined: "bg-destructive/15 text-destructive",
                };
                const isEditing = editingId === x.id;
                const mailto = `mailto:${x.influencers?.email ?? ""}?subject=${encodeURIComponent(`${c.clients?.name} × ${c.name} — collaboration brief`)}&body=${encodeURIComponent(`Hi ${x.influencers?.full_name?.split(" ")[0] ?? ""},\n\nWe'd love to have you on this campaign. View your brief and confirm here:\n${briefUrl}\n\nThanks!`)}`;
                const wa = x.influencers?.phone_mpesa ? `https://wa.me/${String(x.influencers.phone_mpesa).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${x.influencers?.full_name?.split(" ")[0] ?? ""}! ${c.clients?.name} × ${c.name} brief: ${briefUrl}`)}` : null;
                return (
                  <li key={x.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-display">{x.influencers?.full_name?.[0]}</div>
                        <div className="min-w-0">
                          <div className="text-sm truncate">{x.influencers?.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{x.influencers?.handle} · {x.influencers?.primary_platform}</div>
                        </div>
                      </div>
                      <Select value={x.status} onValueChange={(v) => updateCi(x.id, { status: v })}>
                        <SelectTrigger className={`w-32 h-7 text-xs capitalize border-0 ${statusTones[x.status] ?? ""}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{["invited","negotiating","confirmed","live","completed","declined"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2 pl-12 text-xs">
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input className="h-7 text-xs" type="number" value={editFee} onChange={e => setEditFee(e.target.value)} placeholder="Fee" />
                          <span className="text-muted-foreground">·</span>
                          <Input className="h-7 text-xs w-16" type="number" min="1" value={editDeliv} onChange={e => setEditDeliv(e.target.value)} />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(x.id)}><Check className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <button className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => { setEditingId(x.id); setEditFee(String(x.fee_kes ?? 0)); setEditDeliv(String(x.deliverables_count ?? 1)); }}>
                          KES {Number(x.fee_kes || 0).toLocaleString()} · {x.deliverables_count} deliverable{x.deliverables_count === 1 ? "" : "s"} <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy brief link" onClick={() => { navigator.clipboard.writeText(briefUrl); toast.success("Brief link copied"); }}><Copy className="w-3 h-3" /></Button>
                        <a href={mailto}><Button size="icon" variant="ghost" className="h-7 w-7" title="Email invite"><Mail className="w-3 h-3" /></Button></a>
                        {wa && <a href={wa} target="_blank" rel="noreferrer"><Button size="icon" variant="ghost" className="h-7 w-7" title="WhatsApp invite"><MessageSquare className="w-3 h-3" /></Button></a>}
                        <a href={briefUrl} target="_blank" rel="noreferrer"><Button size="icon" variant="ghost" className="h-7 w-7" title="Open brief"><ExternalLink className="w-3 h-3" /></Button></a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Posts */}
        <Card className="p-5 lg:col-span-3">
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
            <ul className="space-y-2">
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
      </div>
    </div>
  );
};
export default CampaignDetail;
