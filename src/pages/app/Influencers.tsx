import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Search, ShieldCheck, Link2 } from "lucide-react";
import { toast } from "sonner";
import { PlatformPicker } from "@/components/PlatformPicker";

const platforms = ["tiktok", "instagram", "youtube", "twitter", "facebook"] as const;

const Influencers = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ full_name: "", handle: "", primary_platform: "tiktok", niche: "", follower_count: 0, engagement_rate: 0, region: "Kenya", phone_mpesa: "" });

  const load = async () => {
    const { data } = await supabase.from("influencers").select("*").order("follower_count", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("influencers").insert({ ...form, follower_count: Number(form.follower_count), engagement_rate: Number(form.engagement_rate) });
    if (error) return toast.error(error.message);
    toast.success("Influencer added"); setOpen(false); load();
  };

  const filtered = rows.filter(r => !q || r.full_name.toLowerCase().includes(q.toLowerCase()) || (r.handle ?? "").toLowerCase().includes(q.toLowerCase()) || (r.niche ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Discovery</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Influencer roster</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-primary"><Plus className="w-4 h-4 mr-2" /> Add influencer</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">Add to roster</DialogTitle></DialogHeader>
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
              <Button type="submit" className="w-full bg-primary">Save</Button>
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
          {filtered.map(r => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center font-display text-lg">{r.full_name[0]}</div>
                  <div>
                    <div className="font-display text-lg">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground">{r.handle} · {r.primary_platform}</div>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-1"><ShieldCheck className="w-3 h-3" /> {Math.round(Number(r.authenticity_score))}</Badge>
              </div>
              <div className="grid grid-cols-3 mt-4 gap-2 text-center">
                <div><div className="font-display text-lg">{Number(r.follower_count).toLocaleString()}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Followers</div></div>
                <div><div className="font-display text-lg">{Number(r.engagement_rate).toFixed(1)}%</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">ER</div></div>
                <div><div className="font-display text-lg">{r.region?.slice(0, 4) ?? "—"}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Region</div></div>
              </div>
              {r.niche && <div className="mt-3 text-xs text-muted-foreground">{r.niche}</div>}
              <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => {
                const link = `${window.location.origin}/connect/tiktok/${r.id}`;
                navigator.clipboard.writeText(link);
                toast.success("TikTok invite link copied");
              }}><Link2 className="w-3 h-3 mr-1" /> Copy TikTok invite link</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
export default Influencers;
