import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

const Clients = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", industry: "", primary_contact_name: "", primary_contact_email: "" });

  const load = async () => {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("clients").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Client added");
    setOpen(false); setForm({ name: "", industry: "", primary_contact_name: "", primary_contact_email: "" }); load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Roster</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Clients</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-primary"><Plus className="w-4 h-4 mr-2" /> New client</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display text-2xl">Add a client</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Brand name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Unilever — Royco" /></div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="FMCG / Foods" /></div>
              <div><Label>Contact name</Label><Input value={form.primary_contact_name} onChange={e => setForm({ ...form, primary_contact_name: e.target.value })} /></div>
              <div><Label>Contact email</Label><Input type="email" value={form.primary_contact_email} onChange={e => setForm({ ...form, primary_contact_email: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-primary">Add client</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No clients yet</h3>
          <p className="text-muted-foreground mt-1">Add Unilever, Reckitt, DTC… any brand you run for.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(r => (
            <Card key={r.id} className="p-5 hover:shadow-elegant transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-gradient-warm flex items-center justify-center text-primary-foreground font-display text-lg">{r.name[0]}</div>
                <div>
                  <div className="font-display text-lg">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.industry || "—"}</div>
                </div>
              </div>
              {r.primary_contact_email && <div className="text-xs text-muted-foreground mt-3 truncate">{r.primary_contact_email}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
export default Clients;
