import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Link2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const CampaignDetail = () => {
  const { id } = useParams();
  const [c, setC] = useState<any>(null);
  const [rosterAll, setRosterAll] = useState<any[]>([]);
  const [ci, setCi] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [link, setLink] = useState<any>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [post, setPost] = useState<any>({ influencer_id: "", platform: "tiktok", post_url: "", caption: "" });

  const load = async () => {
    const { data: c1 } = await supabase.from("campaigns").select("*, clients(name)").eq("id", id).single();
    setC(c1);
    const { data: ciAll } = await supabase.from("campaign_influencers").select("*, influencers(*)").eq("campaign_id", id);
    setCi(ciAll ?? []);
    const { data: r } = await supabase.from("influencers").select("*");
    setRosterAll(r ?? []);
    const { data: p } = await supabase.from("posts").select("*, influencers(full_name, handle)").eq("campaign_id", id);
    setPosts(p ?? []);
    const { data: l } = await supabase.from("report_links").select("*").eq("campaign_id", id).maybeSingle();
    setLink(l);
  };
  useEffect(() => { load(); }, [id]);

  const addInfl = async (influencer_id: string) => {
    const { error } = await supabase.from("campaign_influencers").insert({ campaign_id: id, influencer_id });
    if (error) return toast.error(error.message);
    toast.success("Added"); load();
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

  if (!c) return <div className="p-8">Loading…</div>;
  const reportUrl = link ? `${window.location.origin}/r/${link.token}` : "";

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to="/app/campaigns" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="w-4 h-4 mr-1" /> All campaigns</Link>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.clients?.name}</div>
          <h1 className="font-display text-4xl font-semibold mt-1">{c.name}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">{c.brief || "No brief yet."}</p>
        </div>
        <Select value={c.status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["draft","pitched","won","live","reporting","closed"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card className="p-6 mb-6 bg-gradient-ink text-primary-foreground">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-70">Live client report</div>
            <div className="font-display text-2xl mt-1">The Ogilvy moment</div>
            <p className="text-sm opacity-80 mt-1 max-w-md">A tokenized public page brand managers forward internally. Updates as posts come in.</p>
          </div>
          {link ? (
            <div className="flex items-center gap-2">
              <Input readOnly value={reportUrl} className="w-80 bg-white/10 border-white/20 text-primary-foreground" />
              <Button variant="secondary" size="icon" onClick={() => { navigator.clipboard.writeText(reportUrl); toast.success("Copied"); }}><Copy className="w-4 h-4" /></Button>
              <a href={reportUrl} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink className="w-4 h-4" /></Button></a>
            </div>
          ) : (
            <Button onClick={generateLink} className="bg-accent text-accent-foreground hover:bg-accent/90"><Link2 className="w-4 h-4 mr-2" /> Generate report link</Button>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl">Roster</h2>
            <Dialog>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" /> Add</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add influencer to campaign</DialogTitle></DialogHeader>
                <div className="space-y-2 max-h-96 overflow-auto">
                  {rosterAll.filter(r => !ci.some(x => x.influencer_id === r.id)).map(r => (
                    <button key={r.id} onClick={() => addInfl(r.id)} className="w-full text-left p-3 rounded-md hover:bg-secondary flex justify-between items-center">
                      <span>{r.full_name} <span className="text-muted-foreground text-xs">· {r.primary_platform}</span></span>
                      <Plus className="w-4 h-4" />
                    </button>
                  ))}
                  {rosterAll.length === 0 && <p className="text-sm text-muted-foreground">No influencers in roster yet.</p>}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {ci.length === 0 ? <p className="text-sm text-muted-foreground">No influencers yet.</p> : (
            <ul className="space-y-2">
              {ci.map(x => (
                <li key={x.id} className="flex items-center justify-between p-2 rounded-md bg-secondary/40">
                  <div>
                    <div className="text-sm">{x.influencers?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{x.influencers?.handle} · {x.influencers?.primary_platform}</div>
                  </div>
                  <Badge variant="outline">{x.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl">Posts</h2>
            <Dialog open={postOpen} onOpenChange={setPostOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm" disabled={ci.length === 0}><Plus className="w-3 h-3 mr-1" /> Add post</Button></DialogTrigger>
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
          {posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts captured yet.</p> : (
            <ul className="space-y-2">
              {posts.map(p => (
                <li key={p.id} className="p-3 rounded-md border border-border">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">{p.influencers?.full_name} <span className="text-muted-foreground">· {p.platform}</span></div>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                  {p.post_url && <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-accent break-all">{p.post_url}</a>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};
export default CampaignDetail;
