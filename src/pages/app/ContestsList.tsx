import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Plus, Users, Eye, Hash, ArrowUpRight, Calendar } from "lucide-react";
import { toast } from "sonner";

const fmtNum = (n: number) => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const fmtDate = (s?: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(+d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const ContestsList = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, { entries: number; contestants: number; views: number }>>({});
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    name: "", hashtag: "#", platforms: "tiktok",
    start_date: "", end_date: "", round_days: 14, prize: "",
    campaign_id: "none", client_id: "none",
  });

  const load = async () => {
    const { data } = await supabase
      .from("contests")
      .select("*, campaigns(id, name, clients(id, name, logo_url)), clients(id, name, logo_url)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: es } = await supabase
        .from("contest_entries")
        .select("contest_id, handle, views, status");
      const s: Record<string, { entries: number; contestants: number; views: number; handles: Set<string> }> = {};
      for (const e of es ?? []) {
        if (!ids.includes(e.contest_id)) continue;
        const cur = s[e.contest_id] ?? { entries: 0, contestants: 0, views: 0, handles: new Set<string>() };
        cur.entries += 1;
        cur.views += Number(e.views || 0);
        if (e.handle) cur.handles.add(String(e.handle).toLowerCase());
        s[e.contest_id] = cur;
      }
      const out: Record<string, { entries: number; contestants: number; views: number }> = {};
      for (const [k, v] of Object.entries(s)) out[k] = { entries: v.entries, contestants: v.handles.size, views: v.views };
      setStats(out);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!open) return;
    supabase.from("campaigns").select("id, name, client_id, clients(name)").order("created_at", { ascending: false })
      .then(({ data }) => setCampaigns(data ?? []));
    supabase.from("clients").select("id, name").order("name")
      .then(({ data }) => setClients(data ?? []));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: form.name,
      hashtag: form.hashtag,
      platforms: form.platforms.split(",").map((s: string) => s.trim()).filter(Boolean),
      start_date: form.start_date,
      end_date: form.end_date,
      round_days: Number(form.round_days) || 14,
      prize: form.prize || null,
      campaign_id: form.campaign_id === "none" ? null : form.campaign_id,
      client_id: form.client_id === "none" ? null : form.client_id,
    };
    const { data, error } = await supabase.from("contests").insert(payload).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Contest created");
    setOpen(false);
    setForm({ name: "", hashtag: "#", platforms: "tiktok", start_date: "", end_date: "", round_days: 14, prize: "", campaign_id: "none", client_id: "none" });
    load();
    if (data?.id) window.location.assign(`/app/contests/${data.id}`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8 gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Engagement</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Contests</h1>
          <p className="text-sm text-muted-foreground mt-1">Hashtag contests run standalone or alongside a campaign.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-primary"><Plus className="w-4 h-4 mr-2" /> New contest</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">New contest</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Royco #JustParadise" /></div>
              <div><Label>Hashtag</Label><Input required value={form.hashtag} onChange={(e) => setForm({ ...form, hashtag: e.target.value })} placeholder="#JustParadise" /></div>
              <div><Label>Platforms (comma separated)</Label>
                <Input value={form.platforms} onChange={(e) => setForm({ ...form, platforms: e.target.value })} placeholder="tiktok,instagram,facebook" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>End</Label><Input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Round length (days)</Label><Input type="number" min="1" value={form.round_days} onChange={(e) => setForm({ ...form, round_days: Number(e.target.value) })} /></div>
                <div><Label>Prize</Label><Input value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="Holiday for 2" /></div>
              </div>
              <div>
                <Label>Campaign (optional)</Label>
                <Select value={form.campaign_id} onValueChange={(v) => setForm({ ...form, campaign_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Standalone (no campaign)</SelectItem>
                    {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.clients?.name} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.campaign_id === "none" && (
                <div>
                  <Label>Client (for branding)</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full bg-primary">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Trophy className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No contests yet</h3>
          <p className="text-sm text-muted-foreground mt-2">Spin up a hashtag contest to start collecting entries.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((r) => {
            const today = new Date();
            const isLive = today >= new Date(r.start_date) && today <= new Date(r.end_date);
            const client = r.clients ?? r.campaigns?.clients;
            const st = stats[r.id] ?? { entries: 0, contestants: 0, views: 0 };
            return (
              <Link key={r.id} to={`/app/contests/${r.id}`}>
                <Card className="p-5 hover:shadow-elegant transition-all hover:-translate-y-0.5 group h-full">
                  <div className="flex items-start gap-3">
                    {client?.logo_url ? (
                      <div className="w-11 h-11 rounded-md bg-white border border-border shrink-0 flex items-center justify-center overflow-hidden">
                        <img src={client.logo_url} alt={`${client?.name} logo`} className="max-w-[80%] max-h-[80%] object-contain" loading="lazy" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-md bg-muted shrink-0 flex items-center justify-center text-xs font-display text-muted-foreground">
                        <Trophy className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground truncate">
                        {client?.name ?? "Standalone"} {r.campaigns?.name && <span className="normal-case tracking-normal">· {r.campaigns.name}</span>}
                      </div>
                      <div className="font-display text-xl mt-0.5 leading-tight break-words">{r.name}</div>
                    </div>
                    <Badge variant={isLive ? "default" : "outline"} className={`shrink-0 ${isLive ? "bg-success text-success-foreground hover:bg-success" : ""}`}>
                      {isLive ? "Live" : (today > new Date(r.end_date) ? "Ended" : "Scheduled")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{(r.hashtag || "").replace(/^#/, "")}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3">
                    <div>
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Users className="w-3 h-3" /> Contestants</div>
                      <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(st.contestants)}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Trophy className="w-3 h-3" /> Entries</div>
                      <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(st.entries)}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Eye className="w-3 h-3" /> Views</div>
                      <div className="font-display text-lg mt-0.5 tabular-nums">{fmtNum(st.views)}</div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContestsList;
