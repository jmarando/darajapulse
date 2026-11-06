import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Users, Search, ShieldCheck, Link2, Pencil, ChevronDown, Instagram, Music2, Facebook, MapPin, TrendingUp, RefreshCw, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { AccountChips } from "@/components/creators/AccountChips";
import { AddCreatorsDialog } from "@/components/creators/AddCreatorsDialog";
import { CreatorForm } from "@/components/creators/CreatorForm";
import { accountsOf, CREATOR_PLATFORMS, platformName } from "@/lib/creatorAccounts";
import { candidateFromRow } from "@/lib/creatorCandidates";
import { Combobox } from "@/components/ui/combobox";
import { UNKNOWN, cityItems, countryItems, matchesGeo, useGeo } from "@/lib/geo";

const ALL = "__all__";

// Compact formatter so big follower counts (e.g. 130,000) don't blow up a 3-col stat grid.
const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

const fmtAgo = (iso?: string | null) => {
  if (!iso) return "Never refreshed";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "Just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

// The platforms with a working connect page. X and YouTube's pages only say "coming soon", so they aren't offered.
const INVITE_PLATFORMS = ["tiktok", "instagram", "facebook"];

const InlineNumber = ({ value, format, onSave, step = 1 }: { value: number; format: (v: number) => string; onSave: (v: number) => void; step?: number }) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { setEditing(false); const n = Number(v); if (!Number.isNaN(n) && n !== value) onSave(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); setEditing(false); } }}
        className="h-7 text-center font-display text-lg px-1"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="font-display text-lg w-full hover:bg-secondary rounded px-1 transition-colors truncate"
      title="Click to edit"
    >
      {format(value)}
    </button>
  );
};

