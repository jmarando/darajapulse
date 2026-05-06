import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar, Plus, Upload, MessageSquare, FileVideo } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["drafted","in_review","approved","scheduled","posted"];
const PLATFORMS = ["tiktok","instagram","youtube","twitter","facebook"];

export const ContentSection = ({ campaignId, roster }: { campaignId: string; roster: any[] }) => {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [form, setForm] = useState<any>({ title: "", influencer_id: "", platform: "tiktok", scheduled_for: "", caption: "", notes: "" });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("content_items").select("*, influencers(full_name, handle)").eq("campaign_id", campaignId).order("scheduled_for", { ascending: true, nullsFirst: false });
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [campaignId]);

  const loadComments = async (itemId: string) => {
    const { data } = await supabase.from("content_comments").select("*").eq("content_item_id", itemId).order("created_at");
    setComments(data ?? []);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form, campaign_id: campaignId };
    if (!payload.influencer_id) delete payload.influencer_id;
    if (!payload.scheduled_for) delete payload.scheduled_for;
    const { error } = await supabase.from("content_items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Content item created"); setOpen(false);
    setForm({ title: "", influencer_id: "", platform: "tiktok", scheduled_for: "", caption: "", notes: "" });
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from("content_items").update({ status }).eq("id", id);
    load();
    if (active?.id === id) setActive({ ...active, status });
  };

  const upload = async (file: File, itemId: string) => {
    setUploading(true);
    const path = `${campaignId}/${itemId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("campaign-assets").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("campaign-assets").createSignedUrl ? await supabase.storage.from("campaign-assets").createSignedUrl(path, 60 * 60 * 24 * 30) : { data: null } as any;
    const url = data?.signedUrl ?? path;
    await supabase.from("content_items").update({ asset_url: url }).eq("id", itemId);
    setUploading(false);
    toast.success("Asset uploaded");
    load();
    if (active?.id === itemId) setActive({ ...active, asset_url: url });
  };

  const addComment = async () => {
    if (!newComment.trim() || !active) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("content_comments").insert({
      content_item_id: active.id, body: newComment.trim(), author_id: user?.id, author_name: user?.email ?? "Agency",
    });
    if (error) return toast.error(error.message);
    setNewComment(""); loadComments(active.id);
  };

  const tone: Record<string, string> = {
    drafted: "bg-muted text-muted-foreground border-border",
    in_review: "bg-highlight/20 text-foreground border-highlight/40",
    approved: "bg-success/15 text-success border-success/30",
    scheduled: "bg-accent text-accent-foreground border-accent",
    posted: "bg-primary text-primary-foreground border-primary",
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Production</div>
          <h2 className="font-display text-2xl flex items-center gap-2"><Calendar className="w-5 h-5" /> Content calendar</h2>
          <p className="text-xs text-muted-foreground mt-1">Plan, upload, review and approve content before it goes live.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="bg-primary"><Plus className="w-3 h-3 mr-1" /> New content item</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Plan a content item</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div><Label>Title</Label><Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Royco unboxing TikTok" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Creator</Label>
                  <Select value={form.influencer_id} onValueChange={v => setForm({ ...form, influencer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>{roster.map(r => <SelectItem key={r.influencer_id} value={r.influencer_id}>{r.influencers?.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Platform</Label>
                  <Select value={form.platform} onValueChange={v => setForm({ ...form, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Scheduled for</Label><Input type="datetime-local" value={form.scheduled_for} onChange={e => setForm({ ...form, scheduled_for: e.target.value })} /></div>
              <div><Label>Caption draft</Label><Textarea rows={3} value={form.caption} onChange={e => setForm({ ...form, caption: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-primary">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-md">
          <p className="text-sm text-muted-foreground">No planned content yet. Add the first item to start scheduling.</p>
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(it => (
            <li key={it.id}>
              <button onClick={() => { setActive(it); loadComments(it.id); }} className="w-full text-left p-4 rounded-md border border-border hover:bg-secondary/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{it.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {it.influencers?.full_name ?? "Unassigned"} · {it.platform}
                    </div>
                  </div>
                  <Badge variant="outline" className={`capitalize ${tone[it.status] ?? ""}`}>{it.status.replace("_"," ")}</Badge>
                </div>
                {it.scheduled_for && <div className="text-[11px] text-muted-foreground mt-2">📅 {new Date(it.scheduled_for).toLocaleString()}</div>}
                {it.asset_url && <div className="text-[11px] text-accent mt-1 inline-flex items-center gap-1"><FileVideo className="w-3 h-3" /> Asset attached</div>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!active} onOpenChange={o => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {active && (
            <>
              <SheetHeader><SheetTitle>{active.title}</SheetTitle></SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => setStatus(active.id, s)}
                      className={`px-2.5 py-1 rounded-full text-xs border capitalize ${active.status === s ? tone[s] : "border-border text-muted-foreground hover:bg-secondary"}`}>
                      {s.replace("_"," ")}
                    </button>
                  ))}
                </div>

                <div className="p-3 rounded-md bg-secondary/30 border border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Asset</div>
                  {active.asset_url ? (
                    <a href={active.asset_url} target="_blank" rel="noreferrer" className="text-sm text-accent break-all">{active.asset_url}</a>
                  ) : <div className="text-sm text-muted-foreground">No asset uploaded</div>}
                  <label className="mt-2 inline-flex items-center gap-2 cursor-pointer text-sm">
                    <input type="file" className="hidden" accept="video/*,image/*" onChange={e => e.target.files?.[0] && upload(e.target.files[0], active.id)} />
                    <Button asChild size="sm" variant="outline" disabled={uploading}><span><Upload className="w-3 h-3 mr-1" /> {uploading ? "Uploading…" : "Upload video / image"}</span></Button>
                  </label>
                </div>

                {active.caption && <div><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Caption</Label><div className="text-sm whitespace-pre-wrap mt-1">{active.caption}</div></div>}
                {active.notes && <div><Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes</Label><div className="text-sm whitespace-pre-wrap mt-1 text-muted-foreground">{active.notes}</div></div>}

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Comments ({comments.length})</div>
                  </div>
                  <ul className="space-y-2 mb-3">
                    {comments.map(c => (
                      <li key={c.id} className="p-2.5 rounded-md bg-secondary/40 border border-border">
                        <div className="text-xs text-muted-foreground">{c.author_name} · {new Date(c.created_at).toLocaleString()}</div>
                        <div className="text-sm mt-1 whitespace-pre-wrap">{c.body}</div>
                      </li>
                    ))}
                  </ul>
                  <Textarea rows={2} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Leave a review note…" />
                  <Button size="sm" onClick={addComment} className="mt-2 bg-primary">Post comment</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
};
