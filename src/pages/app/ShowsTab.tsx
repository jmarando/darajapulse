import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tv, Radio, Podcast, Globe, Search, Users, ExternalLink, Mail, Phone, MessageCircle,
  Instagram, Music2, Youtube, Facebook, Twitter, Loader2, Sparkles, MapPin,
} from "lucide-react";
import { toast } from "sonner";

type Show = {
  id: string;
  name: string;
  slug?: string;
  kind: string;
  station?: string;
  host_names?: string[];
  host_creator_ids?: string[];
  airtime?: string;
  days_on_air?: string[];
  platforms?: string[];
  handles?: Record<string, string>;
  niche?: string[];
  region?: string;
  city?: string;
  logo_url?: string;
  description?: string;
  reach_estimate?: number;
  demographics?: any;
  ai_confidence?: number;
  source?: string;
  agency_id?: string | null;
};
type ShowContact = { id: string; show_id: string; kind: string; value: string; label?: string; is_public: boolean };

const KIND_ICON: Record<string, any> = { tv: Tv, radio: Radio, podcast: Podcast, digital: Globe };
const KIND_LABEL: Record<string, string> = { tv: "TV", radio: "Radio", podcast: "Podcast", digital: "Digital" };
const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook };

const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

const topAgeBand = (demo: any) => {
  const bands = demo?.age_bands;
  if (!bands) return null;
  let best: { band: string; pct: number } | null = null;
  for (const [b, v] of Object.entries(bands)) {
    const pct = Number(v);
    if (!Number.isFinite(pct)) continue;
    if (!best || pct > best.pct) best = { band: b, pct };
  }
  return best;
};

