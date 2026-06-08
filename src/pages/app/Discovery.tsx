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
import { Search, Sparkles, Instagram, Music2, Youtube, Twitter, Facebook, MapPin, ShieldCheck, ExternalLink, Plus, Trash2, Loader2, Wand2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook };
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

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return rows.filter(r => {
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      if (nicheFilter !== "all" && !(r.niche || []).includes(nicheFilter)) return false;
      if (minFollowers && (r.follower_count || 0) < minFollowers) return false;
      if (verifiedOnly && !r.verified_at) return false;
      if (hasContact && !(contactsByCreator[r.id]?.length)) return false;
      if (ql && !(r.full_name.toLowerCase().includes(ql) || (r.handle || "").toLowerCase().includes(ql) || (r.city || "").toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [rows, q, platformFilter, nicheFilter, minFollowers, verifiedOnly, hasContact, contactsByCreator]);

  const ordered = useMemo(() => {
    if (!matches.length) return filtered;
    const scoreMap = new Map(matches.map(m => [m.creator_id, m]));
    const matched = filtered.filter(r => scoreMap.has(r.id)).sort((a, b) => (scoreMap.get(b.id)!.score) - (scoreMap.get(a.id)!.score));
    const rest = filtered.filter(r => !scoreMap.has(r.id));
    return [...matched, ...rest];
  }, [filtered, matches]);

  const runSeed = async () => {
    if (!confirm("Generate AI-suggested Kenya creators across all platforms? This takes ~2 minutes.")) return;
    setSeeding(true);
    const t = toast.loading("Seeding roster with AI…");
    try {
      const { data, error } = await supabase.functions.invoke("discovery-seed", { body: {} });
      if (error) throw error;
      toast.success(`Seeded: +${data.inserted} new, ${data.updated} updated`, { id: t });
      load();
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
          <p className="text-sm text-muted-foreground mt-1">AI-suggested Kenyan influencers across Instagram, TikTok, YouTube, X, and Facebook. Verify before outreach.</p>
        </div>
        <Button variant="outline" onClick={runSeed} disabled={seeding}>
          {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {rows.length ? "Top up roster" : "Seed Kenya roster"}
        </Button>
      </div>

      {/* Matchmaker */}
      <Card className="p-5 mb-6 border-accent/40">
        <div className="flex items-center gap-2 mb-3"><Wand2 className="w-4 h-4 text-accent" /><h2 className="font-display text-lg">Find creators for a brief</h2></div>
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
        <div className="mt-3"><Label>Notes</Label><Textarea rows={2} value={brief.notes} onChange={e => setBrief({ ...brief, notes: e.target.value })} placeholder="Anything else the matcher should weigh" /></div>
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
          <Input className="pl-9" placeholder="Name, handle, city…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
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
        <div className="text-sm text-muted-foreground ml-auto">{ordered.length} of {rows.length}</div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-16 text-center">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No creators yet</h3>
          <p className="text-muted-foreground mt-2 text-sm">Click <strong>Seed Kenya roster</strong> to brainstorm ~1,000 creators with AI.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ordered.map(c => {
            const Icon = PLATFORM_ICON[c.platform] || Instagram;
            const match = matches.find(m => m.creator_id === c.id);
            const contacts = contactsByCreator[c.id] || [];
            return (
              <Card key={c.id} className={`p-5 flex flex-col group hover:shadow-md transition-all ${match ? "border-accent" : ""}`}>
                {match && (
                  <div className="mb-3 -mt-1 text-xs bg-accent/10 text-accent rounded-md px-2 py-1.5">
                    <div className="font-medium">Match {match.score} — {match.reason}</div>
                    {match.angle && <div className="text-accent/80 italic mt-0.5">Angle: {match.angle}</div>}
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-secondary to-secondary/40 border border-border flex items-center justify-center font-display text-lg uppercase">
                    {c.full_name?.[0] ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base leading-tight truncate flex items-center gap-1">
                      {c.full_name}
                      {c.verified_at && <BadgeCheck className="w-3.5 h-3.5 text-success shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 min-w-0">
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="truncate">@{c.handle}</span>
                      {c.profile_url && <a href={c.profile_url} target="_blank" rel="noreferrer" className="text-accent"><ExternalLink className="w-3 h-3" /></a>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 mt-4 rounded-md border border-border bg-secondary/30 divide-x divide-border overflow-hidden">
                  <div className="p-2.5 text-center"><div className="font-display text-base">{fmtCompact(c.follower_count)}</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Followers</div></div>
                  <div className="p-2.5 text-center"><div className="font-display text-base">{Number(c.engagement_rate || 0).toFixed(1)}%</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Engagement</div></div>
                  <div className="p-2.5 text-center"><div className="font-display text-base inline-flex items-center gap-1 justify-center max-w-full"><MapPin className="w-3 h-3 text-muted-foreground shrink-0" /><span className="truncate">{c.city || "—"}</span></div><div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">City</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap min-h-[22px]">
                  <div className="flex flex-wrap gap-1">
                    {(c.niche || []).slice(0, 3).map(n => <Badge key={n} variant="outline" className="text-[10px] font-normal py-0 px-1.5 h-5 capitalize">{n}</Badge>)}
                  </div>
                  {!c.verified_at && <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />AI {Math.round((c.ai_confidence || 0) * 100)}%</span>}
                </div>
                <div className="mt-3 flex gap-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpenCreator(c)}>Details {contacts.length > 0 && <span className="ml-1 text-[10px]">({contacts.length})</span>}</Button>
                  <Button variant="outline" size="sm" onClick={() => addToRoster(c)} title="Add to influencer roster"><Plus className="w-3 h-3" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
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
                    {(contactsByCreator[openCreator.id] || []).map(ct => (
                      <div key={ct.id} className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5 text-sm">
                        <Badge variant="outline" className="text-[10px] capitalize">{ct.kind}</Badge>
                        <span className="flex-1 truncate">{ct.value}</span>
                        {ct.is_public ? <span className="text-[10px] text-muted-foreground">public</span> : <span className="text-[10px] text-accent">private</span>}
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteContact(ct.id, openCreator.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    ))}
                  </div>
                  <ContactAdder creatorId={openCreator.id} onAdd={addContact} />
                </div>

                <Button className="w-full" onClick={() => addToRoster(openCreator)}><Plus className="w-3 h-3 mr-1" /> Add to influencer roster</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
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
        <label className="text-xs flex items-center gap-2"><Switch checked={isPublic} onCheckedChange={setIsPublic} /> Public</label>
        <Button size="sm" onClick={() => { onAdd(creatorId, kind, value, isPublic); setValue(""); }}>Add</Button>
      </div>
    </div>
  );
};

export default Discovery;
