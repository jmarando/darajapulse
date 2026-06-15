import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, ExternalLink, Copy, Inbox, Megaphone } from "lucide-react";
import { toast } from "sonner";

const KINDS = [
  { value: "owned_account", label: "Owned channel" },
  { value: "influencer", label: "Signed creator" },
  { value: "ad_slot", label: "Ad slot" },
  { value: "bundle", label: "Bundle" },
];
const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook", "tv", "radio", "web", "mixed"];
const STATUSES = ["new", "reviewing", "quoted", "won", "lost"];

const blank = { kind: "owned_account", title: "", subtitle: "", description: "", platform: "instagram", handle: "", cover_url: "", follower_count: 0, engagement_rate: 0, deliverable_type: "", base_rate_kes: 0, turnaround_days: 5, revisions: 2, tags: "", is_active: true };

export default function Inventory() {
  const { agencyIds, isSuperAdmin } = useAuth();
  const [agencies, setAgencies] = useState<any[]>([]);
  const [agencyId, setAgencyId] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(blank);

  useEffect(() => {
    (async () => {
      const q = supabase.from("agencies").select("id,name,slug").order("name");
      const { data } = await q;
      const list = (data ?? []).filter((a: any) => isSuperAdmin || agencyIds.includes(a.id));
      setAgencies(list);
      if (list[0] && !agencyId) setAgencyId(list[0].id);
    })();
  }, [isSuperAdmin, agencyIds]);

  const agency = useMemo(() => agencies.find(a => a.id === agencyId), [agencies, agencyId]);

  const load = async () => {
    if (!agencyId) return;
    const [{ data: items }, { data: bks }] = await Promise.all([
      supabase.from("inventory_items").select("*").eq("agency_id", agencyId).order("sort_order").order("title"),
      supabase.from("inventory_bookings").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false }),
    ]);
    setItems(items ?? []);
    setBookings(bks ?? []);
  };
  useEffect(() => { load(); }, [agencyId]);

  const openAdd = () => { setEditingId(null); setForm(blank); setOpen(true); };
  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({ ...blank, ...r, tags: (r.tags || []).join(", ") });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      ...form,
      agency_id: agencyId,
      follower_count: Number(form.follower_count) || 0,
      engagement_rate: Number(form.engagement_rate) || 0,
      base_rate_kes: Number(form.base_rate_kes) || 0,
      turnaround_days: form.turnaround_days ? Number(form.turnaround_days) : null,
      revisions: form.revisions !== "" && form.revisions != null ? Number(form.revisions) : null,
      tags: typeof form.tags === "string" ? form.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : form.tags,
    };
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    const op = editingId
      ? (supabase.from("inventory_items") as any).update(payload).eq("id", editingId)
      : (supabase.from("inventory_items") as any).insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Updated" : "Added");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const updateBookingStatus = async (id: string, status: string) => {
    const { error } = await (supabase.from("inventory_bookings") as any).update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const copyLink = () => {
    if (!agency?.slug) return toast.error("Agency missing slug");
    const url = `${window.location.origin}/shop/${agency.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Storefront link copied");
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-6 flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Media house</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Storefront & bookings</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl">Showcase your owned channels, signed creators and ad slots. Clients browse the public catalog and request quotes — you reply privately with pricing.</p>
        </div>
        <div className="flex items-center gap-2">
          {agencies.length > 1 && (
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{agencies.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {agency?.slug && (
            <>
              <Button variant="outline" onClick={copyLink}><Copy className="w-4 h-4 mr-2" /> Copy link</Button>
              <Button variant="outline" asChild><a href={`/shop/${agency.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> View storefront</a></Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items"><Megaphone className="w-3 h-3 mr-1.5" /> Inventory ({items.length})</TabsTrigger>
          <TabsTrigger value="bookings"><Inbox className="w-3 h-3 mr-1.5" /> Requests ({bookings.filter(b => b.status === "new").length})</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-6">
          <div className="flex justify-end mb-4">
            <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditingId(null); }}>
              <DialogTrigger asChild><Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add inventory</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="font-display text-2xl">{editingId ? "Edit item" : "Add inventory"}</DialogTitle></DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Type</Label>
                      <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Platform</Label>
                      <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Title *</Label><Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. K24 TV Instagram Page" /></div>
                  <div><Label>Subtitle</Label><Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="One-line pitch" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Handle / URL</Label><Input value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} placeholder="@k24tv" /></div>
                    <div><Label>Cover image URL</Label><Input value={form.cover_url} onChange={e => setForm({ ...form, cover_url: e.target.value })} /></div>
                  </div>
                  <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Followers / reach</Label><Input type="number" value={form.follower_count} onChange={e => setForm({ ...form, follower_count: e.target.value })} /></div>
                    <div><Label>Engagement %</Label><Input type="number" step="0.1" value={form.engagement_rate} onChange={e => setForm({ ...form, engagement_rate: e.target.value })} /></div>
                    <div><Label>Deliverable</Label><Input value={form.deliverable_type} onChange={e => setForm({ ...form, deliverable_type: e.target.value })} placeholder="IG Reel / 30s segment" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Base rate (KES) <span className="text-muted-foreground text-xs">(internal)</span></Label><Input type="number" value={form.base_rate_kes} onChange={e => setForm({ ...form, base_rate_kes: e.target.value })} /></div>
                    <div><Label>Turnaround (days)</Label><Input type="number" value={form.turnaround_days ?? ""} onChange={e => setForm({ ...form, turnaround_days: e.target.value })} /></div>
                    <div><Label>Revisions</Label><Input type="number" value={form.revisions ?? ""} onChange={e => setForm({ ...form, revisions: e.target.value })} /></div>
                  </div>
                  <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="news, sports, primetime" /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Visible on storefront</Label></div>
                  <Button type="submit" className="w-full">{editingId ? "Save changes" : "Add"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {items.length === 0 ? (
            <Card className="p-16 text-center text-muted-foreground">
              <Megaphone className="w-10 h-10 mx-auto opacity-50" />
              <p className="mt-3">No inventory yet. Add your first channel, creator or ad slot.</p>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(i => (
                <Card key={i.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge variant="outline" className="text-[10px]">{KINDS.find(k => k.value === i.kind)?.label}</Badge>
                      <div className="font-display text-base mt-2 truncate" title={i.title}>{i.title}</div>
                      {i.handle && <div className="text-xs text-muted-foreground truncate">{i.platform} · {i.handle}</div>}
                    </div>
                    {!i.is_active && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="rounded bg-secondary/40 p-2"><div className="text-muted-foreground text-[10px] uppercase">Reach</div><div className="font-display">{Number(i.follower_count || 0).toLocaleString()}</div></div>
                    <div className="rounded bg-secondary/40 p-2"><div className="text-muted-foreground text-[10px] uppercase">Rate KES</div><div className="font-display">{Number(i.base_rate_kes || 0).toLocaleString()}</div></div>
                  </div>
                  {i.deliverable_type && <div className="text-xs text-muted-foreground mt-2">{i.deliverable_type}</div>}
                  <div className="flex gap-1 mt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(i)}><Pencil className="w-3 h-3 mr-1.5" /> Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(i.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bookings" className="mt-6">
          {bookings.length === 0 ? (
            <Card className="p-16 text-center text-muted-foreground">
              <Inbox className="w-10 h-10 mx-auto opacity-50" />
              <p className="mt-3">No requests yet. Share your storefront link to get the first one.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-base">{b.contact_name}</span>
                        {b.company && <span className="text-sm text-muted-foreground">· {b.company}</span>}
                        <Badge variant={b.status === "new" ? "default" : "outline"} className="text-[10px]">{b.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <a href={`mailto:${b.contact_email}`} className="hover:text-foreground">{b.contact_email}</a>
                        {b.contact_phone && <> · {b.contact_phone}</>}
                        {" · "}{new Date(b.created_at).toLocaleString()}
                      </div>
                      {(b.budget_kes || b.target_start) && (
                        <div className="text-xs mt-2">
                          {b.budget_kes && <>Budget: <span className="font-medium">KES {Number(b.budget_kes).toLocaleString()}</span> · </>}
                          {b.target_start && <>Dates: {b.target_start}{b.target_end ? ` → ${b.target_end}` : ""}</>}
                        </div>
                      )}
                      {b.message && <div className="text-sm mt-2 whitespace-pre-wrap">{b.message}</div>}
                      {Array.isArray(b.items) && b.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {b.items.map((it: any, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-[10px]">{it.title}{it.deliverable_type ? ` · ${it.deliverable_type}` : ""}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Select value={b.status} onValueChange={(v) => updateBookingStatus(b.id, v)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
