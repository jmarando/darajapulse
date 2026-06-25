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
import { Plus, Megaphone, ArrowUpRight, Eye, BarChart3, FileText, Trophy, Users, Pencil, Trash2 } from "lucide-react";
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

type ContestPerf = { contests: number; contestants: number; entries: number; views: number };

const Stat = ({ label, value, suffix }: { label: string; value: string; suffix?: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9px] font-bold text-background/50 uppercase tracking-[0.2em]">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className="font-display text-2xl md:text-[1.65rem] font-semibold text-background tracking-tight tabular-nums">{value}</span>
      {suffix && <span className="text-sm font-medium text-background/60">{suffix}</span>}
    </div>
  </div>
);

const Divider = () => <div className="h-9 w-px bg-background/15" />;

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
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingNow, setDeletingNow] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("campaigns").select("*, clients(name, logo_url)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: cs } = await supabase.from("clients").select("id,name");
    setClients(cs ?? []);

    // Per-campaign performance preview — aggregated server-side via RPC
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: perfRows, error: perfErr } = await (supabase as any)
        .rpc("campaign_perf_summary", { campaign_ids: ids });
      if (perfErr) console.warn("campaign_perf_summary", perfErr);
      const out: Record<string, { views: number; er: number; posts: number }> = {};
      for (const row of perfRows ?? []) {
        const views = Number(row.views || 0);
        const eng = Number(row.engagement || 0);
        out[row.campaign_id] = {
          views,
          posts: Number(row.posts || 0),
          er: views > 0 ? (eng / views) * 100 : 0,
        };
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
    const { error } = await (supabase.from("campaigns") as any).insert(payload);
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
        <div className="grid md:grid-cols-2 gap-6">
          {rows.map(r => {
            const isLive = r.status === "live";
            const cp = contestPerf[r.id];
            const hasContest = !!cp?.contests;
            return (
            <Link key={r.id} to={`/app/campaigns/${r.id}`} className="group">
              <Card className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-0 shadow-sm hover:shadow-elegant hover:-translate-y-1 transition-all duration-500 h-full flex flex-col">
                {/* Header */}
                <div className="p-7 pb-5">
                  <div className="flex justify-between items-start mb-6 gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative shrink-0">
                        <div className="absolute -inset-1.5 bg-gradient-to-tr from-primary to-accent rounded-2xl blur-md opacity-15 group-hover:opacity-35 transition-opacity" />
                        <div className="relative w-16 h-16 rounded-xl bg-white border border-border flex items-center justify-center p-2 shadow-sm overflow-hidden">
                          {r.clients?.logo_url ? (
                            <img src={r.clients.logo_url} alt={`${r.clients?.name} logo`} className="max-w-full max-h-full object-contain" loading="lazy" />
                          ) : (
                            <span className="font-display text-lg text-muted-foreground">{(r.clients?.name || "?").slice(0,2).toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-[0.22em] text-muted-foreground uppercase truncate">{r.clients?.name}</p>
                        <p className="text-[11px] font-semibold text-foreground/70 mt-0.5 uppercase tracking-wider">Brand Partner</p>
                      </div>
                    </div>
                    {isLive ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                        </span>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Live</span>
                      </div>
                    ) : (
                      <Badge className={`${statusColor[r.status]} shrink-0 uppercase text-[10px] tracking-widest font-bold px-3 py-1`}>{r.status}</Badge>
                    )}
                  </div>

                  <div className="flex items-start gap-1.5 mb-4">
                    <h2 className="font-display text-2xl md:text-[1.6rem] font-semibold text-foreground leading-[1.15] break-words flex-1 group-hover:text-primary transition-colors duration-300">
                      {r.name}
                    </h2>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing({ id: r.id, name: r.name }); }}
                      className="mt-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-label="Rename campaign"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleting({ id: r.id, name: r.name }); setDeleteConfirm(""); }}
                      className="mt-1 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-label="Delete campaign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>


                  <div className="flex flex-wrap items-center gap-3">
                    {r.hashtag && (
                      <div className="px-3 py-1 bg-secondary rounded-lg">
                        <span className="text-xs font-semibold text-foreground/80 tracking-tight">{r.hashtag.startsWith("#") ? r.hashtag : `#${r.hashtag}`}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Budget</span>
                      <span className="text-xs font-bold text-foreground tabular-nums">KES {Number(r.budget_kes).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* KPI strip */}
                <div className="mx-5 mb-5 rounded-2xl bg-foreground text-background p-6 flex items-center justify-between shadow-lg mt-auto">
                  {hasContest ? (
                    <>
                      <Stat label="Contestants" value={fmtNum(cp.contestants)} />
                      <Divider />
                      <Stat label="Entries" value={fmtNum(cp.entries)} />
                      <Divider />
                      <Stat label="Views" value={fmtNum(cp.views)} />
                    </>
                  ) : (
                    <>
                      <Stat label="Views" value={fmtNum(perf[r.id]?.views ?? 0)} />
                      <Divider />
                      <Stat label="Engagement" value={`${(perf[r.id]?.er ?? 0).toFixed(1)}`} suffix="%" />
                      <Divider />
                      <Stat label="Posts" value={String(perf[r.id]?.posts ?? 0)} />
                    </>
                  )}
                </div>

                {/* Accent bar */}
                <div className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary" />
              </Card>
            </Link>
            );
          })}
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
