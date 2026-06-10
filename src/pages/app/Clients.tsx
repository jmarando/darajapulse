import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Building2, ArrowUpRight, UserPlus, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { AgencyTeamPicker } from "@/components/AgencyTeamPicker";

const Clients = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", industry: "", primary_contact_name: "", primary_contact_email: "", logo_url: "" });
  const [autoInvite, setAutoInvite] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Members management
  const [memberClient, setMemberClient] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [clientCampaigns, setClientCampaigns] = useState<any[]>([]);
  const [memberScopes, setMemberScopes] = useState<Record<string, string[]>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteScope, setInviteScope] = useState<"all" | "specific">("all");
  const [inviteCampaignIds, setInviteCampaignIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("clients")
      .select("*, campaigns(id)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm({ name: "", industry: "", primary_contact_name: "", primary_contact_email: "", logo_url: "" });
    setEditing(null);
    setAutoInvite(true);
  };

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2MB");
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("client-logos").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("client-logos").getPublicUrl(path);
    setForm((f) => ({ ...f, logo_url: data.publicUrl }));
    setUploading(false);
    toast.success("Logo uploaded");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (editing) {
      const { error } = await supabase.from("clients").update(form).eq("id", editing.id);
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Client updated");
      setOpen(false); reset(); load();
    } else {
      const { data: inserted, error } = await supabase.from("clients").insert(form as any).select().single();
      if (error) { setSubmitting(false); return toast.error(error.message); }
      // Auto-invite the contact email if requested
      if (autoInvite && form.primary_contact_email) {
        const { data, error: invErr } = await supabase.functions.invoke("invite-client-user", {
          body: { client_id: inserted.id, email: form.primary_contact_email, redirect_to: `${window.location.origin}/portal` },
        });
        if (invErr || (data as any)?.error) {
          toast.warning("Client added, but invite failed: " + ((data as any)?.error ?? invErr?.message));
        } else {
          toast.success((data as any)?.existed ? "Client added & linked existing user" : "Client added & invitation sent");
        }
      } else {
        toast.success("Client added");
      }
      setSubmitting(false);
      setOpen(false); reset(); load();
    }
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
    setInviteEmail(""); setInviteScope("all"); setInviteCampaignIds([]);
    const [{ data: mem }, { data: camps }] = await Promise.all([
      supabase.from("client_members").select("*").eq("client_id", r.id).order("created_at", { ascending: false }),
      supabase.from("campaigns").select("id, name").eq("client_id", r.id).order("created_at", { ascending: false }),
    ]);
    setMembers(mem ?? []);
    setClientCampaigns(camps ?? []);
    const userIds = (mem ?? []).map((m: any) => m.user_id);
    const campIds = (camps ?? []).map((c: any) => c.id);
    if (userIds.length && campIds.length) {
      const { data: km } = await supabase.from("campaign_members").select("user_id, campaign_id").in("user_id", userIds).in("campaign_id", campIds);
      const map: Record<string, string[]> = {};
      (km ?? []).forEach((k: any) => { (map[k.user_id] = map[k.user_id] || []).push(k.campaign_id); });
      setMemberScopes(map);
    } else {
      setMemberScopes({});
    }
  };

  const invite = async () => {
    if (!memberClient || !inviteEmail) return;
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-client-user", {
      body: {
        client_id: memberClient.id,
        email: inviteEmail,
        redirect_to: `${window.location.origin}/portal`,
        campaign_ids: inviteScope === "specific" ? inviteCampaignIds : [],
      },
    });
    setInviting(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? error?.message ?? "Failed");
    toast.success((data as any)?.existed ? "Linked existing user" : "Invitation email sent");
    setInviteEmail(""); setInviteScope("all"); setInviteCampaignIds([]);
    openMembers(memberClient);
  };

  const removeMember = async (m: any) => {
    if (!confirm("Revoke access?")) return;
    const { error } = await supabase.from("client_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    // also clean up campaign_members for this user × this client's campaigns
    const campIds = clientCampaigns.map((c) => c.id);
    if (campIds.length) await supabase.from("campaign_members").delete().eq("user_id", m.user_id).in("campaign_id", campIds);
    toast.success("Access revoked");
    openMembers(memberClient);
  };

  const updateMemberScope = async (m: any, campaignId: string, checked: boolean) => {
    const current = memberScopes[m.user_id] || [];
    const next = checked ? Array.from(new Set([...current, campaignId])) : current.filter((id) => id !== campaignId);
    setMemberScopes({ ...memberScopes, [m.user_id]: next });
    if (checked) {
      await supabase.from("campaign_members").upsert({ user_id: m.user_id, campaign_id: campaignId }, { onConflict: "campaign_id,user_id" });
    } else {
      await supabase.from("campaign_members").delete().eq("user_id", m.user_id).eq("campaign_id", campaignId);
    }
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
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  {form.logo_url && (
                    <div className="w-12 h-12 rounded-md border border-border bg-secondary overflow-hidden flex items-center justify-center">
                      <img src={form.logo_url} alt="logo preview" className="w-full h-full object-contain p-1" />
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="w-3 h-3 mr-1" /> {uploading ? "Uploading…" : form.logo_url ? "Replace" : "Upload"}
                  </Button>
                  {form.logo_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, logo_url: "" })}>Remove</Button>
                  )}
                </div>
                <Input className="mt-2" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="…or paste a logo URL (e.g. https://logo.clearbit.com/unilever.com)" />
              </div>
              <div><Label>Contact name</Label><Input value={form.primary_contact_name} onChange={e => setForm({ ...form, primary_contact_name: e.target.value })} /></div>
              <div><Label>Contact email</Label><Input type="email" value={form.primary_contact_email} onChange={e => setForm({ ...form, primary_contact_email: e.target.value })} /></div>
              {!editing && form.primary_contact_email && (
                <label className="flex items-start gap-2 text-sm bg-secondary/50 rounded-md p-3 cursor-pointer">
                  <Checkbox checked={autoInvite} onCheckedChange={(v) => setAutoInvite(!!v)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">Send portal invite to this contact</span>
                    <span className="block text-xs text-muted-foreground">They'll get an email to log in and view all of {form.name || "this brand"}'s campaigns. You can scope to specific campaigns later via Access.</span>
                  </span>
                </label>
              )}
              <Button type="submit" className="w-full bg-primary" disabled={submitting || uploading}>{editing ? "Save changes" : (submitting ? "Adding…" : "Add client")}</Button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Access — {memberClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mt-2">Brand contacts</div>
          <p className="text-sm text-muted-foreground">Invite people from the brand to log in and view their campaigns. They won't see fees, payouts, or other clients.</p>

          <div className="border rounded-md p-3 space-y-3 bg-secondary/30">
            <div className="flex gap-2">
              <Input type="email" placeholder="brand@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
              <Button onClick={invite} disabled={inviting || !inviteEmail} className="bg-primary">{inviting ? "…" : "Invite"}</Button>
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={inviteScope === "all"} onChange={() => setInviteScope("all")} />
                All campaigns
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={inviteScope === "specific"} onChange={() => setInviteScope("specific")} />
                Specific campaigns
              </label>
            </div>
            {inviteScope === "specific" && (
              <div className="space-y-1 max-h-40 overflow-auto pl-1">
                {clientCampaigns.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No campaigns yet for this brand.</div>
                ) : clientCampaigns.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={inviteCampaignIds.includes(c.id)}
                      onCheckedChange={(v) => setInviteCampaignIds(v ? [...inviteCampaignIds, c.id] : inviteCampaignIds.filter((x) => x !== c.id))}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 space-y-3">
            {members.length === 0 ? (
              <div className="text-xs text-muted-foreground">No brand users yet.</div>
            ) : members.map(m => {
              const scope = memberScopes[m.user_id] || [];
              const isScoped = scope.length > 0;
              return (
                <div key={m.id} className="border rounded-md px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{m.invited_email ?? m.user_id}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {isScoped ? `${scope.length} of ${clientCampaigns.length} campaigns` : "All campaigns"}
                      </div>
                    </div>
                    <button onClick={() => removeMember(m)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  </div>
                  {clientCampaigns.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Manage campaign scope</summary>
                      <div className="mt-2 pl-2 space-y-1">
                        {clientCampaigns.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={scope.includes(c.id)}
                              onCheckedChange={(v) => updateMemberScope(m, c.id, !!v)}
                            />
                            {c.name}
                          </label>
                        ))}
                        <p className="text-[10px] text-muted-foreground pt-1">Tip: leave all unchecked to grant access to every campaign.</p>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>

          {memberClient && (
            <>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mt-6">Agency team</div>
              <AgencyTeamPicker scope={{ type: "client", client_id: memberClient.id }} title="Who from the agency runs this account" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Clients;
