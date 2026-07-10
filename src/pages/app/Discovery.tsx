import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Sparkles, Instagram, Music2, Youtube, Twitter, Facebook, MapPin, ShieldCheck, ExternalLink, Plus, Trash2, Loader2, Wand2, BadgeCheck, Phone, Mail, MessageCircle, Tv } from "lucide-react";
import { toast } from "sonner";
import ShowsTab from "./ShowsTab";

const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook, whatsapp: MessageCircle };
const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook"];

const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

type Creator = {
  id: string; full_name: string; handle: string; platform: string; profile_url?: string;
  niche?: string[]; city?: string; region?: string; follower_count: number; engagement_rate: number;
  bio?: string; avatar_url?: string; ai_confidence?: number; verified_at?: string | null; notes?: string;
};
type Contact = { id: string; creator_id: string; kind: string; value: string; label?: string; is_public: boolean };

const Stat = ({ label, value, suffix }: { label: string; value: string; suffix?: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9px] font-bold text-background/50 uppercase tracking-[0.2em]">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className="font-display text-2xl md:text-[1.65rem] font-semibold text-background tracking-tight tabular-nums">{value}</span>
      {suffix && <span className="text-sm font-medium text-background/60">{suffix}</span>}
    </div>
  </div>
);
const Divider = () => <div className="h-9 w-px bg-background/15" />;