const Influencers = () => {
  const [rows, setRows] = useState<any[]>([]);
  // Global search links here with ?q= so the list opens filtered.
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [platform, setPlatform] = useState(ALL);
  const [selected, setSelected] = useState<Record<string, any>>({});
  const [adding, setAdding] = useState<"campaign" | "paste" | null>(null);
  const [sort, setSort] = useState<"recent" | "followers" | "name">("recent");
  const [country, setCountry] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  const { countries, nameOf } = useGeo();

  const load = async () => {
    const { data } = await supabase.from("influencers").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setOpen(true); };
  const openEdit = (r: any) => { setEditing(r); setOpen(true); };
  const toggleSelected = (r: any) => setSelected((all) => {
    const next = { ...all };
    if (next[r.id]) delete next[r.id];
    else next[r.id] = r;
    return next;
  });
  const selectedRows = Object.values(selected);

  const updateField = async (id: string, field: string, value: number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    const { error } = await (supabase.from("influencers") as any).update({ [field]: value }).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };

  const copyInvite = (r: any, invitePlatform: string) => {
    const link = `${window.location.origin}/connect/${invitePlatform}/${r.id}`;
    navigator.clipboard.writeText(link);
    toast.success(`${platformName(invitePlatform)} invite link copied`);
  };

  const missingEmail = rows.filter(r => !r.email).length;
  // Country/city options come from the roster itself, so only real values show.
  const usedCountries = countries.filter(c => rows.some(r => r.country_code === c.code));
  const usedCities = [...new Set(rows
    .filter(r => country === ALL || country === UNKNOWN ? true : r.country_code === country)
    .map(r => r.city).filter(Boolean))] as string[];
  // Countries carried over from the old "Kenya" default have never been confirmed.
  const unconfirmed = rows.filter(r => r.country_code && r.country_source !== "verified").length;
  const filtered = rows
    .filter(r => !unconfirmedOnly || (r.country_code && r.country_source !== "verified"))
    .filter(r => matchesGeo({ country: r.country_code, city: r.city }, country, city, ALL))
    .filter(r => platform === ALL || accountsOf(r).some(a => a.platform === platform))
    .filter(r => !q || r.full_name.toLowerCase().includes(q.toLowerCase()) || accountsOf(r).some(a => a.handle.toLowerCase().includes(q.toLowerCase().replace(/^@/, ""))) || (r.niche ?? "").toLowerCase().includes(q.toLowerCase()) || (r.city ?? "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      if (sort === "followers") return Number(b.follower_count ?? 0) - Number(a.follower_count ?? 0);
      if (sort === "name") return String(a.full_name).localeCompare(String(b.full_name));
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Discovery</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Influencer roster</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              toast.message("Refreshing stats…", { description: "Pulling live follower counts and engagement" });
              const { data, error } = await supabase.functions.invoke("refresh-influencer-stats", { body: { force: true, limit: 200 } });
              if (error) return toast.error(error.message);
              toast.success(`Refreshed ${data?.updated ?? 0} of ${data?.checked ?? 0}`, { description: data?.note ?? undefined });
              load();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh stats
          </Button>
          <Button variant="outline" onClick={() => setAdding("paste")}>
            <ListPlus className="w-4 h-4 mr-2" /> Paste a list
          </Button>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); } }}>
          <DialogTrigger asChild><Button className="bg-primary" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add influencer</Button></DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display text-2xl">{editing ? "Edit influencer" : "Add to roster"}</DialogTitle></DialogHeader>
            <CreatorForm key={editing?.id ?? "new"} row={editing ?? undefined} roster={rows} onSaved={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, handle, niche, city…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Combobox allValue={ALL} value={platform} onChange={setPlatform}
          placeholder="All platforms" items={CREATOR_PLATFORMS.map((p) => ({ id: p.key, label: p.label }))} />
        <Combobox allValue={ALL} value={country} onChange={(v) => { setCountry(v); setCity(ALL); }}
          placeholder="All countries" items={countryItems(usedCountries)} />
        <Combobox allValue={ALL} value={city} onChange={setCity}
          placeholder="All cities" items={cityItems(usedCities)} />
        {unconfirmed > 0 && (
          <Button size="sm" variant={unconfirmedOnly ? "default" : "outline"} onClick={() => setUnconfirmedOnly(v => !v)}
            title="Countries carried over from the old Kenya default — open a creator and save their country to confirm it">
            Country not confirmed ({unconfirmed})
          </Button>
        )}
        <div className="flex items-center gap-1">
          {([["recent", "Recently added"], ["followers", "Followers"], ["name", "Name"]] as const).map(([k, label]) => (
            <Button key={k} size="sm" variant={sort === k ? "default" : "outline"} onClick={() => setSort(k as any)}>{label}</Button>
          ))}
        </div>
        {missingEmail > 0 && (
          <Badge variant="outline" className="border-destructive/40 text-destructive">{missingEmail} without email</Badge>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-16 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No influencers in your roster</h3>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => {
            const accounts = accountsOf(r);
            // Invite through their main platform when it has a connect page, or else the first of theirs that does.
            const invitePlatform = accounts.map((a) => a.platform).find((p) => INVITE_PLATFORMS.includes(p)) ?? "tiktok";
            const niches = (r.niche || "").split(/[•,·|\/]+/).map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
            return (
            <Card key={r.id} className="p-5 flex flex-col group hover:shadow-md hover:border-accent/40 transition-all">
              {/* Header: avatar + name + edit */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-secondary to-secondary/40 border border-border flex items-center justify-center font-display text-lg uppercase">
                  {r.full_name?.[0] ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base leading-tight truncate" title={r.full_name}>{r.full_name}</div>
                  <div className="mt-1 min-w-0"><AccountChips accounts={accounts} /></div>
                  {r.email ? (
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={r.email}>{r.email}</div>
                  ) : (
                    <button type="button" onClick={() => openEdit(r)} className="text-[11px] text-destructive mt-0.5 hover:underline">Add email</button>
                  )}
                </div>
                <Checkbox className="mt-1 shrink-0" aria-label={`Select ${r.full_name}`} checked={!!selected[r.id]} onCheckedChange={() => toggleSelected(r)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(r)} title="Edit influencer" aria-label={`Edit ${r.full_name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Stat strip — compact numbers so the grid actually fits */}
              <div className="grid grid-cols-3 mt-4 rounded-md border border-border bg-secondary/30 divide-x divide-border overflow-hidden">
                <div className="p-2.5 text-center min-w-0">
                  <InlineNumber value={Number(r.follower_count)} format={fmtCompact} onSave={(v) => updateField(r.id, "follower_count", v)} />
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Followers</div>
                </div>
                <div className="p-2.5 text-center min-w-0">
                  <InlineNumber value={Number(r.engagement_rate)} step={0.1} format={(v) => `${v.toFixed(1)}%`} onSave={(v) => updateField(r.id, "engagement_rate", v)} />
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Engagement</div>
                </div>
                <div className="p-2.5 text-center min-w-0">
                  <div className="font-display text-base inline-flex items-center gap-1 justify-center max-w-full">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate" title={[r.city, nameOf(r.country_code)].filter(Boolean).join(", ")}>
                      {r.city || nameOf(r.country_code)}
                    </span>
                    {r.country_code && r.country_source !== "verified" && (
                      <span className="text-[9px] text-muted-foreground" title="Carried over from the old default — not confirmed">?</span>
                    )}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                    {r.city ? nameOf(r.country_code) : r.country_code && r.country_source !== "verified" ? "Country · unconfirmed" : "Country"}
                  </div>
                </div>
              </div>

              {/* Niche chips + trust score */}
              <div className="mt-3 flex items-center justify-between gap-2 flex-wrap min-h-[22px]">
                <div className="flex flex-wrap gap-1 min-w-0">
                  {niches.map((n: string) => (
                    <Badge key={n} variant="outline" className="text-[10px] font-normal py-0 px-1.5 h-5">{n}</Badge>
                  ))}
                </div>
                <div className="inline-flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                  <span title={r.last_metrics_sync ? `Last refreshed ${new Date(r.last_metrics_sync).toLocaleString()}` : "Stats never refreshed"}>
                    {fmtAgo(r.last_metrics_sync)}
                  </span>
                  <span className="inline-flex items-center gap-1" title="Authenticity score">
                    <ShieldCheck className="w-3 h-3 text-success" />
                    <span className="tabular-nums">{Math.round(Number(r.authenticity_score || 0))}</span>
                  </span>
                </div>
              </div>

              {/* Invite action — split button keeps copy intent visible while platform picker is one tap away */}
              <div className="mt-3 flex gap-1">
                <Button variant="outline" size="sm" className="flex-1 min-w-0" onClick={() => copyInvite(r, invitePlatform)}>
                  <Link2 className="w-3 h-3 mr-1.5 shrink-0" /> <span className="truncate">Invite via {platformName(invitePlatform)}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-2 shrink-0" aria-label="Other platforms">
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => copyInvite(r, "tiktok")}><Music2 className="w-3 h-3 mr-2" /> TikTok</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyInvite(r, "instagram")}><Instagram className="w-3 h-3 mr-2" /> Instagram</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyInvite(r, "facebook")}><Facebook className="w-3 h-3 mr-2" /> Facebook</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {selectedRows.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 shadow-lg">
          <span className="text-sm font-medium">{selectedRows.length} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected({})}>Clear</Button>
            <Button size="sm" className="bg-primary" onClick={() => setAdding("campaign")}>Add to a campaign</Button>
          </div>
        </div>
      )}

      {adding && (
        <AddCreatorsDialog
          open
          onOpenChange={(v) => { if (!v) setAdding(null); }}
          campaign={null}
          roster={rows}
          initial={adding === "campaign" ? selectedRows.map(candidateFromRow) : undefined}
          startAt={adding === "paste" ? "paste" : undefined}
          onDone={() => { setAdding(null); setSelected({}); load(); }}
        />
      )}
    </div>
  );
};
export default Influencers;
