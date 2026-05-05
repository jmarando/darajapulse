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
import { Plus, Megaphone, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pitched: "bg-secondary",
  won: "bg-success/15 text-success",
  live: "bg-accent text-accent-foreground",
  reporting: "bg-highlight/20 text-foreground",
  closed: "bg-muted text-muted-foreground",
};

const Campaigns = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ client_id: "", name: "", brief: "", hashtag: "", budget_kes: 0, status: "draft" });

  const load = async () => {
    const { data } = await supabase.from("campaigns").select("*, clients(name)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: cs } = await supabase.from("clients").select("id,name");
    setClients(cs ?? []);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("campaigns").insert({ ...form, budget_kes: Number(form.budget_kes) });
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
              <div><Label>Brief</Label><Textarea rows={3} value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })} /></div>
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
              <Card className="p-5 hover:shadow-elegant transition-all hover:-translate-y-0.5 group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">{r.clients?.name}</div>
                    <div className="font-display text-2xl mt-1">{r.name}</div>
                  </div>
                  <Badge className={statusColor[r.status]}>{r.status}</Badge>
                </div>
                <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                  <span>{r.hashtag || "—"}</span>
                  <span className="font-display text-foreground">KES {Number(r.budget_kes).toLocaleString()}</span>
                  <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
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
