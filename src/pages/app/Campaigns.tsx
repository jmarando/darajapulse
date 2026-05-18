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
import { Plus, Megaphone, ArrowUpRight, Eye, BarChart3, FileText, Trophy, Users, Pencil } from "lucide-react";
import { toast } from "sonner";
import { buildPeakMetricsByPost, fetchAllPostMetrics } from "@/lib/metrics";

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

type ContestPerf = { contests: number; contestants: number; entries: number; views: number };

const Campaigns = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [perf, setPerf] = useState<Record<string, { views: number; er: number; posts: number }>>({});
  const [contestPerf, setContestPerf] = useState<Record<string, ContestPerf>>({});
  const [clients, setClients] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ client_id: "", name: "", brief: "", hashtag: "", budget_kes: 0, status: "draft", brief_template_id: "" });
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [savingName, setSavingName] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("campaigns").select("*, clients(name, logo_url)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: cs } = await supabase.from("clients").select("id,name");
    setClients(cs ?? []);

    // Per-campaign performance preview
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: ps } = await supabase.from("posts").select("id, campaign_id").in("campaign_id", ids);
      const postIds = (ps ?? []).map((p) => p.id);
      // Fetch metric history per post and use peak values so bad zero polls do not erase performance.
      // Batch by 100 post ids to keep URLs short and avoid the 1000-row default cap.
      const ms = await fetchAllPostMetrics(supabase, postIds, "post_id, views, likes, comments, shares, saves, captured_at");
      const latest = buildPeakMetricsByPost(ms);
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

    // Contest aggregates per campaign
    if (ids.length) {
      const { data: ctsts } = await supabase.from("contests").select("id, campaign_id").in("campaign_id", ids);
      const contestToCampaign = new Map<string, string>();
      const cmap: Record<string, ContestPerf> = {};
      for (const c of ctsts ?? []) {
        contestToCampaign.set(c.id, c.campaign_id);
        const cur = cmap[c.campaign_id] ?? { contests: 0, contestants: 0, entries: 0, views: 0 };
        cur.contests += 1;
        cmap[c.campaign_id] = cur;
      }
      const contestIds = (ctsts ?? []).map(c => c.id);
      if (contestIds.length) {
        const { data: es } = await supabase.from("contest_entries").select("contest_id, handle, views").in("contest_id", contestIds);
        const handlesByCampaign: Record<string, Set<string>> = {};
        for (const e of es ?? []) {
          const cid = contestToCampaign.get(e.contest_id);
          if (!cid) continue;
          const cur = cmap[cid] ?? { contests: 0, contestants: 0, entries: 0, views: 0 };
          cur.entries += 1;
          cur.views += Number(e.views || 0);
          if (e.handle) {
            (handlesByCampaign[cid] ||= new Set()).add(String(e.handle).toLowerCase());
          }
          cmap[cid] = cur;
        }
        for (const [cid, set] of Object.entries(handlesByCampaign)) {
          if (cmap[cid]) cmap[cid].contestants = set.size;
        }
      }
      setContestPerf(cmap);
    } else {
      setContestPerf({});
    }
  };
  useEffect(() => { load(); }, []);

  const saveName = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return toast.error("Name required");
    setSavingName(true);
    const { error } = await supabase.from("campaigns").update({ name }).eq("id", editing.id);
    setSavingName(false);
    if (error) return toast.error(error.message);
    toast.success("Renamed");
    setEditing(null);
    load();
  };

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
                <div className="flex items-start gap-3">
                  {r.clients?.logo_url ? (
                    <div className="w-11 h-11 rounded-md bg-white border border-border shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={r.clients.logo_url} alt={`${r.clients?.name} logo`} className="max-w-[80%] max-h-[80%] object-contain" loading="lazy" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-md bg-muted shrink-0 flex items-center justify-center text-xs font-display text-muted-foreground">
                      {(r.clients?.name || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground truncate">{r.clients?.name}</div>
                    <div className="flex items-start gap-1.5">
                      <div className="font-display text-xl mt-0.5 leading-tight break-words flex-1">{r.name}</div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing({ id: r.id, name: r.name }); }}
                        className="mt-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        aria-label="Rename campaign"
                        title="Rename campaign"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Badge className={`${statusColor[r.status]} shrink-0`}>{r.status}</Badge>
                </div>
                <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                  <span className="truncate">{r.hashtag || "—"}</span>
                  <span className="font-display text-foreground shrink-0 ml-3">KES {Number(r.budget_kes).toLocaleString()}</span>
                </div>
                {/* Performance preview — contest metrics when a contest exists, otherwise post performance */}
                {contestPerf[r.id]?.contests ? (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                      <Trophy className="w-3 h-3 text-highlight" /> Contest
                      <span className="ml-auto normal-case tracking-normal text-muted-foreground/70">{contestPerf[r.id].contests} active</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Users className="w-3 h-3" /> Contestants</div>
                        <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(contestPerf[r.id].contestants)}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><FileText className="w-3 h-3" /> Entries</div>
                        <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(contestPerf[r.id].entries)}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Eye className="w-3 h-3" /> Views</div>
                        <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(contestPerf[r.id].views)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
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
                )}
                <div className="flex justify-end mt-2">
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display text-xl">Rename campaign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Campaign name</Label>
              <Input
                autoFocus
                value={editing?.name ?? ""}
                onChange={(e) => setEditing(editing ? { ...editing, name: e.target.value } : null)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="bg-primary" onClick={saveName} disabled={savingName}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Campaigns;
