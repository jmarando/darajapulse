import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, RefreshCw, Eye, MessageCircle, MousePointerClick, Trash2, CheckCircle2, ImageIcon, Radio } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1_000 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n || 0)));

// Monday-start week key
function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
const weekKey = (d: Date) => weekStart(d).toISOString().slice(0, 10);
const weekLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

type Props = {
  campaignId: string;
  roster: any[]; // campaign_influencers rows with influencers(full_name, handle)
  posts: any[];
  startDate?: string | null;
  endDate?: string | null;
};

const emptyForm = {
  influencer_id: "",
  platform: "instagram",
  posted_at: new Date().toISOString().slice(0, 16),
  reach: "",
  impressions: "",
  replies: "",
  link_clicks: "",
  permalink: "",
  notes: "",
};

export function StoriesSection({ campaignId, roster, posts, startDate, endDate }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(3); // stories per creator per week
  const [creatorFilter, setCreatorFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("stories")
      .select("*, influencers(full_name, handle)")
      .eq("campaign_id", campaignId)
      .order("posted_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const list = data ?? [];
    setRows(list);
    const paths = list.map((r: any) => r.media_url).filter((p: string | null) => p && !p.startsWith("http"));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("story-proofs").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s: any) => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
      setThumbs(map);
    }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.influencer_id) { toast.error("Pick a creator for this story"); return; }
    setSaving(true);
    try {
      let mediaPath: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${campaignId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("story-proofs").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        mediaPath = path;
      }
      const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v) || 0)));
      const postedAt = new Date(form.posted_at);
      const { error } = await supabase.from("stories").insert({
        campaign_id: campaignId,
        influencer_id: form.influencer_id,
        platform: form.platform as any,
        posted_at: postedAt.toISOString(),
        expires_at: new Date(postedAt.getTime() + 24 * 3600_000).toISOString(),
        reach: num(form.reach),
        impressions: num(form.impressions),
        replies: num(form.replies),
        link_clicks: num(form.link_clicks),
        permalink: form.permalink || null,
        notes: form.notes || null,
        media_url: mediaPath,
        source: "manual",
        verified: !!mediaPath,
      });
      if (error) throw error;
      toast.success("Story logged");
      setOpen(false);
      setForm({ ...emptyForm });
      setFile(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not save story");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    if (!window.confirm("Delete this story record?")) return;
    if (row.media_url && !String(row.media_url).startsWith("http")) {
      await supabase.storage.from("story-proofs").remove([row.media_url]);
    }
    const { error } = await supabase.from("stories").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const syncConnected = async () => {
    setSyncing(true);
    toast.loading("Pulling stories from connected accounts…", { id: "story-sync" });
    const { data, error } = await supabase.functions.invoke("stories-sync", { body: { campaign_id: campaignId } });
    setSyncing(false);
    if (error) { toast.error("Sync failed — see logs", { id: "story-sync" }); return; }
    toast.success(
      `${data?.captured ?? 0} story frame${(data?.captured ?? 0) === 1 ? "" : "s"} captured from ${data?.accounts ?? 0} connected account${(data?.accounts ?? 0) === 1 ? "" : "s"}`,
      { id: "story-sync" },
    );
    load();
  };

  const totals = useMemo(() => {
    const reach = rows.reduce((s, r) => s + (r.reach || 0), 0);
    const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    const replies = rows.reduce((s, r) => s + (r.replies || 0), 0);
    const clicks = rows.reduce((s, r) => s + (r.link_clicks || 0), 0);
    const thisWeek = rows.filter((r) => weekKey(new Date(r.posted_at)) === weekKey(new Date())).length;
    return { count: rows.length, reach, impressions, replies, clicks, thisWeek };
  }, [rows]);

  // ── weekly compliance grid ──────────────────────────────────────
  const grid = useMemo(() => {
    const from = startDate ? new Date(startDate) : rows.length ? new Date(rows[rows.length - 1].posted_at) : new Date();
    const rawTo = endDate ? new Date(endDate) : new Date();
    const to = rawTo > new Date() ? new Date() : rawTo;
    const weeks: string[] = [];
    let cur = weekStart(from);
    const guard = weekStart(to);
    while (cur <= guard && weeks.length < 26) {
      weeks.push(weekKey(cur));
      cur = new Date(cur.getTime() + 7 * 86400_000);
    }
    const storyCells = new Map<string, number>();
    for (const r of rows) storyCells.set(`${r.influencer_id}|${weekKey(new Date(r.posted_at))}`, (storyCells.get(`${r.influencer_id}|${weekKey(new Date(r.posted_at))}`) ?? 0) + 1);
    const postCells = new Map<string, number>();
    for (const p of posts) {
      const when = p.posted_at || p.created_at;
      if (!when || !p.influencer_id) continue;
      const k = `${p.influencer_id}|${weekKey(new Date(when))}`;
      postCells.set(k, (postCells.get(k) ?? 0) + 1);
    }
    return { weeks, storyCells, postCells };
  }, [rows, posts, startDate, endDate, posts.length]);

  const compliance = useMemo(() => {
    if (!grid.weeks.length || !roster.length) return 0;
    let met = 0;
    for (const r of roster) for (const w of grid.weeks) if ((grid.storyCells.get(`${r.influencer_id}|${w}`) ?? 0) >= target) met++;
    return Math.round((met / (roster.length * grid.weeks.length)) * 100);
  }, [grid, roster, target]);

  const visible = creatorFilter === "all" ? rows : rows.filter((r) => r.influencer_id === creatorFilter);

  return (
    <Card className="p-5 mb-6" id="stories-section">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Activity</div>
          <h2 className="font-display text-2xl flex items-center gap-2"><Radio className="w-5 h-5 text-highlight" /> Stories</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Stories vanish after 24h, so we capture them automatically from connected accounts and let the team log screenshots for everyone else.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={syncConnected} disabled={syncing}>
            <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync connected
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary" disabled={roster.length === 0}><Plus className="w-3 h-3 mr-1" /> Log story</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log a story</DialogTitle></DialogHeader>
              <form onSubmit={save} className="space-y-3">
                <div>
                  <Label>Creator</Label>
                  <Select value={form.influencer_id} onValueChange={(v) => setForm({ ...form, influencer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{roster.map((x) => <SelectItem key={x.influencer_id} value={x.influencer_id}>{x.influencers?.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Platform</Label>
                    <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Posted at</Label>
                    <Input type="datetime-local" value={form.posted_at} onChange={(e) => setForm({ ...form, posted_at: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Reach</Label><Input inputMode="numeric" value={form.reach} onChange={(e) => setForm({ ...form, reach: e.target.value })} placeholder="e.g. 4200" /></div>
                  <div><Label>Impressions</Label><Input inputMode="numeric" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} /></div>
                  <div><Label>Replies</Label><Input inputMode="numeric" value={form.replies} onChange={(e) => setForm({ ...form, replies: e.target.value })} /></div>
                  <div><Label>Link taps</Label><Input inputMode="numeric" value={form.link_clicks} onChange={(e) => setForm({ ...form, link_clicks: e.target.value })} /></div>
                </div>
                <div><Label>Story link (optional)</Label><Input value={form.permalink} onChange={(e) => setForm({ ...form, permalink: e.target.value })} placeholder="Highlight or archive link" /></div>
                <div>
                  <Label>Screenshot proof</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Upload the creator's insights screenshot — it marks the record as verified.</p>
                </div>
                <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button type="submit" className="w-full bg-primary" disabled={saving}>{saving ? "Saving…" : "Save story"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { l: "Stories", v: fmt(totals.count), s: `${totals.thisWeek} this week` },
          { l: "Reach", v: fmt(totals.reach), s: "sum of frames" },
          { l: "Impressions", v: fmt(totals.impressions), s: "sum of frames" },
          { l: "Replies", v: fmt(totals.replies), s: "direct replies" },
          { l: "Link taps", v: fmt(totals.clicks), s: "sticker clicks" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.l}</div>
            <div className="font-display text-xl mt-1">{k.v}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Weekly compliance grid */}
      {roster.length > 0 && grid.weeks.length > 0 && (
        <div className="rounded-lg border border-border p-4 mb-5 overflow-x-auto">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables</div>
              <div className="text-sm font-semibold">Weekly cadence · {compliance}% of creator-weeks on target</div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Stories / week</Label>
              <Input className="h-8 w-16" inputMode="numeric" value={String(target)} onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal py-1 pr-3 min-w-[140px]">Creator</th>
                {grid.weeks.map((w) => <th key={w} className="font-normal py-1 px-1 text-center whitespace-nowrap">{weekLabel(w)}</th>)}
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.influencer_id} className="border-t border-border">
                  <td className="py-1.5 pr-3 truncate max-w-[160px]">{r.influencers?.full_name}</td>
                  {grid.weeks.map((w) => {
                    const s = grid.storyCells.get(`${r.influencer_id}|${w}`) ?? 0;
                    const p = grid.postCells.get(`${r.influencer_id}|${w}`) ?? 0;
                    const tone = s >= target ? "bg-primary/20 text-primary border-primary/40" : s > 0 ? "bg-highlight/15 text-highlight border-highlight/30" : "bg-muted/50 text-muted-foreground border-border";
                    return (
                      <td key={w} className="py-1.5 px-1 text-center">
                        <div className={`inline-flex flex-col items-center justify-center rounded-md border px-2 py-1 tabular-nums ${tone}`} title={`${s} story frame${s === 1 ? "" : "s"} · ${p} post${p === 1 ? "" : "s"} in week of ${weekLabel(w)}`}>
                          <span className="font-semibold">{s}</span>
                          <span className="text-[9px] opacity-70">{p} post</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Story list */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Captured frames</div>
        <Select value={creatorFilter} onValueChange={setCreatorFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All creators</SelectItem>
            {roster.map((x) => <SelectItem key={x.influencer_id} value={x.influencer_id}>{x.influencers?.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-md">
          <p className="text-sm text-muted-foreground">No stories captured yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Sync connected accounts, or log a screenshot with reach from the creator's insights.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => {
            const src = r.media_url ? (String(r.media_url).startsWith("http") ? r.media_url : thumbs[r.media_url]) : null;
            return (
              <div key={r.id} className="rounded-lg border border-border overflow-hidden flex">
                <div className="w-20 shrink-0 bg-muted/50 flex items-center justify-center">
                  {src ? <img src={src} alt={`Story by ${r.influencers?.full_name ?? "creator"}`} loading="lazy" className="w-full h-full object-cover" />
                       : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="p-3 min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold truncate">{r.influencers?.full_name}</div>
                    <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Delete story"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {new Date(r.posted_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(r.reach || 0)}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(r.replies || 0)}</span>
                    <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3" />{fmt(r.link_clicks || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{r.platform}</Badge>
                    <Badge variant="outline" className="text-[10px]">{r.source === "manual" ? "Manual" : "Auto"}</Badge>
                    {r.verified && <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="w-3 h-3" /> Verified</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default StoriesSection;
