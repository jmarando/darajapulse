import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Plus, Copy, ExternalLink, RefreshCw, Check, X, Crown, Download, Trash2, Pencil, Link2, Users, Sparkles, Instagram, Music2, Upload, Eye, Heart, MessageCircle, Facebook, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { canonicalPostUrl, cleanHandle as cleanH } from "@/lib/postUrl";

const PLATFORMS = ["tiktok","instagram","youtube","twitter","facebook"];

export const ContestsSection = ({ campaignId }: { campaignId: string }) => {
  const [contests, setContests] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [creatorHandles, setCreatorHandles] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [polling, setPolling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastRun, setLastRun] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", hashtag: "#", platforms: ["tiktok"], start_date: "", end_date: "", round_days: 14, prize: "" });
  const [entry, setEntry] = useState<any>({ platform: "tiktok", post_url: "", handle: "", likes: 0, comments: 0, shares: 0, views: 0 });
  const [editEntry, setEditEntry] = useState<any>(null);

  const scoreOf = (stats: { shares?: any; comments?: any; likes?: any }) =>
    Number(stats.shares || 0) * 3 + Number(stats.comments || 0) * 2 + Number(stats.likes || 0);
  // Per the contest rules: a contestant's score is the BEST single post — we do not sum across platforms.
  const bestScore = (e: any) => {
    const xs = Array.isArray(e.cross_posts) ? e.cross_posts : [];
    return Math.max(scoreOf(e), ...xs.map((x: any) => scoreOf(x)));
  };
  // Identify whether an entry was auto-fetched from a public scraper or entered/registered by a human.
  const AUTO_SOURCES = new Set(["meta_graph", "ensembledata", "tiktok_api", "instagram_api"]);
  const isAuto = (e: any) => AUTO_SOURCES.has(String(e.source || "").toLowerCase());

  const saveEditEntry = async () => {
    if (!editEntry) return;
    const cleanedCross = (editEntry.cross_posts || []).filter((x: any) => (x.post_url || "").trim());
    const score = bestScore({ ...editEntry, cross_posts: cleanedCross });
    const { error } = await supabase.from("contest_entries").update({
      handle: editEntry.handle,
      post_url: editEntry.post_url,
      platform: editEntry.platform,
      views: Number(editEntry.views) || 0,
      likes: Number(editEntry.likes) || 0,
      comments: Number(editEntry.comments) || 0,
      shares: Number(editEntry.shares) || 0,
      cross_posts: cleanedCross,
      score,
    }).eq("id", editEntry.id);
    if (error) return toast.error(error.message);
    toast.success("Entry updated");
    setEditEntry(null);
    load();
  };

  const load = async () => {
    const { data: cs } = await supabase.from("contests").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });
    setContests(cs ?? []);
    if (cs && cs.length && !activeId) setActiveId(cs[0].id);
    if (activeId || (cs && cs[0]?.id)) {
      const cid = activeId ?? cs![0].id;
      const { data: es } = await supabase.from("contest_entries").select("*").eq("contest_id", cid).order("score", { ascending: false });
      setEntries(es ?? []);
      const { data: lr } = await (supabase as any).from("contestant_sync_runs").select("*").eq("contest_id", cid).order("started_at", { ascending: false }).limit(1).maybeSingle();
      setLastRun(lr ?? null);
    }
    // Load campaign creators so we can exclude them from contestants.
    const { data: ci } = await supabase
      .from("campaign_influencers")
      .select("influencers(handle)")
      .eq("campaign_id", campaignId);
    const set = new Set<string>();
    for (const row of ci ?? []) {
      const h = cleanH((row as any).influencers?.handle);
      if (h) set.add(h);
    }
    setCreatorHandles(set);
  };

  const cleanHandle = (s?: string) =>
    (s || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase() || null;

  const pick = (row: any, ...keys: string[]) => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-#]/g, "");
    const lookup: Record<string, any> = {};
    for (const k of Object.keys(row)) lookup[norm(k)] = row[k];
    for (const k of keys) {
      const v = lookup[norm(k)];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };

  const uploadCsv = async (file: File) => {
    if (!activeId) return toast.error("Pick a contest first");
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = (parsed.data as any[]).filter(Boolean);
      if (!rows.length) { toast.error("No rows in CSV"); return; }

      const upserts = rows.map((r, i) => {
        const ig = cleanHandle(pick(r, "instagram", "instagram handle", "ig"));
        const tt = cleanHandle(pick(r, "tiktok", "tiktok handle"));
        const fb = cleanHandle(pick(r, "facebook", "facebook handle", "fb"));
        const ext = pick(r, "response", "response #", "id", "submission id", "registration id") || `csv-${Date.now()}-${i}`;
        return {
          contest_id: activeId,
          external_registration_id: String(ext),
          platform: (tt ? "tiktok" : ig ? "instagram" : "facebook") as any,
          status: "registered",
          source: "registration",
          full_name: pick(r, "full name", "name", "fullname"),
          submitter_name: pick(r, "full name", "name", "fullname"),
          submitter_email: pick(r, "email", "email address"),
          phone: pick(r, "phone", "phone number", "mobile"),
          address: pick(r, "address"),
          lga: pick(r, "lga", "local government area"),
          instagram_handle: ig,
          tiktok_handle: tt,
          facebook_handle: fb,
          handle: ig || tt || fb,
          metadata: { raw: r },
        };
      }).filter(r => r.submitter_email || r.instagram_handle || r.tiktok_handle || r.facebook_handle || r.phone);

      if (!upserts.length) { toast.error("No valid contestants found in CSV"); return; }

      const chunkSize = 200;
      let ok = 0;
      const errors: string[] = [];
      for (let i = 0; i < upserts.length; i += chunkSize) {
        const chunk = upserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("contest_entries")
          .upsert(chunk, { onConflict: "contest_id,external_registration_id", ignoreDuplicates: false });
        if (error) errors.push(error.message); else ok += chunk.length;
      }
      await (supabase as any).from("contestant_sync_runs").insert({
        contest_id: activeId, source: "csv_upload", triggered_by: "manual",
        fetched: rows.length, upserted: ok, status: errors.length ? "partial" : "ok",
        errors: errors.map(msg => ({ msg })), finished_at: new Date().toISOString(),
      });
      if (errors.length) toast.error(`Upserted ${ok}/${upserts.length} — ${errors[0]}`);
      else toast.success(`Imported ${ok} contestants from CSV`);
      load();
    } catch (e: any) {
      toast.error(e.message || "CSV upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const syncContestants = async () => {
    if (!activeId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("contestants-sync", { body: { contest_id: activeId, triggered_by: "manual" } });
      if (error) toast.error(error.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else toast.success(`Synced ${(data as any)?.upserted ?? 0} contestants`);
      load();
    } finally { setSyncing(false); }
  };

  const discoverPosts = async (only_handle?: string) => {
    if (!activeId) return;
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("contest-discover-posts", { body: { contest_id: activeId, triggered_by: "manual", only_handle } });
      if (error) toast.error(error.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else toast.success(`Found ${(data as any)?.upserted ?? 0} matching posts`);
      load();
    } finally { setDiscovering(false); }
  };

  const fetchByHandle = async (only_handle?: string) => {
    if (!activeId) return;
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("contest-fetch-handle-posts", { body: { contest_id: activeId, triggered_by: "manual", only_handle } });
      if (error) toast.error(error.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else toast.success(`Updated ${(data as any)?.upserted ?? 0} contestants from their handles`);
      load();
    } finally { setDiscovering(false); }
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
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement</div>
          <h2 className="font-display text-2xl flex items-center gap-2 mt-0.5"><Trophy className="w-5 h-5 text-highlight" /> Hashtag contests</h2>
          <p className="text-xs text-muted-foreground mt-1">Biweekly winners by weighted engagement (shares×3 + comments×2 + likes×1).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {active && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv(f); }} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className={`w-3 h-3 mr-1 ${uploading ? "animate-pulse" : ""}`} /> {uploading ? "Uploading…" : "Upload CSV"}
              </Button>
            </>
          )}
          {active && <Button size="sm" variant="outline" onClick={() => discoverPosts()} disabled={discovering}><Sparkles className={`w-3 h-3 mr-1 ${discovering ? "animate-pulse" : ""}`} /> Discover posts</Button>}
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
          {/* Only show the contest switcher if there are multiple — otherwise it's clutter */}
          {contests.length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {contests.map(c => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${activeId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                  {c.name} <span className="opacity-60 ml-1 font-mono text-xs">{c.hashtag}</span>
                </button>
              ))}
            </div>
          )}

          {active && (() => {
            // Parse a prize string like "Mega: X • 1st R/U: Y • 2nd R/U: Z" into structured rows.
            const fmtDate = (s?: string) => {
              if (!s) return "—";
              const d = new Date(s);
              return isNaN(+d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            };
            const days = Math.max(0, Math.ceil((+new Date(active.end_date) - +new Date(active.start_date)) / 86400000));
            const prizeParts = (active.prize || "")
              .split(/\s*[•·]\s*/)
              .map((s: string) => s.trim())
              .filter(Boolean);
            const today = new Date();
            const isLive = today >= new Date(active.start_date) && today <= new Date(active.end_date);
            return (
              <div className="rounded-lg border border-border bg-card overflow-hidden mb-4">
                {/* Hero strip */}
                <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl truncate">{active.name}</h3>
                      <Badge variant={isLive ? "default" : "outline"} className={`text-[10px] ${isLive ? "bg-success text-success-foreground hover:bg-success" : ""}`}>{isLive ? "Live" : "Scheduled"}</Badge>
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-secondary/60 border border-border font-mono break-all">
                      <Trophy className="w-3 h-3 shrink-0 text-highlight" />
                      <span className="truncate">{active.hashtag}</span>
                    </div>
                  </div>
                  <div className="flex gap-6 text-sm shrink-0">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Window</div>
                      <div className="mt-0.5 font-medium">{fmtDate(active.start_date)} → {fmtDate(active.end_date)}</div>
                      <div className="text-[11px] text-muted-foreground">{days} days · rounds of {active.round_days}</div>
                    </div>
                  </div>
                </div>

                {/* Prize breakdown */}
                {prizeParts.length > 0 && (
                  <div className="px-5 py-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Prizes per round</div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {prizeParts.map((part: string, idx: number) => {
                        const [labelRaw, ...rest] = part.split(":");
                        const hasLabel = rest.length > 0;
                        const label = hasLabel ? labelRaw.trim() : `Prize ${idx + 1}`;
                        const value = hasLabel ? rest.join(":").trim() : part;
                        const isMega = /mega/i.test(label);
                        return (
                          <div key={idx} className={`p-3 rounded-md border ${isMega ? "border-accent/40 bg-accent/5" : "border-border bg-secondary/30"}`}>
                            <div className={`text-[10px] uppercase tracking-widest ${isMega ? "text-accent" : "text-muted-foreground"}`}>{label}</div>
                            <div className="text-sm mt-1 leading-snug">{value}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {active && (
            <>

              <div className="flex items-center justify-end gap-2 mb-4">
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

              {lastRun && (
                <div className="text-[11px] text-muted-foreground mb-3">
                  Last sync: {new Date(lastRun.started_at).toLocaleString()} · {lastRun.source} · {lastRun.upserted ?? 0} upserted{Array.isArray(lastRun.errors) && lastRun.errors.length ? ` · ${lastRun.errors.length} error(s)` : ""}
                </div>
              )}

              {/* Contestants grouped view */}
              {(() => {
                const isCreator = (e: any) => {
                  const hs = [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle].map(cleanH).filter(Boolean);
                  return hs.some(h => creatorHandles.has(h));
                };
                const groups = new Map<string, any[]>();
                for (const e of entries) {
                  if (isCreator(e)) continue;
                  const key = (e.external_registration_id || cleanH(e.handle) || e.submitter_email || e.id) as string;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(e);
                }
                const contestants = Array.from(groups.entries()).map(([key, rows]) => {
                  const reg = rows.find(r => r.source === "registration") || rows[0];
                  // Dedupe posts by canonical URL — keep the highest-engagement row per video.
                  const byUrl = new Map<string, any>();
                  for (const r of rows) {
                    if (!r.post_url) continue;
                    const cu = canonicalPostUrl(r.post_url);
                    const prev = byUrl.get(cu);
                    if (!prev || scoreOf(r) > scoreOf(prev)) byUrl.set(cu, r);
                  }
                  const posts = Array.from(byUrl.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
                  // Per contest rules: score is the BEST single post (not summed across platforms).
                  const best = posts[0];
                  const total = best ? scoreOf(best) : 0;
                  return { key, reg, posts, total, bestId: best?.id };
                }).sort((a, b) => b.total - a.total);
                if (contestants.length === 0) return null;
                return (
                  <div className="mb-6">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Contestants ({contestants.length})</div>
                    <div className="grid md:grid-cols-2 gap-3">
                      {contestants.slice(0, 12).map(({ key, reg, posts, total, bestId }, i) => {
                        const rank = i + 1;
                        const isTop3 = rank <= 3;
                        return (
                        <div key={key} className={`p-4 rounded-lg border bg-card transition-colors ${isTop3 ? "border-accent/40 shadow-sm" : "border-border"}`}>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className={`text-[11px] font-semibold ${isTop3 ? "text-accent" : "text-muted-foreground"}`}>#{rank}</div>
                              <div className="font-medium truncate mt-0.5">{reg.full_name || reg.submitter_name || reg.handle || "Contestant"}</div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
                                {reg.instagram_handle && <span className="inline-flex items-center gap-1"><Instagram className="w-3 h-3" />@{reg.instagram_handle}</span>}
                                {reg.tiktok_handle && <span className="inline-flex items-center gap-1"><Music2 className="w-3 h-3" />@{reg.tiktok_handle}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best score</div>
                              <div className={`font-display text-2xl font-semibold tabular-nums ${isTop3 ? "text-accent" : ""}`}>{Math.round(total).toLocaleString()}</div>
                              {posts.length > 1 && <div className="text-[10px] text-muted-foreground mt-0.5">of {posts.length} posts</div>}
                            </div>
                          </div>
                          {posts.length === 0 ? (
                            <div className="flex items-center justify-between text-xs text-muted-foreground italic">
                              No matching posts yet.
                              <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={discovering} onClick={() => discoverPosts(reg.instagram_handle || reg.tiktok_handle)}>
                                <Sparkles className="w-3 h-3 mr-1" /> Find posts
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-1.5 border-t border-border/60 pt-2">
                              {posts.map(p => {
                                const PIcon = p.platform === "instagram" ? Instagram : p.platform === "tiktok" ? Music2 : Link2;
                                const isBest = p.id === bestId;
                                const auto = isAuto(p);
                                return (
                                <a key={p.id} href={p.post_url} target="_blank" rel="noreferrer" title={`Open post on ${p.platform}`} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs rounded px-1.5 py-1 transition-colors ${isBest ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-secondary/50"}`}>
                                  <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
                                    <PIcon className="w-3 h-3" />{p.platform}
                                    {isBest && <Crown className="w-3 h-3 text-highlight" aria-label="Counted score" />}
                                    <span className={`text-[9px] uppercase tracking-wider px-1 rounded ${auto ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>{auto ? "Auto" : "Manual"}</span>
                                  </span>
                                  <span className="tabular-nums text-muted-foreground flex items-center justify-end gap-3">
                                    <span className="inline-flex items-center gap-1" title="Views"><Eye className="w-3 h-3" />{(p.views || 0).toLocaleString()}</span>
                                    <span className="inline-flex items-center gap-1" title="Likes"><Heart className="w-3 h-3" />{(p.likes || 0).toLocaleString()}</span>
                                    <span className="inline-flex items-center gap-1" title="Comments"><MessageCircle className="w-3 h-3" />{(p.comments || 0).toLocaleString()}</span>
                                  </span>
                                  <span className={`font-semibold tabular-nums w-14 text-right ${isBest ? "text-accent" : "text-muted-foreground"}`}>{Math.round(scoreOf(p)).toLocaleString()}</span>
                                </a>
                              );})}
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                  </div>
                );
              })()}

              {entries.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-md text-sm text-muted-foreground">No entries yet. Click "Sync contestants" to pull registrations, then "Discover posts" to find their #{active.hashtag.replace(/^#/, "")} entries on IG/TikTok.</div>
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
                              <th className="text-left px-3 py-2">Contestant</th>
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
                            {rows.sort((a, b) => bestScore(b) - bestScore(a)).map((e, i) => {
                              const xs = Array.isArray(e.cross_posts) ? e.cross_posts : [];
                              const auto = isAuto(e);
                              return (
                              <tr key={e.id} className="border-t border-border">
                                <td className="px-3 py-2 tabular-nums">{i + 1}{e.status === "winner" && <Crown className="inline w-4 h-4 text-highlight ml-1" />}</td>
                                <td className="px-3 py-2">
                                  <a href={e.post_url} target="_blank" rel="noreferrer" className="hover:text-accent">{e.handle || e.submitter_name || "—"}</a>
                                  <span className={`ml-2 text-[9px] uppercase tracking-wider px-1 rounded ${auto ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>{auto ? "Auto" : "Manual"}</span>
                                  {xs.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1"><Link2 className="w-3 h-3" />{xs.length} other post{xs.length === 1 ? "" : "s"} (best wins)</div>}
                                </td>
                                <td className="px-3 py-2 capitalize text-muted-foreground">
                                  {e.platform}{xs.length > 0 && <div className="text-[10px]">+{Array.from(new Set(xs.map((x: any) => x.platform))).join(", ")}</div>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.views || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.likes || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.comments || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(e.shares || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{Math.round(bestScore(e))}</td>
                                <td className="px-3 py-2 text-right"><Badge variant="outline" className="capitalize">{e.status}</Badge></td>
                                <td className="px-3 py-2 text-right">
                                  <div className="inline-flex gap-1">
                                    {e.status === "pending" && (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setStatus(e.id, "rejected")}><X className="w-4 h-4" /></Button>
                                        <Button size="icon" className="h-7 w-7 bg-primary" onClick={() => setStatus(e.id, "approved")}><Check className="w-4 h-4" /></Button>
                                      </>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditEntry({ ...e, cross_posts: Array.isArray(e.cross_posts) ? e.cross_posts : [] })} aria-label="Edit entry"><Pencil className="w-4 h-4" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteEntry(e)} aria-label="Delete contest entry"><Trash2 className="w-4 h-4" /></Button>
                                  </div>
                                </td>
                              </tr>
                            );})}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Public submission link — moved to the bottom so the leaderboard leads */}
              <div className="mt-6 flex items-center gap-2 p-3 rounded-md bg-accent/10 border border-accent/30 flex-wrap">
                <div className="text-xs flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Public submission link</div>
                  <div className="font-mono text-xs truncate">{submitUrl}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(submitUrl); toast.success("Copied"); }}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                <Button size="sm" variant="outline" asChild><a href={submitUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 mr-1" /> Open</a></Button>
              </div>
            </>
          )}
        </>
      )}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit contest entry</DialogTitle></DialogHeader>
          {editEntry && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-secondary/40 border border-border">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Original post</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Platform</Label>
                    <Select value={editEntry.platform} onValueChange={v => setEditEntry({ ...editEntry, platform: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Handle</Label><Input value={editEntry.handle || ""} onChange={e => setEditEntry({ ...editEntry, handle: e.target.value })} /></div>
                </div>
                <div className="mt-2"><Label>Post URL</Label><Input value={editEntry.post_url || ""} onChange={e => setEditEntry({ ...editEntry, post_url: e.target.value })} /></div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  <div><Label>Views</Label><Input type="number" value={editEntry.views ?? 0} onChange={e => setEditEntry({ ...editEntry, views: e.target.value })} /></div>
                  <div><Label>Likes</Label><Input type="number" value={editEntry.likes ?? 0} onChange={e => setEditEntry({ ...editEntry, likes: e.target.value })} /></div>
                  <div><Label>Comments</Label><Input type="number" value={editEntry.comments ?? 0} onChange={e => setEditEntry({ ...editEntry, comments: e.target.value })} /></div>
                  <div><Label>Shares</Label><Input type="number" value={editEntry.shares ?? 0} onChange={e => setEditEntry({ ...editEntry, shares: e.target.value })} /></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Crossposts</div>
                    <p className="text-xs text-muted-foreground">Add the same video on other platforms — stats will roll into the total score.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditEntry({ ...editEntry, cross_posts: [...(editEntry.cross_posts || []), { platform: "instagram", post_url: "", views: 0, likes: 0, comments: 0, shares: 0 }] })}>
                    <Plus className="w-3 h-3 mr-1" /> Add crosspost
                  </Button>
                </div>
                {(editEntry.cross_posts || []).length === 0 && <div className="text-xs text-muted-foreground italic">No crossposts yet.</div>}
                <div className="space-y-3">
                  {(editEntry.cross_posts || []).map((x: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-md border border-border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Crosspost #{idx + 1}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                          const next = [...editEntry.cross_posts];
                          next.splice(idx, 1);
                          setEditEntry({ ...editEntry, cross_posts: next });
                        }}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-xs">Platform</Label>
                          <Select value={x.platform} onValueChange={v => {
                            const next = [...editEntry.cross_posts]; next[idx] = { ...next[idx], platform: v }; setEditEntry({ ...editEntry, cross_posts: next });
                          }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2"><Label className="text-xs">Post URL</Label>
                          <Input value={x.post_url || ""} onChange={e => {
                            const next = [...editEntry.cross_posts]; next[idx] = { ...next[idx], post_url: e.target.value }; setEditEntry({ ...editEntry, cross_posts: next });
                          }} placeholder="https://..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {["views","likes","comments","shares"].map(field => (
                          <div key={field}><Label className="text-xs capitalize">{field}</Label>
                            <Input type="number" value={x[field] ?? 0} onChange={e => {
                              const next = [...editEntry.cross_posts]; next[idx] = { ...next[idx], [field]: e.target.value }; setEditEntry({ ...editEntry, cross_posts: next });
                            }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-md bg-primary/10 border border-primary/30">
                <div className="text-sm">Best post score (counts toward leaderboard)</div>
                <div className="font-display text-2xl font-semibold">{Math.round(bestScore({ ...editEntry, cross_posts: (editEntry.cross_posts || []).filter((x: any) => (x.post_url || "").trim()) }))}</div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
                <Button className="bg-primary" onClick={saveEditEntry}>Save changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
