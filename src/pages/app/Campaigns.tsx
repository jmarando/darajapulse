import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dash/PageHeader";
import { StatusChip, type Tone } from "@/components/dash/chips";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Megaphone, ArrowUpRight, Eye, BarChart3, FileText, Trophy, Users, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";


const fmtNum = (n: number) => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

type ContestPerf = { contests: number; contestants: number; entries: number; views: number };

const Stat = ({ label, value, suffix }: { label: string; value: string; suffix?: string }) => (
  <div className="min-w-0 flex-1 px-4 first:pl-0 last:pr-0">
    <div className="text-[12px] text-muted-foreground">{label}</div>
    <div className="mt-1 flex items-baseline gap-0.5">
      <span className="text-[26px] font-normal leading-none tracking-[-0.03em]">{value}</span>
      {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);

const STATUS_TONE: Record<string, Tone> = { live: "good", won: "good", reporting: "info", pitched: "neutral", draft: "warn", closed: "neutral" };

const Campaigns = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [perf, setPerf] = useState<Record<string, { views: number; er: number; posts: number }>>({});
  const [rosterCount, setRosterCount] = useState<Record<string, number>>({});
  const [perfLoaded, setPerfLoaded] = useState(false);
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
    const [{ data }, { data: cs }] = await Promise.all([
      supabase.from("campaigns").select("*, clients(name, logo_url)").order("created_at", { ascending: false }),
      supabase.from("clients").select("id,name"),
    ]);
    setRows(data ?? []);
    setClients(cs ?? []);

    const ids = (data ?? []).map((c) => c.id);
    if (!ids.length) {
      setPerf({});
      setPerfLoaded(true);
      setContestPerf({});
      return;
    }

    // Per-campaign performance preview and contest aggregates run in parallel.
    const [{ data: perfRows, error: perfErr }, { data: ctsts }, { data: roster }] = await Promise.all([
      (supabase as any).rpc("campaign_perf_summary", { campaign_ids: ids }),
      supabase.from("contests").select("id, campaign_id").in("campaign_id", ids),
      supabase.from("campaign_influencers").select("campaign_id").in("campaign_id", ids).limit(10000),
    ]);
    const rc: Record<string, number> = {};
    for (const r of roster ?? []) rc[r.campaign_id] = (rc[r.campaign_id] || 0) + 1;
    setRosterCount(rc);

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
    setPerfLoaded(true);

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

  const doDelete = async () => {
    if (!deleting || deleteConfirm !== "DELETE") return;
    setDeletingNow(true);
    const { error } = await supabase.from("campaigns").delete().eq("id", deleting.id);
    setDeletingNow(false);
    if (error) return toast.error(error.message);
    toast.success("Campaign deleted");
    setDeleting(null);
    setDeleteConfirm("");
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
    <div className="w-full min-w-0 max-w-7xl mx-auto px-4 py-6 sm:p-8">
      <PageHeader
        title="Campaigns"
        subtitle={rows.length ? `${rows.length} campaign${rows.length === 1 ? "" : "s"}, ${rows.filter((r) => r.status === "live").length} live` : undefined}
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-primary shrink-0" disabled={clients.length === 0}><Plus className="w-4 h-4 mr-2" /> New campaign</Button></DialogTrigger>
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
        }
      />

      {clients.length === 0 && <Card className="p-4 mb-4 bg-secondary/50 text-sm">Add a client first to create a campaign.</Card>}

      {rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No campaigns yet</h3>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map(r => {
            const cp = contestPerf[r.id];
            const hasContest = !!cp?.contests;
            return (
            <Link key={r.id} to={`/app/campaigns/${r.id}`} className="group min-w-0">
              <Card className="relative flex h-full min-w-0 flex-col overflow-hidden p-0 transition-[box-shadow,background-color] duration-200 hover:bg-raised hover:shadow-elegant">
                {/* Header */}
                <div className="min-w-0 p-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border border-border/80 bg-raised p-1.5">
                          {r.clients?.logo_url ? (
                            <img src={r.clients.logo_url} alt={`${r.clients?.name} logo`} className="max-w-full max-h-full object-contain" loading="lazy" />
                          ) : (
                            <span className="text-[13px] font-medium text-muted-foreground">{(r.clients?.name || "?").slice(0,2).toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{r.clients?.name}</p>
                        <p className="text-[12px] text-muted-foreground">Brand partner</p>
                      </div>
                    </div>
                    <StatusChip tone={STATUS_TONE[r.status] ?? "neutral"} className="shrink-0 capitalize">{r.status}</StatusChip>
                  </div>

                  <div className="mb-3 flex items-start gap-1.5">
                    <h2 className="flex-1 break-words font-sans text-[20px] font-medium leading-snug tracking-[-0.015em] text-foreground">
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
                      <div className="rounded-full bg-secondary px-2.5 py-0.5">
                        <span className="text-[12px] text-foreground/80">{r.hashtag.startsWith("#") ? r.hashtag : `#${r.hashtag}`}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-muted-foreground">Budget</span>
                      <span className="text-[12px] font-medium tabular-nums text-foreground">KES {Number(r.budget_kes).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* KPI strip */}
                  <div className="mx-5 mb-5 mt-auto flex items-stretch divide-x divide-border/70 border-t border-border/70 pt-4 sm:mx-6">
                  {hasContest ? (
                    <>
                      <Stat label="Creators" value={fmtNum(Math.max(cp.contestants ?? 0, rosterCount[r.id] ?? 0))} />
                                            <Stat label="Posts" value={fmtNum(Math.max(cp.entries ?? 0, perf[r.id]?.posts ?? 0))} />
                                            <Stat label="Views" value={fmtNum(Math.max(cp.views ?? 0, perf[r.id]?.views ?? 0))} />
                    </>
                  ) : (
                    <>
                      <Stat label="Views" value={perfLoaded ? fmtNum(perf[r.id]?.views ?? 0) : "—"} />
                                            <Stat label="Engagement" value={perfLoaded ? `${(perf[r.id]?.er ?? 0).toFixed(1)}` : "—"} suffix={perfLoaded ? "%" : ""} />
                                            <Stat label="Posts" value={perfLoaded ? String(perf[r.id]?.posts ?? 0) : "—"} />
                    </>
                  )}
                </div>

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

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) { setDeleting(null); setDeleteConfirm(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display text-xl">Delete campaign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This permanently deletes <span className="font-semibold text-foreground">{deleting?.name}</span> and all its posts, creators, and metrics. This cannot be undone.
            </p>
            <div>
              <Label>Type <span className="font-mono font-bold">DELETE</span> to confirm</Label>
              <Input
                autoFocus
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doDelete(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setDeleting(null); setDeleteConfirm(""); }}>Cancel</Button>
              <Button variant="destructive" onClick={doDelete} disabled={deletingNow || deleteConfirm !== "DELETE"}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
};
export default Campaigns;