const Discovery = () => {
  const [rows, setRows] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [nicheFilter, setNicheFilter] = useState<string>("all");
  const [minFollowers, setMinFollowers] = useState<number>(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hasContact, setHasContact] = useState(false);
  const [contactsByCreator, setContactsByCreator] = useState<Record<string, Contact[]>>({});
  const [lookupSearching, setLookupSearching] = useState(false);

  // Matchmaker
  const [brief, setBrief] = useState({ brand: "", category: "", audience: "", platforms: [] as string[], budget_tier: "any", goal: "awareness", notes: "" });
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<Array<{ creator_id: string; score: number; reason: string; angle: string }>>([]);

  // Drawer
  const [openCreator, setOpenCreator] = useState<Creator | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("discovery_creators").select("*").order("follower_count", { ascending: false }).limit(2000);
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    const { data: cs } = await supabase.from("discovery_contacts").select("*");
    const grouped: Record<string, Contact[]> = {};
    (cs ?? []).forEach((c: any) => { (grouped[c.creator_id] ||= []).push(c); });
    setContactsByCreator(grouped);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const niches = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => (r.niche || []).forEach(n => s.add(n)));
    return Array.from(s).sort();
  }, [rows]);

  const normalizeSearch = (value: string) =>
    (value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/^@+/, "")
      .replace(/[^a-z0-9+@.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rowSearchText = (r: Creator) => normalizeSearch([
    r.full_name, r.handle, r.city, r.region, r.bio,
    ...(r.niche || []),
    ...(contactsByCreator[r.id] || []).map(c => c.value),
  ].filter(Boolean).join(" "));

  const queryMatches = useMemo(() => {
    const terms = normalizeSearch(q).split(" ").filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(r => {
      const haystack = rowSearchText(r);
      return terms.every(term => haystack.includes(term));
    });
  }, [rows, q, contactsByCreator]);

  const filtered = useMemo(() => {
    return queryMatches.filter(r => {
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      if (nicheFilter !== "all" && !(r.niche || []).includes(nicheFilter)) return false;
      if (minFollowers && (r.follower_count || 0) < minFollowers) return false;
      if (verifiedOnly && !r.verified_at) return false;
      if (hasContact && !(contactsByCreator[r.id]?.length)) return false;
      return true;
    });
  }, [queryMatches, platformFilter, nicheFilter, minFollowers, verifiedOnly, hasContact, contactsByCreator]);

  const activeFiltersCount = [platformFilter !== "all", nicheFilter !== "all", !!minFollowers, verifiedOnly, hasContact].filter(Boolean).length;

  const clearDiscoveryFilters = () => {
    setPlatformFilter("all");
    setNicheFilter("all");
    setMinFollowers(0);
    setVerifiedOnly(false);
    setHasContact(false);
  };

  // Group rows that are clearly the same person across platforms / handle variants.
  const normalizeName = (s: string) =>
    (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 3).join(" ");

  type Person = {
    key: string;
    full_name: string;
    city?: string;
    bio?: string;
    niches: string[];
    verified_at?: string | null;
    ai_confidence: number;
    follower_total: number;
    engagement_avg: number;
    profiles: Creator[];          // one per platform/handle
    primary: Creator;              // best profile (most followers)
    all_ids: string[];
  };

  const people = useMemo<Person[]>(() => {
    const map = new Map<string, Creator[]>();
    for (const r of filtered) {
      const k = normalizeName(r.full_name) || `id:${r.id}`;
      (map.get(k) || map.set(k, []).get(k)!).push(r);
    }
    return Array.from(map.entries()).map(([key, list]) => {
      // Dedupe profiles within a person by (platform, handle).
      const seen = new Set<string>();
      const profiles = list.filter(p => {
        const k = `${p.platform}::${(p.handle || "").toLowerCase()}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      }).sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
      const primary = profiles[0];
      const niches = Array.from(new Set(profiles.flatMap(p => p.niche || []))).sort();
      const follower_total = profiles.reduce((s, p) => s + (p.follower_count || 0), 0);
      const eng = profiles.filter(p => p.engagement_rate);
      const engagement_avg = eng.length ? eng.reduce((s, p) => s + Number(p.engagement_rate || 0), 0) / eng.length : 0;
      return {
        key, full_name: primary.full_name, city: profiles.find(p => p.city)?.city,
        bio: profiles.find(p => p.bio)?.bio, niches,
        verified_at: profiles.find(p => p.verified_at)?.verified_at ?? null,
        ai_confidence: Math.max(...profiles.map(p => p.ai_confidence || 0)),
        follower_total, engagement_avg, profiles, primary,
        all_ids: profiles.map(p => p.id),
      };
    });
  }, [filtered]);

  const ordered = useMemo(() => {
    if (!matches.length) return people;
    const scoreById = new Map(matches.map(m => [m.creator_id, m.score]));
    const score = (p: Person) => Math.max(0, ...p.all_ids.map(id => scoreById.get(id) ?? 0));
    return [...people].sort((a, b) => score(b) - score(a));
  }, [people, matches]);

  const personMatch = (p: Person) => {
    let best: { creator_id: string; score: number; reason: string; angle: string } | undefined;
    for (const id of p.all_ids) {
      const m = matches.find(x => x.creator_id === id);
      if (m && (!best || m.score > best.score)) best = m;
    }
    return best;
  };
  const personContacts = (p: Person) => {
    const all = p.all_ids.flatMap(id => contactsByCreator[id] || []);
    const seen = new Set<string>();
    return all.filter(c => {
      const k = `${c.kind}::${(c.value || "").trim().toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const openPerson = openCreator ? people.find(p => p.all_ids.includes(openCreator.id)) : null;
  const openContactsRaw = openPerson ? personContacts(openPerson) : openCreator ? contactsByCreator[openCreator.id] || [] : [];
  const openContacts = (() => {
    const seen = new Set<string>();
    return openContactsRaw.filter(c => {
      const k = `${c.kind}::${(c.value || "").trim().toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })();
  const openProfiles = openPerson?.profiles || (openCreator ? [openCreator] : []);

  const lookupCreator = async (rawQuery = q) => {
    const trimmed = rawQuery.trim();
    if (!trimmed || lookupSearching) return;
    setLookupSearching(true);
    const t = toast.loading(`Looking up "${trimmed}" across socials…`);
    try {
      const { data, error } = await supabase.functions.invoke("discovery-enrich", { body: { query: trimmed } });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.message || "Couldn't identify that person.", { id: t });
        return;
      }
      toast.success(`Added ${data.added} profile${data.added === 1 ? "" : "s"} for ${data.name}`, { id: t });
      await load();
    } catch (e: any) {
      toast.error(e.message || "Lookup failed", { id: t });
    } finally {
      setLookupSearching(false);
    }
  };

  const submitSearch = async () => {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (queryMatches.length > 0) {
      if (activeFiltersCount) clearDiscoveryFilters();
      toast.success(`Showing ${queryMatches.length} matching profile${queryMatches.length === 1 ? "" : "s"}`);
      return;
    }
    await lookupCreator(trimmed);
  };

  const runSeed = async () => {
    if (!confirm("Generate more suggested Kenyan creators across all platforms? This runs in the background for several minutes.")) return;
    setSeeding(true);
    const t = toast.loading("Starting background seed…");
    try {
      const { data, error } = await supabase.functions.invoke("discovery-seed", { body: {} });
      if (error) throw error;
      toast.success(data?.message || "Seeding started. Refresh in a few minutes to see new creators.", { id: t, duration: 8000 });
      // Poll the roster a few times so new rows appear without a manual refresh.
      setTimeout(load, 30_000);
      setTimeout(load, 90_000);
      setTimeout(load, 180_000);
    } catch (e: any) {
      toast.error(e.message || "Seed failed", { id: t });
    } finally { setSeeding(false); }
  };

  const runMatch = async () => {
    if (!brief.brand && !brief.category) { toast.error("Add at least a brand or category"); return; }
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("discovery-match", { body: brief });
      if (error) throw error;
      setMatches(data.matches || []);
      toast.success(`${data.matches?.length || 0} matches ranked`);
    } catch (e: any) { toast.error(e.message || "Match failed"); }
    finally { setMatching(false); }
  };

  const verifyCreator = async (id: string) => {
    const { error } = await (supabase.from("discovery_creators") as any).update({ verified_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Verified");
    load();
  };

  const addToRoster = async (c: Creator) => {
    const payload = {
      full_name: c.full_name, handle: c.handle, primary_platform: c.platform as any,
      niche: (c.niche || []).join(", "), follower_count: c.follower_count,
      engagement_rate: c.engagement_rate, region: c.region || "Kenya",
    };
    const { error } = await (supabase.from("influencers") as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success(`${c.full_name} added to roster`);
  };

  const addContact = async (creatorId: string, kind: string, value: string, is_public: boolean) => {
    if (!value.trim()) return;
    const { error } = await supabase.from("discovery_contacts").insert({ creator_id: creatorId, kind, value: value.trim(), is_public });
    if (error) return toast.error(error.message);
    const { data: cs } = await supabase.from("discovery_contacts").select("*").eq("creator_id", creatorId);
    setContactsByCreator(prev => ({ ...prev, [creatorId]: (cs as any) || [] }));
  };
  const deleteContact = async (id: string, creatorId: string) => {
    await supabase.from("discovery_contacts").delete().eq("id", id);
    setContactsByCreator(prev => ({ ...prev, [creatorId]: (prev[creatorId] || []).filter(c => c.id !== id) }));
  };

  const togglePlatformBrief = (p: string) => {
    setBrief(b => ({ ...b, platforms: b.platforms.includes(p) ? b.platforms.filter(x => x !== p) : [...b.platforms, p] }));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-6 gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Discovery</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Find creators</h1>
          <p className="text-sm text-muted-foreground mt-1">Kenyan creators and industry contacts across Instagram, TikTok, YouTube, X, Facebook and direct WhatsApp/phone. Verify before outreach.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            const t = toast.loading("Pulling socials + contacts in background…");
            try {
              const { data, error } = await supabase.functions.invoke("discovery-enrich", { body: {} });
              if (error) throw error;
              toast.success(data?.message || "Enrichment started", { id: t, duration: 8000 });
              setTimeout(load, 60_000);
              setTimeout(load, 180_000);
            } catch (e: any) { toast.error(e.message || "Enrich failed", { id: t }); }
          }}>
            <BadgeCheck className="w-4 h-4 mr-2" />Enrich contacts
          </Button>
          <Button variant="outline" onClick={runSeed} disabled={seeding}>
            {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {rows.length ? "Top up roster" : "Seed Kenya roster"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="creators" className="w-full">
        <TabsList className="mb-8 h-auto p-1.5 bg-muted/60 rounded-2xl gap-1 w-full sm:w-auto inline-flex">
          <TabsTrigger
            value="creators"
            className="px-6 py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground text-muted-foreground font-display text-base"
          >
            <Sparkles className="w-4 h-4 mr-2" />Creators
          </TabsTrigger>
          <TabsTrigger
            value="shows"
            className="px-6 py-3 rounded-xl data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-lg text-muted-foreground font-display text-base"
          >
            <Tv className="w-4 h-4 mr-2" />Media houses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shows"><ShowsTab /></TabsContent>

        <TabsContent value="creators">

      {/* Matchmaker */}
      <Card className="p-5 mb-6 border-accent/40">
        <div className="flex items-center gap-2 mb-3"><Wand2 className="w-4 h-4 text-accent" /><h2 className="font-display text-lg">Match creators to a brief</h2></div>
        <div className="grid md:grid-cols-3 gap-3">
          <div><Label>Brand / product</Label><Input value={brief.brand} onChange={e => setBrief({ ...brief, brand: e.target.value })} placeholder="e.g. Lipa Later" /></div>
          <div><Label>Category</Label><Input value={brief.category} onChange={e => setBrief({ ...brief, category: e.target.value })} placeholder="fintech, beauty, food" /></div>
          <div><Label>Audience</Label><Input value={brief.audience} onChange={e => setBrief({ ...brief, audience: e.target.value })} placeholder="Gen Z women Nairobi" /></div>
          <div>
            <Label>Budget tier</Label>
            <Select value={brief.budget_tier} onValueChange={v => setBrief({ ...brief, budget_tier: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="nano">Nano (1K–10K)</SelectItem>
                <SelectItem value="micro">Micro (10K–100K)</SelectItem>
                <SelectItem value="mid">Mid (100K–500K)</SelectItem>
                <SelectItem value="macro">Macro (500K+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Goal</Label>
            <Select value={brief.goal} onValueChange={v => setBrief({ ...brief, goal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="awareness">Awareness</SelectItem>
                <SelectItem value="conversions">Conversions</SelectItem>
                <SelectItem value="ugc">UGC</SelectItem>
                <SelectItem value="community">Community</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Platforms</Label>
            <div className="flex gap-1 flex-wrap mt-1">
              {PLATFORMS.map(p => {
                const Icon = PLATFORM_ICON[p];
                const on = brief.platforms.includes(p);
                return <Button key={p} type="button" size="sm" variant={on ? "default" : "outline"} className="h-7 capitalize" onClick={() => togglePlatformBrief(p)}><Icon className="w-3 h-3 mr-1" />{p}</Button>;
              })}
            </div>
          </div>
        </div>
        <div className="mt-3"><Label>Notes</Label><Textarea rows={2} value={brief.notes} onChange={e => setBrief({ ...brief, notes: e.target.value })} placeholder="Anything else to weigh in the match" /></div>
        <div className="mt-3 flex gap-2">
          <Button onClick={runMatch} disabled={matching} className="bg-primary">
            {matching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}Rank matches
          </Button>
          {matches.length > 0 && <Button variant="ghost" onClick={() => setMatches([])}>Clear ranking</Button>}
        </div>
      </Card>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Name, handle, city…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitSearch();
              }
            }}
            aria-label="Search creators"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => void submitSearch()} disabled={loading || lookupSearching || !q.trim()}>
          {lookupSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Search
        </Button>
        {q.trim() && <Button type="button" variant="ghost" onClick={() => setQ("")}>Clear</Button>}
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={nicheFilter} onValueChange={setNicheFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All niches</SelectItem>
            {niches.map(n => <SelectItem key={n} value={n} className="capitalize">{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(minFollowers)} onValueChange={v => setMinFollowers(Number(v))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any followers</SelectItem>
            <SelectItem value="1000">1K+</SelectItem>
            <SelectItem value="10000">10K+</SelectItem>
            <SelectItem value="100000">100K+</SelectItem>
            <SelectItem value="500000">500K+</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm"><Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} /> Verified</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={hasContact} onCheckedChange={setHasContact} /> Has contact</label>
        <div className="text-sm text-muted-foreground ml-auto">{ordered.length} people · {rows.length} profiles</div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No creators yet</h3>
          <p className="text-muted-foreground mt-2 text-sm">Click <strong>Seed Kenya roster</strong> to brainstorm ~1,000 creators.</p>
        </Card>
      ) : (
        <>
        {q.trim() && ordered.length === 0 && queryMatches.length > 0 && (
          <Card className="p-8 text-center mb-6 border-dashed">
            <p className="text-sm text-muted-foreground">
              Found <strong>{queryMatches.length}</strong> profile{queryMatches.length === 1 ? "" : "s"} matching <strong>"{q}"</strong>, but {activeFiltersCount ? "your current filters are hiding them" : "they are hidden by the current view"}.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={clearDiscoveryFilters}
            >
              Clear filters and show results
            </Button>
          </Card>
        )}
        {q.trim() && ordered.length === 0 && queryMatches.length === 0 && (
          <Card className="p-8 text-center mb-6 border-dashed">
            <p className="text-sm text-muted-foreground">No creators in your roster match <strong>"{q}"</strong>.</p>
            <Button
              className="mt-3"
              onClick={() => void lookupCreator(q)}
              disabled={lookupSearching}
            >
              {lookupSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
              Find "{q}" across socials
            </Button>
          </Card>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">

          {ordered.map(p => {
            const match = personMatch(p);
            const contacts = personContacts(p);
            return (
              <Card
                key={p.key}
                className={`relative overflow-hidden rounded-[2rem] border bg-card p-0 shadow-sm hover:shadow-elegant hover:-translate-y-1 transition-all duration-500 h-full flex flex-col group ${match ? "border-accent" : "border-border"}`}
              >
                {match && (
                  <div className="px-7 pt-5 -mb-1 text-[11px] bg-accent/10 text-accent">
                    <div className="font-semibold">Match {match.score} — {match.reason}</div>
                    {match.angle && <div className="text-accent/80 italic mt-0.5">Angle: {match.angle}</div>}
                  </div>
                )}

                {/* Header */}
                <div className="p-7 pb-5">
                  <div className="flex justify-between items-start mb-5 gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative shrink-0">
                        <div className="absolute -inset-1.5 bg-gradient-to-tr from-primary to-accent rounded-2xl blur-md opacity-15 group-hover:opacity-35 transition-opacity" />
                        <div className="relative w-16 h-16 rounded-xl bg-white border border-border flex items-center justify-center shadow-sm overflow-hidden font-display text-2xl uppercase text-foreground/70">
                          {p.primary.avatar_url ? (
                            <img
                              src={p.primary.avatar_url}
                              alt={p.full_name}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : null}
                          <span className="relative">{p.full_name?.[0] ?? "?"}</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-[0.22em] text-muted-foreground uppercase">Creator</p>
                        <p className="text-[11px] font-semibold text-foreground/70 mt-0.5 uppercase tracking-wider truncate">
                          {p.city || "Kenya"}
                        </p>
                      </div>
                    </div>
                    {p.verified_at ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 shrink-0">
                        <BadgeCheck className="w-3 h-3 text-success" />
                        <span className="text-[10px] font-bold text-success uppercase tracking-widest">Verified</span>
                      </div>
                    ) : null}
                  </div>

                  <h2 className="font-display text-2xl md:text-[1.6rem] font-semibold text-foreground leading-[1.15] break-words mb-3 group-hover:text-primary transition-colors duration-300">
                    {p.full_name}
                  </h2>

                  <div className="flex flex-wrap gap-1.5">
                    {p.profiles.map(pr => {
                      const Icon = PLATFORM_ICON[pr.platform] || Instagram;
                      return (
                        <a
                          key={pr.id}
                          href={pr.profile_url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => { if (!pr.profile_url) e.preventDefault(); }}
                          className="inline-flex items-center gap-1.5 text-[11px] bg-secondary hover:bg-secondary/70 rounded-lg px-2 py-1 transition-colors max-w-full"
                          title={`@${pr.handle} · ${fmtCompact(pr.follower_count)} on ${pr.platform}`}
                        >
                          <Icon className="w-3 h-3 shrink-0 text-foreground/70" />
                          <span className="truncate max-w-[90px] font-semibold text-foreground/80">@{pr.handle}</span>
                          <span className="text-muted-foreground tabular-nums">{fmtCompact(pr.follower_count)}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>

                {/* Niches + contacts */}
                <div className="px-7 pb-5 flex flex-col gap-3">
                  {p.niches.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.niches.slice(0, 4).map(n => <Badge key={n} variant="outline" className="text-[10px] font-normal py-0 px-1.5 h-5 capitalize">{n}</Badge>)}
                      {p.niches.length > 4 && <span className="text-[10px] text-muted-foreground self-center">+{p.niches.length - 4}</span>}
                    </div>
                  )}
                  {contacts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {contacts.slice(0, 3).map(ct => {
                        const isEmail = ct.kind === "email" || ct.kind === "manager_email";
                        const isPhone = ct.kind === "phone" || ct.kind === "whatsapp";
                        const Icon = isEmail ? Mail : isPhone ? Phone : ExternalLink;
                        const href = isEmail ? `mailto:${ct.value}` : isPhone ? `tel:${ct.value.replace(/\s+/g, "")}` : ct.value;
                        return (
                          <a
                            key={ct.id}
                            href={href}
                            target={isEmail || isPhone ? undefined : "_blank"}
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-[11px] bg-secondary hover:bg-secondary/70 rounded-lg px-2 py-1 transition-colors max-w-full"
                            title={`${ct.kind}: ${ct.value}`}
                          >
                            <Icon className="w-3 h-3 shrink-0 text-foreground/70" />
                            <span className="truncate max-w-[160px] font-medium text-foreground/80">{ct.value}</span>
                          </a>
                        );
                      })}
                      {contacts.length > 3 && <span className="text-[10px] text-muted-foreground self-center">+{contacts.length - 3}</span>}
                    </div>
                  )}
                </div>

                {/* KPI strip — pinned to bottom for consistent alignment across cards */}
                <div className="mx-5 mb-4 rounded-2xl bg-foreground text-background p-6 flex items-center justify-between shadow-lg mt-auto">
                  <Stat label="Total Reach" value={fmtCompact(p.follower_total)} />
                  <Divider />
                  <Stat label="Avg Eng" value={p.engagement_avg.toFixed(1)} suffix="%" />
                  <Divider />
                  <Stat label="Profiles" value={String(p.profiles.length)} />
                </div>

                {/* Actions */}
                <div className="px-7 pb-5">
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpenCreator(p.primary)}>
                      Details {contacts.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({contacts.length})</span>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addToRoster(p.primary)} title="Add to influencer roster"><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>

                {/* Accent bar */}
                <div className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary" />
              </Card>
            );
          })}
        </div>
        </>
      )}


      {/* Detail drawer */}
      <Sheet open={!!openCreator} onOpenChange={(o) => !o && setOpenCreator(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {openCreator && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">{openCreator.full_name} {openCreator.verified_at && <BadgeCheck className="w-4 h-4 text-success" />}</SheetTitle>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  @{openCreator.handle} · {openCreator.platform}
                  {openCreator.profile_url && <a href={openCreator.profile_url} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1">profile <ExternalLink className="w-3 h-3" /></a>}
                </div>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {openCreator.bio && <p className="text-sm">{openCreator.bio}</p>}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs uppercase text-muted-foreground">Followers</div><div className="font-display">{fmtCompact(openCreator.follower_count)}</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">Engagement</div><div className="font-display">{Number(openCreator.engagement_rate).toFixed(1)}%</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">City</div><div className="font-display">{openCreator.city || "—"}</div></div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display">Contacts</h4>
                    {!openCreator.verified_at && <Button size="sm" variant="ghost" onClick={() => verifyCreator(openCreator.id)}><BadgeCheck className="w-3 h-3 mr-1" /> Mark verified</Button>}
                  </div>
                  <div className="space-y-2">
                    {openProfiles.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {openProfiles.map(pr => {
                          const Icon = PLATFORM_ICON[pr.platform] || Instagram;
                          return (
                            <a
                              key={pr.id}
                              href={pr.profile_url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => { if (!pr.profile_url) e.preventDefault(); }}
                              className="inline-flex items-center gap-1.5 text-[11px] bg-secondary hover:bg-secondary/70 rounded-lg px-2 py-1 transition-colors max-w-full"
                            >
                              <Icon className="w-3 h-3 shrink-0" />
                              @{pr.handle}
                            </a>
                          );
                        })}
                      </div>
                    )}
                    {openContacts.map(ct => (
                      <div key={ct.id} className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5 text-sm">
                        <Badge variant="outline" className="text-[10px] capitalize">{ct.kind}</Badge>
                        <span className="flex-1 truncate">{ct.value}</span>
                        {ct.is_public ? <span className="text-[10px] text-muted-foreground">public</span> : <span className="text-[10px] text-accent">private</span>}
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteContact(ct.id, ct.creator_id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    ))}
                    {openContacts.length === 0 && <div className="text-sm text-muted-foreground border border-dashed rounded-md p-3">No contacts saved yet for these profiles.</div>}
                  </div>
                  <ContactAdder creatorId={openCreator.id} onAdd={addContact} />
                </div>

                <Button className="w-full" onClick={() => addToRoster(openCreator)}><Plus className="w-3 h-3 mr-1" /> Add to influencer roster</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

        </TabsContent>
      </Tabs>
    </div>
  );
};

const ContactAdder = ({ creatorId, onAdd }: { creatorId: string; onAdd: (id: string, kind: string, value: string, isPublic: boolean) => void }) => {
  const [kind, setKind] = useState("email");
  const [value, setValue] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="flex gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="manager_email">Manager</SelectItem>
            <SelectItem value="agency">Agency</SelectItem>
            <SelectItem value="link">Link</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="value" value={value} onChange={e => setValue(e.target.value)} className="h-9" />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-xs flex items-center gap-2" title="Public = openly listed in the creator's bio/linktree (safe to surface in shared reports). Private = sourced internally (kept hidden from external/public views).">
          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          Public (from bio/linktree)
        </label>
        <Button size="sm" onClick={() => { onAdd(creatorId, kind, value, isPublic); setValue(""); }}>Add</Button>
      </div>
    </div>
  );
};

export default Discovery;
