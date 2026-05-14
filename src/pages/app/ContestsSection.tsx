import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Plus, Copy, ExternalLink, RefreshCw, Check, X, Crown, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PLATFORMS = ["tiktok","instagram","youtube","twitter","facebook"];

export const ContestsSection = ({ campaignId }: { campaignId: string }) => {
  const [contests, setContests] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [polling, setPolling] = useState(false);
  const [form, setForm] = useState<any>({ name: "", hashtag: "#", platforms: ["tiktok"], start_date: "", end_date: "", round_days: 14, prize: "" });
  const [entry, setEntry] = useState<any>({ platform: "tiktok", post_url: "", handle: "", likes: 0, comments: 0, shares: 0, views: 0 });

  const load = async () => {
    const { data: cs } = await supabase.from("contests").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });
    setContests(cs ?? []);
    if (cs && cs.length && !activeId) setActiveId(cs[0].id);
    if (activeId || (cs && cs[0]?.id)) {
      const cid = activeId ?? cs![0].id;
      const { data: es } = await supabase.from("contest_entries").select("*").eq("contest_id", cid).order("score", { ascending: false });
      setEntries(es ?? []);
    }
  };
  useEffect(() => { load(); }, [campaignId, activeId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("contests").insert({ ...form, campaign_id: campaignId });
    if (error) return toast.error(error.message);
    toast.success("Contest created"); setOpen(false);
    setForm({ name: "", hashtag: "#", platforms: ["tiktok"], start_date: "", end_date: "", round_days: 14, prize: "" });
    load();
  };

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) return;
    const score = Number(entry.shares || 0) * 3 + Number(entry.comments || 0) * 2 + Number(entry.likes || 0);
    const { error } = await supabase.from("contest_entries").insert({ ...entry, contest_id: activeId, status: "approved", source: "manual", score });
    if (error) return toast.error(error.message);
    toast.success("Entry added"); setEntryOpen(false);
    setEntry({ platform: "tiktok", post_url: "", handle: "", likes: 0, comments: 0, shares: 0, views: 0 });
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from("contest_entries").update({ status }).eq("id", id);
    load();
  };

  const deleteEntry = async (entryRow: any) => {
    const label = entryRow.handle || entryRow.post_url || "this entry";
    if (!confirm(`Delete ${label} from this contest? This cannot be undone.`)) return;
    const { error } = await supabase.from("contest_entries").delete().eq("id", entryRow.id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    load();
  };

  const refreshScores = async () => {
    if (!activeId) return;
    setPolling(true);
    try {
      const { error } = await supabase.functions.invoke("contest-poll", { body: { contest_id: activeId } });
      if (error) toast.error(error.message); else toast.success("Scores recalculated");
      load();
    } finally { setPolling(false); }
  };

  const active = contests.find(c => c.id === activeId);
  const submitUrl = active ? `${window.location.origin}/c/${active.submission_token}` : "";

  const byRound = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const e of entries) {
      const k = e.round_number || 1;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [entries]);

  const exportCsv = () => {
    if (!active || !entries.length) return toast.error("No entries to export");
    const headers = ["round","rank","handle","submitter_name","submitter_email","platform","post_url","views","likes","comments","shares","score","status","posted_at","created_at"];
    const ranked = byRound.flatMap(([round, rows]) =>
      rows.sort((a, b) => b.score - a.score).map((e, i) => ({ ...e, _round: round, _rank: i + 1 }))
    );
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = ranked.map(e => [
      e._round, e._rank, e.handle, e.submitter_name, e.submitter_email, e.platform, e.post_url,
      e.views ?? 0, e.likes ?? 0, e.comments ?? 0, e.shares ?? 0, Math.round(e.score ?? 0),
      e.status, e.posted_at ?? "", e.created_at ?? "",
    ].map(esc).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-entries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement</div>
          <h2 className="font-display text-2xl flex items-center gap-2"><Trophy className="w-5 h-5 text-highlight" /> Hashtag contests</h2>
          <p className="text-xs text-muted-foreground mt-1">Biweekly winners by weighted engagement (shares×3 + comments×2 + likes×1).</p>
        </div>
        <div className="flex gap-2">
          {active && entries.length > 0 && <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3 h-3 mr-1" /> Export CSV</Button>}
          {active && <Button size="sm" variant="outline" onClick={refreshScores} disabled={polling}><RefreshCw className={`w-3 h-3 mr-1 ${polling ? "animate-spin" : ""}`} /> Refresh scores</Button>}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-primary"><Plus className="w-3 h-3 mr-1" /> New contest</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create hashtag contest</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Royco #JustParadise" /></div>
                <div><Label>Hashtag</Label><Input required value={form.hashtag} onChange={e => setForm({ ...form, hashtag: e.target.value })} placeholder="#JustParadiseRoyco" /></div>
                <div><Label>Platforms (comma separated)</Label>
                  <Input value={form.platforms.join(",")} onChange={e => setForm({ ...form, platforms: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="tiktok,instagram,twitter,facebook" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start</Label><Input type="date" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div><Label>End</Label><Input type="date" required value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Round length (days)</Label><Input type="number" min="1" value={form.round_days} onChange={e => setForm({ ...form, round_days: Number(e.target.value) })} /></div>
                  <div><Label>Prize</Label><Input value={form.prize} onChange={e => setForm({ ...form, prize: e.target.value })} placeholder="Holiday for 2" /></div>
                </div>
                <Button type="submit" className="w-full bg-primary">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {contests.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-md">
          <p className="text-sm text-muted-foreground">No contests yet. Create one to start tracking hashtag entries.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {contests.map(c => (
              <button key={c.id} onClick={() => setActiveId(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm border ${activeId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                {c.name} <span className="opacity-60 ml-1 font-mono text-xs">{c.hashtag}</span>
              </button>
            ))}
          </div>

          {active && (
            <>
              <div className="grid md:grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-md bg-secondary/40 border border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Hashtag</div>
                  <div className="font-mono mt-1">{active.hashtag}</div>
                </div>
                <div className="p-3 rounded-md bg-secondary/40 border border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Window</div>
                  <div className="text-sm mt-1">{active.start_date} → {active.end_date}</div>
                </div>
                <div className="p-3 rounded-md bg-secondary/40 border border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Prize / round</div>
                  <div className="text-sm mt-1">{active.prize || "—"} · every {active.round_days} days</div>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-accent/10 border border-accent/30 flex-wrap">
                <div className="text-xs flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Public submission link</div>
                  <div className="font-mono text-xs truncate">{submitUrl}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(submitUrl); toast.success("Copied"); }}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                <Button size="sm" variant="outline" asChild><a href={submitUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 mr-1" /> Open</a></Button>
                <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
                  <DialogTrigger asChild><Button size="sm" className="bg-primary"><Plus className="w-3 h-3 mr-1" /> Log entry</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Log a contest entry</DialogTitle></DialogHeader>
                    <form onSubmit={addEntry} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Platform</Label>
                          <Select value={entry.platform} onValueChange={v => setEntry({ ...entry, platform: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Handle</Label><Input value={entry.handle} onChange={e => setEntry({ ...entry, handle: e.target.value })} placeholder="@user" /></div>
                      </div>
                      <div><Label>Post URL</Label><Input required value={entry.post_url} onChange={e => setEntry({ ...entry, post_url: e.target.value })} /></div>
                      <div className="grid grid-cols-4 gap-2">
                        <div><Label>Views</Label><Input type="number" value={entry.views} onChange={e => setEntry({ ...entry, views: e.target.value })} /></div>
                        <div><Label>Likes</Label><Input type="number" value={entry.likes} onChange={e => setEntry({ ...entry, likes: e.target.value })} /></div>
                        <div><Label>Comments</Label><Input type="number" value={entry.comments} onChange={e => setEntry({ ...entry, comments: e.target.value })} /></div>
                        <div><Label>Shares</Label><Input type="number" value={entry.shares} onChange={e => setEntry({ ...entry, shares: e.target.value })} /></div>
                      </div>
                      <Button type="submit" className="w-full bg-primary">Save entry</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {entries.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-md text-sm text-muted-foreground">No entries yet. Share the public link or log them manually.</div>
              ) : (
                <div className="space-y-5">
                  {byRound.map(([round, rows]) => (
                    <div key={round}>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Round {round}</div>
                      <div className="overflow-x-auto border border-border rounded-md">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
                            <tr>
                              <th className="text-left px-3 py-2">#</th>
                              <th className="text-left px-3 py-2">Creator</th>
                              <th className="text-left px-3 py-2">Platform</th>
                              <th className="text-right px-3 py-2">Views</th>
                              <th className="text-right px-3 py-2">Likes</th>
                              <th className="text-right px-3 py-2">Comments</th>
                              <th className="text-right px-3 py-2">Shares</th>
                              <th className="text-right px-3 py-2">Score</th>
                              <th className="text-right px-3 py-2">Status</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.sort((a, b) => b.score - a.score).map((e, i) => (
                              <tr key={e.id} className="border-t border-border">
                                <td className="px-3 py-2 tabular-nums">{i + 1}{e.status === "winner" && <Crown className="inline w-4 h-4 text-highlight ml-1" />}</td>
                                <td className="px-3 py-2"><a href={e.post_url} target="_blank" rel="noreferrer" className="hover:text-accent">{e.handle || e.submitter_name || "—"}</a></td>
                                <td className="px-3 py-2 capitalize text-muted-foreground">{e.platform}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.views ?? 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.likes ?? 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.comments ?? 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.shares ?? 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{Math.round(e.score)}</td>
                                <td className="px-3 py-2 text-right"><Badge variant="outline" className="capitalize">{e.status}</Badge></td>
                                <td className="px-3 py-2 text-right">
                                  <div className="inline-flex gap-1">
                                    {e.status === "pending" && (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setStatus(e.id, "rejected")}><X className="w-4 h-4" /></Button>
                                        <Button size="icon" className="h-7 w-7 bg-primary" onClick={() => setStatus(e.id, "approved")}><Check className="w-4 h-4" /></Button>
                                      </>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteEntry(e)} aria-label="Delete contest entry"><Trash2 className="w-4 h-4" /></Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
};
