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
  Tv, Radio, Podcast, Globe, Search, ExternalLink, Mail, Phone, MessageCircle,
  Instagram, Music2, Youtube, Facebook, Twitter, Loader2, Sparkles, Newspaper,
  Building2, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type Show = {
  id: string;
  name: string;
  slug?: string;
  kind: string; // tv | radio | podcast | digital
  station?: string;
  host_names?: string[];
  airtime?: string;
  platforms?: string[];
  handles?: Record<string, string>;
  niche?: string[];
  region?: string;
  city?: string;
  logo_url?: string;
  description?: string;
  reach_estimate?: number;
  demographics?: any;
  agency_id?: string | null;
};
type ShowContact = { id: string; show_id: string; kind: string; value: string; label?: string; is_public: boolean };

const KIND_ICON: Record<string, any> = { tv: Tv, radio: Radio, podcast: Podcast, digital: Newspaper };
const KIND_LABEL: Record<string, string> = { tv: "TV", radio: "Radio", podcast: "Podcast", digital: "Digital" };
const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook };

// Station → parent media house
const STATION_GROUP: Record<string, string> = {
  // Mediamax
  "K24 TV": "Mediamax Network", "People Daily": "Mediamax Network", "Milele FM": "Mediamax Network",
  "Meru FM": "Mediamax Network", "Pilipili FM": "Mediamax Network", "Emoo FM": "Mediamax Network",
  "Kameme FM": "Mediamax Network", "Mayian FM": "Mediamax Network", "Msenangu FM": "Mediamax Network",
  // Royal Media
  "Citizen TV": "Royal Media Services", "Radio Citizen": "Royal Media Services", "Inooro TV": "Royal Media Services",
  "Inooro FM": "Royal Media Services", "Ramogi FM": "Royal Media Services", "Musyi FM": "Royal Media Services",
  "Mulembe FM": "Royal Media Services", "Chamgei FM": "Royal Media Services", "Egesa FM": "Royal Media Services",
  "Wimwaro FM": "Royal Media Services", "Sulwe FM": "Royal Media Services", "Bahari FM": "Royal Media Services",
  "Hot 96": "Royal Media Services",
  // Radio Africa
  "Kiss FM": "Radio Africa Group", "Classic 105": "Radio Africa Group", "Radio Jambo": "Radio Africa Group",
  "Kiss TV": "Radio Africa Group", "The Star": "Radio Africa Group", "X FM": "Radio Africa Group",
  "Relax FM": "Radio Africa Group",
  // Standard
  "KTN Home": "Standard Group", "KTN News": "Standard Group", "Radio Maisha": "Standard Group",
  "Spice FM": "Standard Group", "Berur FM": "Standard Group", "Vybez Radio": "Standard Group",
  "The Standard": "Standard Group", "Standard Digital": "Standard Group",
  // Nation
  "NTV Kenya": "Nation Media Group", "NTV": "Nation Media Group", "QFM": "Nation Media Group",
  "Nation FM": "Nation Media Group", "Business Daily": "Nation Media Group", "Daily Nation": "Nation Media Group",
  "Nation.Africa": "Nation Media Group",
  // KBC
  "KBC Channel 1": "KBC", "KBC English Service": "KBC", "Idhaa ya Taifa": "KBC",
  "Coro FM": "KBC", "Pwani FM": "KBC", "Mwago FM": "KBC", "Iftin FM": "KBC", "Kitwek FM": "KBC",
  // Capital
  "Capital FM": "Capital Group", "Capital FM Kids": "Capital Group", "Capital Digital": "Capital Group",
  // Others
  "HBR (Homeboyz Radio)": "Home Boyz Media", "Homeboyz Radio": "Home Boyz Media",
  "Trace Mziki": "Trace Media", "Trace Gospel": "Trace Media",
};

const GROUP_META: Record<string, { desc: string; category: "broadcaster" | "publisher" | "independent" }> = {
  "Nation Media Group": { desc: "East Africa's largest media house — NTV, Business Daily, Nation.Africa, QFM.", category: "broadcaster" },
  "Royal Media Services": { desc: "Kenya's largest broadcaster — Citizen TV, Inooro, Ramogi, Radio Citizen.", category: "broadcaster" },
  "Standard Group": { desc: "KTN Home, KTN News, Radio Maisha, Spice FM and The Standard.", category: "broadcaster" },
  "Mediamax Network": { desc: "K24 TV, People Daily, Milele FM and regional-language radio.", category: "broadcaster" },
  "Radio Africa Group": { desc: "Kiss FM, Classic 105, Radio Jambo, The Star.", category: "broadcaster" },
  "KBC": { desc: "Kenya's state broadcaster — national TV, English and vernacular radio.", category: "broadcaster" },
  "Capital Group": { desc: "Capital FM Kenya and Capital Digital.", category: "broadcaster" },
  "Home Boyz Media": { desc: "Homeboyz Radio (HBR) and events network.", category: "broadcaster" },
  "Trace Media": { desc: "Trace Mziki and Trace Gospel.", category: "broadcaster" },
  "Independent podcasts": { desc: "Standalone Kenyan podcasts and shows without a parent broadcaster.", category: "independent" },
  "Digital publications": { desc: "Kenyan digital-only publishers, blogs and business media.", category: "publisher" },
};