export default function ShowsTab() {
  const [rows, setRows] = useState<Show[]>([]);
  const [contactsByShow, setContactsByShow] = useState<Record<string, ShowContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [openShow, setOpenShow] = useState<Show | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("shows").select("*").order("name", { ascending: true }).limit(2000);
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    const { data: cs } = await (supabase as any).from("show_contacts").select("*");
    const g: Record<string, ShowContact[]> = {};
    (cs ?? []).forEach((c: any) => { (g[c.show_id] ||= []).push(c); });
    setContactsByShow(g);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const stations = useMemo(() => Array.from(new Set(rows.map(r => r.station).filter(Boolean) as string[])).sort(), [rows]);
  const niches = useMemo(() => Array.from(new Set(rows.flatMap(r => r.niche || []))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      if (term) {
        const hay = [r.name, r.station, r.description, ...(r.host_names || []), ...(r.niche || [])].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (stationFilter !== "all" && r.station !== stationFilter) return false;
      if (nicheFilter !== "all" && !(r.niche || []).includes(nicheFilter)) return false;
      return true;
    });
  }, [rows, q, kindFilter, stationFilter, nicheFilter]);

  const runSeed = async () => {
    if (!confirm("Fetch popular Kenyan TV shows, radio programmes and podcasts (Citizen, NTV, KTN, KBC, K24, Kiss, Classic, Financially Incorrect, Mic Cheque, Iko Nini and more)? Runs in the background for several minutes.")) return;
    setSeeding(true);
    const t = toast.loading("Starting KE shows & podcasts seed…");
    try {
      const { data, error } = await supabase.functions.invoke("discovery-seed-shows", { body: {} });
      if (error) throw error;
      toast.success(data?.message || "Seeding started. Refresh in a few minutes.", { id: t, duration: 8000 });
      setTimeout(load, 45_000);
      setTimeout(load, 120_000);
      setTimeout(load, 240_000);
    } catch (e: any) { toast.error(e.message || "Seed failed", { id: t }); }
    finally { setSeeding(false); }
  };

  const openContacts = openShow ? (contactsByShow[openShow.id] || []) : [];

  return (
    <div>
      <div className="flex justify-between items-end mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Shows &amp; programmes</h2>
          <p className="text-sm text-muted-foreground mt-1">TV shows, radio programmes and podcasts across Kenya. Book slots, source guests, pitch sponsorships.</p>
        </div>
        <Button onClick={runSeed} disabled={seeding} variant="outline">
          {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {rows.length ? "Top up shows" : "Seed Mediamax + KE shows"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder="Show, host, station…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="tv">TV</SelectItem>
            <SelectItem value="radio">Radio</SelectItem>
            <SelectItem value="podcast">Podcast</SelectItem>
            <SelectItem value="digital">Digital</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stationFilter} onValueChange={setStationFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All stations</SelectItem>
            {stations.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={nicheFilter} onValueChange={setNicheFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All niches</SelectItem>
            {niches.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground ml-auto">{filtered.length} of {rows.length}</div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Tv className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No shows yet</h3>
          <p className="text-muted-foreground mt-2 text-sm">Click <strong>Seed Mediamax + KE shows</strong> to fetch programmes across Kenyan broadcasters.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const KIcon = KIND_ICON[s.kind] || Tv;
            const age = topAgeBand(s.demographics);
            const cs = contactsByShow[s.id] || [];
            return (
              <Card key={s.id} className="p-5 flex flex-col hover:border-accent/40 transition-all cursor-pointer" onClick={() => setOpenShow(s)}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {s.logo_url ? <img src={s.logo_url} className="w-full h-full object-cover" alt={s.name} /> : <KIcon className="w-6 h-6 text-foreground/60" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base leading-tight truncate">{s.name}</div>
                    {s.station && <div className="text-xs text-muted-foreground truncate">{s.station}</div>}
                  </div>
                  <Badge variant="outline" className="text-[9px] uppercase shrink-0">{KIND_LABEL[s.kind] || s.kind}</Badge>
                </div>

                {s.airtime && <div className="text-xs text-muted-foreground mb-2">{s.airtime}</div>}
                {s.description && <div className="text-sm text-muted-foreground line-clamp-2 mb-3">{s.description}</div>}

                {s.host_names && s.host_names.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {s.host_names.slice(0, 3).map(h => <Badge key={h} variant="secondary" className="text-[10px]">{h}</Badge>)}
                    {s.host_names.length > 3 && <span className="text-[10px] text-muted-foreground self-center">+{s.host_names.length - 3}</span>}
                  </div>
                )}

                <div className="flex flex-wrap gap-1 mb-2">
                  {(s.niche || []).slice(0, 3).map(n => <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>)}
                </div>

                {(s.platforms || []).length > 0 && (
                  <div className="flex gap-1.5 mb-3">
                    {(s.platforms || []).slice(0, 5).map(p => {
                      const PI = PLATFORM_ICON[p];
                      return PI ? <PI key={p} className="w-3.5 h-3.5 text-muted-foreground" /> : null;
                    })}
                  </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-2 pt-3 border-t border-border">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Reach</div>
                    <div className="font-display text-base">{fmtCompact(Number(s.reach_estimate || 0))}</div>
                  </div>
                  {age ? (
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Top audience</div>
                      <div className="font-display text-base">{age.band}</div>
                    </div>
                  ) : cs.length > 0 ? (
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Contacts</div>
                      <div className="font-display text-base">{cs.length}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">City</div>
                      <div className="font-display text-base truncate">{s.city || "—"}</div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!openShow} onOpenChange={(o) => !o && setOpenShow(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {openShow && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(() => { const KI = KIND_ICON[openShow.kind] || Tv; return <KI className="w-4 h-4 text-muted-foreground" />; })()}
                  {openShow.name}
                </SheetTitle>
                <div className="text-sm text-muted-foreground">{openShow.station} · {KIND_LABEL[openShow.kind] || openShow.kind}</div>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {openShow.description && <p className="text-sm">{openShow.description}</p>}

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs uppercase text-muted-foreground">Reach</div><div className="font-display">{fmtCompact(Number(openShow.reach_estimate || 0))}</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">City</div><div className="font-display">{openShow.city || "—"}</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">Airtime</div><div className="font-display text-xs">{openShow.airtime || "—"}</div></div>
                </div>

                {openShow.host_names && openShow.host_names.length > 0 && (
                  <div>
                    <Label className="text-xs">Hosts</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {openShow.host_names.map(h => <Badge key={h} variant="secondary">{h}</Badge>)}
                    </div>
                  </div>
                )}

                {openShow.handles && Object.keys(openShow.handles).length > 0 && (
                  <div>
                    <Label className="text-xs">Show handles</Label>
                    <div className="flex flex-col gap-1 mt-1">
                      {Object.entries(openShow.handles).map(([k, v]) => v ? (
                        <div key={k} className="text-xs flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{k}</Badge>
                          <span className="font-mono truncate">{v}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}

                {openShow.demographics && (
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Users className="w-3 h-3" /> Audience {openShow.demographics.estimated && <span className="text-[9px] uppercase text-muted-foreground">estimated</span>}</Label>
                    <pre className="text-xs bg-secondary/40 rounded p-2 mt-1 overflow-auto">{JSON.stringify(openShow.demographics, null, 2)}</pre>
                  </div>
                )}

                <div>
                  <Label className="text-xs">Contacts</Label>
                  <div className="space-y-1.5 mt-1">
                    {openContacts.length === 0 && <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">No contacts saved yet.</div>}
                    {openContacts.map(ct => {
                      const isEmail = ct.kind === "email";
                      const isPhone = ct.kind === "phone" || ct.kind === "whatsapp";
                      const Icon = isEmail ? Mail : isPhone ? Phone : ExternalLink;
                      const href = isEmail ? `mailto:${ct.value}` : isPhone ? `tel:${ct.value.replace(/\s+/g, "")}` : ct.value;
                      return (
                        <a key={ct.id} href={href} target={isEmail || isPhone ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5 text-sm hover:bg-secondary/40">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <Badge variant="outline" className="text-[9px] capitalize">{ct.kind}</Badge>
                          <span className="flex-1 truncate">{ct.value}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
