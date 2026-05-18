import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Users, Search, ShieldCheck, Link2, Pencil, ChevronDown, Instagram, Music2, Youtube, Twitter, Facebook, MapPin, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PlatformPicker } from "@/components/PlatformPicker";

// Compact formatter so big follower counts (e.g. 130,000) don't blow up a 3-col stat grid.
const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

const PLATFORM_ICON: Record<string, any> = { tiktok: Music2, instagram: Instagram, youtube: Youtube, twitter: Twitter, facebook: Facebook };

const blankForm = { full_name: "", handle: "", primary_platform: "tiktok", niche: "", follower_count: 0, engagement_rate: 0, region: "Kenya", phone_mpesa: "" };

const InlineNumber = ({ value, format, onSave, step = 1 }: { value: number; format: (v: number) => string; onSave: (v: number) => void; step?: number }) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { setEditing(false); const n = Number(v); if (!Number.isNaN(n) && n !== value) onSave(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); setEditing(false); } }}
        className="h-7 text-center font-display text-lg px-1"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="font-display text-lg w-full hover:bg-secondary rounded px-1 transition-colors truncate"
      title="Click to edit"
    >
      {format(value)}
    </button>
  );
};

const Influencers = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(blankForm);

  const load = async () => {
    const { data } = await supabase.from("influencers").select("*").order("follower_count", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditingId(null); setForm(blankForm); setOpen(true); };
  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      full_name: r.full_name ?? "",
      handle: r.handle ?? "",
      primary_platform: r.primary_platform ?? "tiktok",
      niche: r.niche ?? "",
      follower_count: r.follower_count ?? 0,
      engagement_rate: r.engagement_rate ?? 0,
      region: r.region ?? "Kenya",
      phone_mpesa: r.phone_mpesa ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, follower_count: Number(form.follower_count), engagement_rate: Number(form.engagement_rate) };
    if (editingId) {
      const { error } = await (supabase.from("influencers") as any).update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Influencer updated");
    } else {
      const { error } = await supabase.from("influencers").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Influencer added");
    }
    setOpen(false); load();
  };

  const updateField = async (id: string, field: string, value: number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    const { error } = await (supabase.from("influencers") as any).update({ [field]: value }).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };

  const copyInvite = (r: any, platform: string) => {
    const link = `${window.location.origin}/connect/${platform}/${r.id}`;
    navigator.clipboard.writeText(link);
    toast.success(`${platform === "tiktok" ? "TikTok" : "Instagram"} invite link copied`);
  };

  const filtered = rows.filter(r => !q || r.full_name.toLowerCase().includes(q.toLowerCase()) || (r.handle ?? "").toLowerCase().includes(q.toLowerCase()) || (r.niche ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Discovery</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Influencer roster</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); } }}>
          <DialogTrigger asChild><Button className="bg-primary" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add influencer</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">{editingId ? "Edit influencer" : "Add to roster"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Full name</Label><Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label>Handle</Label><Input value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} placeholder="@..." /></div>
              </div>
              <div className="col-span-2">
                <Label>Platform</Label>
                <PlatformPicker value={form.primary_platform} onChange={v => setForm({ ...form, primary_platform: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Niche</Label><Input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} placeholder="Food / Beauty / Comedy" /></div>
                <div><Label>Followers</Label><Input type="number" value={form.follower_count} onChange={e => setForm({ ...form, follower_count: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Engagement %</Label><Input type="number" step="0.1" value={form.engagement_rate} onChange={e => setForm({ ...form, engagement_rate: e.target.value })} /></div>
                <div><Label>Region</Label><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></div>
              </div>
              <div><Label>M-Pesa phone</Label><Input value={form.phone_mpesa} onChange={e => setForm({ ...form, phone_mpesa: e.target.value })} placeholder="2547..." /></div>
              <Button type="submit" className="w-full bg-primary">{editingId ? "Save changes" : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, handle, niche…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-16 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No influencers in your roster</h3>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => {
            const primary = (r.primary_platform as string) || "tiktok";
            return (
            <Card key={r.id} className="p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 shrink-0 rounded-full bg-secondary flex items-center justify-center font-display text-lg">{r.full_name?.[0] ?? "?"}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg truncate" title={r.full_name}>{r.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate" title={`${r.handle ?? ""} · ${primary}`}>
                      {r.handle ? `${r.handle} · ` : ""}{primary}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="gap-1"><ShieldCheck className="w-3 h-3" /> {Math.round(Number(r.authenticity_score || 0))}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Edit influencer">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 mt-4 gap-2 text-center min-w-0">
                <div className="min-w-0">
                  <InlineNumber value={Number(r.follower_count)} format={(v) => v.toLocaleString()} onSave={(v) => updateField(r.id, "follower_count", v)} />
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Followers</div>
                </div>
                <div className="min-w-0">
                  <InlineNumber value={Number(r.engagement_rate)} step={0.1} format={(v) => `${v.toFixed(1)}%`} onSave={(v) => updateField(r.id, "engagement_rate", v)} />
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">ER</div>
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg truncate" title={r.region ?? ""}>{r.region ?? "—"}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Region</div>
                </div>
              </div>
              {r.niche && <div className="mt-3 text-xs text-muted-foreground truncate" title={r.niche}>{r.niche}</div>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full mt-3">
                    <Link2 className="w-3 h-3 mr-1" /> Copy invite link <ChevronDown className="w-3 h-3 ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => copyInvite(r, "tiktok")}>TikTok invite link</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyInvite(r, "instagram")}>Instagram invite link</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyInvite(r, "youtube")}>YouTube invite link</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyInvite(r, "twitter")}>X invite link</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyInvite(r, "facebook")}>Facebook invite link</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default Influencers;
