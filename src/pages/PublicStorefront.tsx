import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Instagram, Music2, Youtube, Twitter, Facebook, Tv, Radio, Globe, Sparkles, Check, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import PublicFooter from "@/components/PublicFooter";

const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook, tv: Tv, radio: Radio, web: Globe };
const PLATFORM_BRAND: Record<string, { bg: string; fg: string }> = {
  instagram: { bg: "linear-gradient(135deg, hsl(330,80%,55%), hsl(20,90%,55%) 55%, hsl(45,95%,55%))", fg: "#fff" },
  tiktok:    { bg: "linear-gradient(135deg, #010101 0%, #25F4EE 50%, #FE2C55 100%)", fg: "#fff" },
  youtube:   { bg: "linear-gradient(135deg, hsl(0,85%,45%), hsl(0,85%,55%))", fg: "#fff" },
  twitter:   { bg: "linear-gradient(135deg, #000, #1a1a1a)", fg: "#fff" },
  facebook:  { bg: "linear-gradient(135deg, hsl(220,85%,45%), hsl(220,85%,55%))", fg: "#fff" },
  tv:        { bg: "linear-gradient(135deg, hsl(260,50%,35%), hsl(280,60%,45%))", fg: "#fff" },
  radio:     { bg: "linear-gradient(135deg, hsl(190,70%,40%), hsl(210,70%,50%))", fg: "#fff" },
  web:       { bg: "linear-gradient(135deg, hsl(200,20%,25%), hsl(215,25%,40%))", fg: "#fff" },
};
const KIND_LABEL: Record<string, string> = { owned_account: "Owned channel", influencer: "Signed creator", ad_slot: "Ad slot", bundle: "Bundle" };

const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

