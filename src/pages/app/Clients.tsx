import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Building2, ArrowUpRight, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

const Clients = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", industry: "", primary_contact_name: "", primary_contact_email: "", logo_url: "" });

  // Members management
  const [memberClient, setMemberClient] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("clients")
      .select("*, campaigns(id)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ name: "", industry: "", primary_contact_name: "", primary_contact_email: "", logo_url: "" }); setEditing(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const { error } = await supabase.from("clients").update(form).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Client updated");
    } else {
      const { error } = await supabase.from("clients").insert(form);
      if (error) return toast.error(error.message);
      toast.success("Client added");
    }
    setOpen(false); reset(); load();
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name ?? "",
      industry: r.industry ?? "",
      primary_contact_name: r.primary_contact_name ?? "",
      primary_contact_email: r.primary_contact_email ?? "",
      logo_url: r.logo_url ?? "",
    });
    setOpen(true);
  };

  const openMembers = async (r: any) => {
    setMemberClient(r);
    const { data } = await supabase.from("client_members").select("*").eq("client_id", r.id).order("created_at", { ascending: false });
    setMembers(data ?? []);
  };

  const invite = async () => {
    if (!memberClient || !inviteEmail) return;
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-client-user", {
      body: { client_id: memberClient.id, email: inviteEmail, redirect_to: `${window.location.origin}/portal` },
    });
    setInviting(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? error?.message ?? "Failed");
    toast.success((data as any)?.existed ? "Linked existing user" : "Invitation email sent");
    setInviteEmail("");
    openMembers(memberClient);
  };

  const removeMember = async (m: any) => {
    if (!confirm("Revoke access?")) return;
    const { error } = await supabase.from("client_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Access revoked");
    openMembers(memberClient);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Roster</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Clients</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild><Button className="bg-primary"><Plus className="w-4 h-4 mr-2" /> New client</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display text-2xl">{editing ? "Edit client" : "Add a client"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Brand name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Unilever — Royco" /></div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="FMCG / Foods" /></div>
              <div>
                <Label>Logo URL</Label>
                <Input value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="https://logo.clearbit.com/unilever.com" />
                <p className="text-xs text-muted-foreground mt-1">Tip: use <code>https://logo.clearbit.com/&lt;domain&gt;</code> for instant brand logos.</p>
              </div>
              <div><Label>Contact name</Label><Input value={form.primary_contact_name} onChange={e => setForm({ ...form, primary_contact_name: e.target.value })} /></div>
              <div><Label>Contact email</Label><Input type="email" value={form.primary_contact_email} onChange={e => setForm({ ...form, primary_contact_email: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-primary">{editing ? "Save changes" : "Add client"}</Button>
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
          {rows.map(r => {
            const domainGuess = (r.primary_contact_email || "").split("@")[1];
            const fallbackLogo = domainGuess ? `https://logo.clearbit.com/${domainGuess}` : null;
            const logoSrc = r.logo_url || fallbackLogo;
            const campaignCount = r.campaigns?.length ?? 0;
            return (
              <Link
                key={r.id}
                to={`/app/campaigns?client=${r.id}`}
                className="group block"
              >
                <Card className="p-5 hover:shadow-elegant hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center overflow-hidden border border-border">
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={`${r.name} logo`}
                          className="w-full h-full object-contain p-1"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="font-display text-lg text-foreground">{r.name[0]}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-lg truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.industry || "—"}</div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{campaignCount} {campaignCount === 1 ? "campaign" : "campaigns"}</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); openMembers(r); }}
                        className="text-foreground hover:text-accent transition-colors inline-flex items-center gap-1"
                      >
                        <UserPlus className="w-3 h-3" /> Access
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); openEdit(r); }}
                        className="text-foreground hover:text-accent transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={!!memberClient} onOpenChange={(v) => { if (!v) setMemberClient(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Brand access — {memberClient?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Invite people from the brand to log in and view their campaigns, content & reports. They won't see fees, payouts, or other clients.</p>
          <div className="flex gap-2 mt-2">
            <Input type="email" placeholder="brand@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            <Button onClick={invite} disabled={inviting || !inviteEmail} className="bg-primary">{inviting ? "…" : "Invite"}</Button>
          </div>
          <div className="mt-4 space-y-2">
            {members.length === 0 ? (
              <div className="text-xs text-muted-foreground">No brand users yet.</div>
            ) : members.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <div>
                  <div className="font-medium">{m.invited_email ?? m.user_id}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Client user</div>
                </div>
                <button onClick={() => removeMember(m)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Clients;
