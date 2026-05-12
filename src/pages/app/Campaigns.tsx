import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Megaphone, ArrowUpRight, Eye, BarChart3, FileText } from "lucide-react";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pitched: "bg-secondary",
  won: "bg-success/15 text-success",
  live: "bg-accent text-accent-foreground",
  reporting: "bg-highlight/20 text-foreground",
  closed: "bg-muted text-muted-foreground",
};

const fmtNum = (n: number) => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const Campaigns = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [perf, setPerf] = useState<Record<string, { views: number; er: number; posts: number }>>({});
  const [clients, setClients] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ client_id: "", name: "", brief: "", hashtag: "", budget_kes: 0, status: "draft", brief_template_id: "" });

  const load = async () => {
    const { data } = await supabase.from("campaigns").select("*, clients(name)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: cs } = await supabase.from("clients").select("id,name");
    setClients(cs ?? []);

    // Per-campaign performance preview
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: ps } = await supabase.from("posts").select("id, campaign_id").in("campaign_id", ids);
      const postIds = (ps ?? []).map((p) => p.id);
      const { data: ms } = postIds.length
        ? await supabase.from("post_metrics").select("post_id, views, likes, comments, shares, saves").in("post_id", postIds)
        : { data: [] as any[] };
      // latest metric per post
      const latest = new Map<string, any>();
      for (const m of ms ?? []) if (!latest.has(m.post_id)) latest.set(m.post_id, m);
      const map: Record<string, { views: number; er: number; posts: number; eng: number }> = {};
      for (const p of ps ?? []) {
        const cur = map[p.campaign_id] ?? { views: 0, er: 0, posts: 0, eng: 0 };
        cur.posts += 1;
        const m = latest.get(p.id);
        if (m) {
          cur.views += Number(m.views || 0);
          cur.eng += Number((m.likes||0) + (m.comments||0) + (m.shares||0) + (m.saves||0));
        }
        map[p.campaign_id] = cur;
      }
      const out: Record<string, { views: number; er: number; posts: number }> = {};
      for (const [k, v] of Object.entries(map)) {
        out[k] = { views: v.views, posts: v.posts, er: v.views > 0 ? (v.eng / v.views) * 100 : 0 };
      }
      setPerf(out);
    } else {
      setPerf({});
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.client_id) { setTemplates([]); return; }
    supabase.from("brief_templates").select("id,name").eq("client_id", form.client_id).order("updated_at", { ascending: false })
      .then(({ data }) => setTemplates(data ?? []));
  }, [form.client_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form, budget_kes: Number(form.budget_kes) };
    if (!payload.brief_template_id) delete payload.brief_template_id;
    const { error } = await supabase.from("campaigns").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Campaign created"); setOpen(false); load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Pipeline</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Campaigns</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-primary" disabled={clients.length === 0}><Plus className="w-4 h-4 mr-2" /> New campaign</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">New campaign</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Campaign name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Royco — Mama Mboga Q1" /></div>
              <div><Label>Hashtag</Label><Input value={form.hashtag} onChange={e => setForm({ ...form, hashtag: e.target.value })} placeholder="#RoycoTwende" /></div>
              <div><Label>Budget (KES)</Label><Input type="number" value={form.budget_kes} onChange={e => setForm({ ...form, budget_kes: e.target.value })} /></div>
              <div>
                <Label>Linked brief (optional)</Label>
                <Select value={form.brief_template_id || "none"} onValueChange={v => setForm({ ...form, brief_template_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder={templates.length ? "Pick a brief" : "No briefs for this client yet"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — write inline</SelectItem>
                    {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Briefs are managed in the Brief library. Linked briefs update creator brief links live.</p>
              </div>
              <div><Label>Brief (only if not linked)</Label><Textarea rows={3} value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-primary">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 && <Card className="p-4 mb-4 bg-secondary/50 text-sm">Add a client first to create a campaign.</Card>}

      {rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No campaigns yet</h3>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map(r => (
            <Link key={r.id} to={`/app/campaigns/${r.id}`}>
              <Card className="p-5 hover:shadow-elegant transition-all hover:-translate-y-0.5 group h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground truncate">{r.clients?.name}</div>
                    <div className="font-display text-2xl mt-1 truncate">{r.name}</div>
                  </div>
                  <Badge className={`${statusColor[r.status]} shrink-0`}>{r.status}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                  <span className="truncate">{r.hashtag || "—"}</span>
                  <span className="font-display text-foreground shrink-0 ml-3">KES {Number(r.budget_kes).toLocaleString()}</span>
                </div>
                {/* Performance preview */}
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Eye className="w-3 h-3" /> Views</div>
                    <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(perf[r.id]?.views ?? 0)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><BarChart3 className="w-3 h-3" /> ER</div>
                    <div className="font-display text-lg mt-0.5 tabular-nums">{(perf[r.id]?.er ?? 0).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><FileText className="w-3 h-3" /> Posts</div>
                    <div className="font-display text-lg mt-0.5 tabular-nums">{perf[r.id]?.posts ?? 0}</div>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
export default Campaigns;