// stations we know are digital publishers (fallback categorisation)
const DIGITAL_PUBLISHERS = new Set([
  "Kenya Wall Street", "Techweez", "Techmoran", "Pulse Live Kenya", "Tuko",
  "Kenyans.co.ke", "Nairobi Wire", "Nairobi News", "Ghafla Kenya", "Mpasho",
  "Sports Brief", "The Elephant", "Business Today", "Bizna Kenya", "Citizen Digital",
]);

const groupOf = (s: Show): string => {
  if (s.station && STATION_GROUP[s.station]) return STATION_GROUP[s.station];
  if (s.station && DIGITAL_PUBLISHERS.has(s.station)) return "Digital publications";
  if (s.kind === "digital") return "Digital publications";
  if (s.kind === "podcast") return "Independent podcasts";
  return s.station || "Other";
};

const GROUP_ORDER = [
  "Nation Media Group", "Royal Media Services", "Standard Group", "Mediamax Network",
  "Radio Africa Group", "KBC", "Capital Group", "Home Boyz Media", "Trace Media",
  "Digital publications", "Independent podcasts",
];

const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

export default function ShowsTab() {
  const [rows, setRows] = useState<Show[]>([]);
  const [contactsByShow, setContactsByShow] = useState<Record<string, ShowContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [openShow, setOpenShow] = useState<Show | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("shows").select("*").order("reach_estimate", { ascending: false }).limit(3000);
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    const { data: cs } = await (supabase as any).from("show_contacts").select("*");
    const g: Record<string, ShowContact[]> = {};
    (cs ?? []).forEach((c: any) => { (g[c.show_id] ||= []).push(c); });
    setContactsByShow(g);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (groupFilter !== "all" && groupOf(r) !== groupFilter) return false;
      if (!term) return true;
      const hay = [r.name, r.station, r.description, groupOf(r), ...(r.host_names || []), ...(r.niche || [])].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q, kindFilter, groupFilter]);

  const grouped = useMemo(() => {
    const m = new Map<string, Show[]>();
    for (const r of filtered) {
      const g = groupOf(r);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    // sort within group by reach desc
    for (const arr of m.values()) arr.sort((a, b) => (Number(b.reach_estimate) || 0) - (Number(a.reach_estimate) || 0));
    // sort groups by predefined order, then alpha, and by size
    const order = Array.from(m.keys()).sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return (m.get(b)?.length || 0) - (m.get(a)?.length || 0);
    });
    return order.map(k => ({ group: k, items: m.get(k)! }));
  }, [filtered]);

  const availableGroups = useMemo(() => {
    const set = new Set(rows.map(groupOf));
    return Array.from(set).sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rows]);

  // Aggregate contacts for a whole media house (dedupe by kind+value)
  const groupContacts = (items: Show[]): ShowContact[] => {
    const seen = new Set<string>();
    const out: ShowContact[] = [];
    for (const s of items) {
      for (const c of contactsByShow[s.id] || []) {
        const key = `${c.kind}::${c.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  };

  const runSeed = async () => {
    if (!confirm("Fetch popular Kenyan media properties — TV shows, radio programmes, podcasts and digital publishers like Kenya Wall Street, Business Daily and Techweez? Runs in the background for several minutes.")) return;
    setSeeding(true);
    const t = toast.loading("Starting KE media seed…");
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
          <h2 className="font-display text-2xl">Media houses &amp; properties</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Grouped by media house — see each group's flagship shows, radio programmes, podcasts and digital publications with their contacts in one place.
          </p>
        </div>
        <Button onClick={runSeed} disabled={seeding} variant="outline">
          {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {rows.length ? "Top up media" : "Seed KE media & properties"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search show, host, station, publisher…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="tv">TV</SelectItem>
            <SelectItem value="radio">Radio</SelectItem>
            <SelectItem value="podcast">Podcast</SelectItem>
            <SelectItem value="digital">Digital</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All media houses</SelectItem>
            {availableGroups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground ml-auto">
          {grouped.length} media {grouped.length === 1 ? "house" : "houses"} · {filtered.length} properties
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No media properties yet</h3>
          <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
            Click <strong>Seed KE media &amp; properties</strong> to fetch Kenyan TV, radio, podcasts and digital publications grouped by media house.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ group, items }) => {
            const meta = GROUP_META[group];
            const isExpanded = !!expanded[group];
            const topN = 6;
            const visible = isExpanded ? items : items.slice(0, topN);
            const contacts = groupContacts(items);
            const kinds = Array.from(new Set(items.map(i => i.kind)));
            const category = meta?.category || "broadcaster";
            const categoryLabel = category === "publisher" ? "Publisher" : category === "independent" ? "Independent" : "Broadcaster";

            return (
              <Card key={group} className="p-0 overflow-hidden">
                <div className="p-5 border-b border-border bg-secondary/30 flex flex-wrap items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-border flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl leading-tight">{group}</h3>
                      <Badge variant="outline" className="text-[10px] uppercase">{categoryLabel}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{items.length} {items.length === 1 ? "property" : "properties"}</Badge>
                      {kinds.map(k => {
                        const KI = KIND_ICON[k] || Tv;
                        return <Badge key={k} variant="outline" className="text-[10px] gap-1"><KI className="w-3 h-3" />{KIND_LABEL[k] || k}</Badge>;
                      })}
                    </div>
                    {meta?.desc && <p className="text-sm text-muted-foreground mt-1">{meta.desc}</p>}
                  </div>
                  {contacts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-w-full">
                      {contacts.slice(0, 3).map(c => {
                        const isEmail = c.kind === "email";
                        const isPhone = c.kind === "phone" || c.kind === "whatsapp";
                        const Icon = isEmail ? Mail : c.kind === "whatsapp" ? MessageCircle : isPhone ? Phone : ExternalLink;
                        const href = isEmail ? `mailto:${c.value}` : isPhone ? `tel:${c.value.replace(/\s+/g, "")}` : c.value;
                        return (
                          <a key={c.id} href={href} target={isEmail || isPhone ? undefined : "_blank"} rel="noreferrer"
                            className="inline-flex items-center gap-1.5 border border-border rounded-md px-2 py-1 text-xs hover:bg-secondary">
                            <Icon className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono truncate max-w-[180px]">{c.value}</span>
                          </a>
                        );
                      })}
                      {contacts.length > 3 && (
                        <Badge variant="secondary" className="text-[10px] self-center">+{contacts.length - 3} more</Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="divide-y divide-border">
                  {visible.map(s => {
                    const KIcon = KIND_ICON[s.kind] || Tv;
                    const cs = contactsByShow[s.id] || [];
                    return (
                      <button key={s.id} onClick={() => setOpenShow(s)}
                        className="w-full text-left p-4 flex items-center gap-4 hover:bg-secondary/40 transition-colors">
                        <div className="w-10 h-10 rounded-md bg-secondary/60 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                          {s.logo_url ? <img src={s.logo_url} className="w-full h-full object-cover" alt={s.name} /> : <KIcon className="w-5 h-5 text-foreground/60" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-display text-base truncate">{s.name}</div>
                            <Badge variant="outline" className="text-[9px] uppercase shrink-0">{KIND_LABEL[s.kind] || s.kind}</Badge>
                            {s.station && s.station !== group && (
                              <span className="text-xs text-muted-foreground truncate">{s.station}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                            {s.airtime && <span>{s.airtime}</span>}
                            {s.host_names && s.host_names.length > 0 && (
                              <span className="truncate">Hosts: {s.host_names.slice(0, 3).join(", ")}{s.host_names.length > 3 ? "…" : ""}</span>
                            )}
                            {(s.niche || []).slice(0, 2).map(n => <Badge key={n} variant="secondary" className="text-[9px]">{n}</Badge>)}
                          </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-1 shrink-0">
                          {(s.platforms || []).slice(0, 4).map(p => {
                            const PI = PLATFORM_ICON[p];
                            return PI ? <PI key={p} className="w-3.5 h-3.5 text-muted-foreground" /> : null;
                          })}
                        </div>
                        <div className="text-right shrink-0 hidden md:block">
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Reach</div>
                          <div className="font-display text-sm">{fmtCompact(Number(s.reach_estimate || 0))}</div>
                        </div>
                        {cs.length > 0 && (
                          <Badge variant="outline" className="text-[9px] shrink-0 hidden lg:inline-flex">{cs.length} contact{cs.length === 1 ? "" : "s"}</Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>

                {items.length > topN && (
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [group]: !e[group] }))}
                    className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground border-t border-border flex items-center justify-center gap-1"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    {isExpanded ? "Show top only" : `Show all ${items.length} properties`}
                  </button>
                )}
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
                <div className="text-sm text-muted-foreground">
                  {openShow.station} · {KIND_LABEL[openShow.kind] || openShow.kind}
                  {groupOf(openShow) !== openShow.station && <> · <span className="italic">{groupOf(openShow)}</span></>}
                </div>
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
                    <Label className="text-xs">Handles</Label>
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

                <div>
                  <Label className="text-xs">Contacts &amp; ways to take it forward</Label>
                  <div className="space-y-1.5 mt-1">
                    {openContacts.length === 0 && <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">No contacts saved yet.</div>}
                    {openContacts.map(ct => {
                      const isEmail = ct.kind === "email";
                      const isPhone = ct.kind === "phone" || ct.kind === "whatsapp";
                      const Icon = isEmail ? Mail : ct.kind === "whatsapp" ? MessageCircle : isPhone ? Phone : ExternalLink;
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