export default function PublicStorefront() {
  const { agencySlug } = useParams();
  const [agency, setAgency] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ contact_name: "", contact_email: "", contact_phone: "", company: "", budget_kes: "", target_start: "", target_end: "", message: "" });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_public_storefront", { _agency_slug: agencySlug });
      if (error) toast.error(error.message);
      const payload: any = data ?? {};
      setAgency(payload.agency ?? null);
      setItems(payload.items ?? []);
      setLoading(false);
    })();
  }, [agencySlug]);

  const toggle = (id: string) => setCart(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const cartItems = useMemo(() => items.filter(i => cart.includes(i.id)), [items, cart]);
  const groups = useMemo(() => {
    const order = ["owned_account", "influencer", "ad_slot", "bundle"];
    const out: Record<string, any[]> = {};
    items.forEach(i => { (out[i.kind] = out[i.kind] || []).push(i); });
    return order.filter(k => out[k]?.length).map(k => ({ kind: k, items: out[k] }));
  }, [items]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agency) return;
    if (cart.length === 0) return toast.error("Pick at least one item");
    setSubmitting(true);
    const payload = {
      agency_id: agency.id,
      inventory_item_id: cart[0],
      items: cartItems.map(i => ({ id: i.id, title: i.title, deliverable_type: i.deliverable_type, platform: i.platform, handle: i.handle })),
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone || null,
      company: form.company || null,
      budget_kes: form.budget_kes ? Number(form.budget_kes) : null,
      target_start: form.target_start || null,
      target_end: form.target_end || null,
      message: form.message || null,
    };
    const { error } = await (supabase.from("inventory_bookings") as any).insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent — we'll be in touch shortly");
    setOpen(false); setCart([]);
    setForm({ contact_name: "", contact_email: "", contact_phone: "", company: "", budget_kes: "", target_start: "", target_end: "", message: "" });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!agency) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Storefront not found</div>;

  const accent = agency.primary_color || "hsl(var(--primary))";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center gap-4">
          {agency.logo_url && <img src={agency.logo_url} alt={agency.display_name || agency.name} className="h-12 w-auto max-w-[200px] rounded-lg object-contain" />}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Media kit · Book now</div>
            <h1 className="font-display text-2xl font-semibold truncate">{agency.display_name || agency.name}</h1>
          </div>
          {agency.support_email && <a className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline" href={`mailto:${agency.support_email}`}>{agency.support_email}</a>}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <section className="mb-10">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Our inventory</div>
          <h2 className="font-display text-4xl mt-1">Pick what fits your brief.</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">Browse our owned channels, signed creators and ad slots. Add the units you'd like to book — we'll quote within 24 hours.</p>
        </section>

        {groups.length === 0 ? (
          <Card className="p-16 text-center text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto opacity-50" />
            <p className="mt-3">Inventory is being prepared. Check back soon.</p>
          </Card>
        ) : groups.map(group => (
          <section key={group.kind} className="mb-10">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="font-display text-xl">{KIND_LABEL[group.kind]}</h3>
              <span className="text-xs text-muted-foreground">{group.items.length} option{group.items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((i: any) => {
                const PIcon = PLATFORM_ICON[i.platform] || Globe;
                const inCart = cart.includes(i.id);
                return (
                  <Card key={i.id} className={`p-5 flex flex-col transition-all ${inCart ? "border-accent ring-1 ring-accent" : "hover:border-accent/40"}`}>
                    {i.cover_url ? (
                      <div className="aspect-video rounded-md bg-secondary overflow-hidden mb-4 border border-border">
                        <img src={i.cover_url} alt={i.title} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className="aspect-video rounded-md border border-border mb-4 relative overflow-hidden flex items-center justify-center"
                        style={{ background: (PLATFORM_BRAND[i.platform] || PLATFORM_BRAND.web).bg }}
                      >
                        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.6), transparent 60%)" }} />
                        <PIcon
                          className="w-14 h-14 relative drop-shadow-lg"
                          style={{ color: (PLATFORM_BRAND[i.platform] || PLATFORM_BRAND.web).fg }}
                          strokeWidth={1.75}
                        />
                        {i.handle && (
                          <div
                            className="absolute bottom-2 left-2 right-2 text-[11px] font-medium tracking-tight truncate px-2 py-1 rounded backdrop-blur-sm"
                            style={{ color: (PLATFORM_BRAND[i.platform] || PLATFORM_BRAND.web).fg, background: "rgba(0,0,0,0.25)" }}
                          >
                            {i.handle}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base leading-tight truncate" title={i.title}>{i.title}</div>
                        {i.handle && <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mt-1"><PIcon className="w-3 h-3" /> {i.handle}</div>}
                      </div>
                    </div>
                    {i.subtitle && <div className="text-sm text-muted-foreground mt-2 line-clamp-2">{i.subtitle}</div>}

                    {(i.follower_count > 0 || i.engagement_rate > 0) && (
                      <div className="grid grid-cols-2 mt-4 rounded-md border border-border bg-secondary/30 divide-x divide-border overflow-hidden">
                        <div className="p-2 text-center">
                          <div className="font-display text-base">{fmtCompact(Number(i.follower_count))}</div>
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Reach</div>
                        </div>
                        <div className="p-2 text-center">
                          <div className="font-display text-base">{Number(i.engagement_rate || 0).toFixed(1)}%</div>
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Engagement</div>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1">
                      {i.deliverable_type && <Badge variant="outline" className="text-[10px]">{i.deliverable_type}</Badge>}
                      {i.turnaround_days != null && <Badge variant="outline" className="text-[10px]">{i.turnaround_days}d turnaround</Badge>}
                      {i.revisions != null && <Badge variant="outline" className="text-[10px]">{i.revisions} revisions</Badge>}
                      {(i.tags || []).slice(0, 2).map((t: string) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>

                    <Button onClick={() => toggle(i.id)} variant={inCart ? "default" : "outline"} size="sm" className="mt-4 w-full" style={inCart ? { background: accent } : undefined}>
                      {inCart ? <><Check className="w-3 h-3 mr-1.5" /> Added</> : "Add to request"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {cart.length > 0 && (
        <div className="sticky bottom-4 z-30 px-6">
          <div className="max-w-6xl mx-auto bg-card border border-border rounded-xl shadow-lg p-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-medium">{cart.length}</span> item{cart.length === 1 ? "" : "s"} selected
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCart([])}><X className="w-3 h-3 mr-1.5" /> Clear</Button>
              <Button size="sm" onClick={() => setOpen(true)} style={{ background: accent }}><ShoppingCart className="w-3 h-3 mr-1.5" /> Request quote</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl">Request a quote</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="rounded-md bg-secondary/40 p-3 text-xs space-y-1 max-h-32 overflow-auto">
              {cartItems.map(i => (
                <div key={i.id} className="flex justify-between gap-2">
                  <span className="truncate">{i.title}</span>
                  {i.deliverable_type && <span className="text-muted-foreground shrink-0">{i.deliverable_type}</span>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Your name *</Label><Input required value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div><Label>Company</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email *</Label><Input type="email" required value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Budget (KES)</Label><Input type="number" value={form.budget_kes} onChange={e => setForm({ ...form, budget_kes: e.target.value })} /></div>
              <div><Label>Start</Label><Input type="date" value={form.target_start} onChange={e => setForm({ ...form, target_start: e.target.value })} /></div>
              <div><Label>End</Label><Input type="date" value={form.target_end} onChange={e => setForm({ ...form, target_end: e.target.value })} /></div>
            </div>
            <div><Label>Brief / notes</Label><Textarea rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Campaign goals, key messages, deadlines…" /></div>
            <Button type="submit" disabled={submitting} className="w-full" style={{ background: accent }}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <PublicFooter />
    </div>
  );
}
