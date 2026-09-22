import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DemoRequestDialog from "@/components/DemoRequestDialog";
import PublicFooter from "@/components/PublicFooter";
import { Compass, ExternalLink, Instagram, Loader2, Mail, MapPin, Music2, Search, ShieldCheck, Sparkles, Users, Youtube, Twitter, Facebook, ArrowRight, Calendar, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/darajapulse-logo-1024.png";

const ALL = "all";
const PAGE = 360;
const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook };
const COUNTRY_NAME: Record<string, string> = { KE: "Kenya", UG: "Uganda", TZ: "Tanzania", ZM: "Zambia" };

type Contact = { kind: string; value: string; label?: string | null };
type Profile = { id: string; handle: string; platform: string; profile_url?: string | null; follower_count: number; engagement_rate: number };
type Person = {
  key: string;
  full_name: string;
  city?: string | null;
  country_code?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  verified_at?: string | null;
  niches: string[];
  contacts: Contact[];
  profiles: Profile[];
  follower_total: number;
  engagement_avg: number;
};
type Stats = {
  profiles: number;
  people: number;
  total_followers: number;
  platforms: Record<string, number>;
  countries: Record<string, number>;
  cities: string[];
  niches: string[];
};

const fmtCompact = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
};

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/^@+/, "").replace(/[^a-z0-9+@.]+/g, " ").replace(/\s+/g, " ").trim();
const countryName = (code?: string | null) => code ? COUNTRY_NAME[code] || code : "East Africa";

function Header({ onBook }: { onBook: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-screen-2xl items-center justify-between gap-3 px-4 md:px-6 lg:px-16">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <img src={logo} alt="Daraja Pulse" className="h-11 w-auto shrink-0" data-no-outline />
          <span className="hidden font-display text-lg font-semibold sm:inline">Daraja Pulse</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex">
            Sign in
          </Link>
          <Button onClick={onBook} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Calendar className="size-4" /> Book a meeting
          </Button>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
    </div>
  );
}

function ProfilePill({ profile }: { profile: Profile }) {
  const Icon = PLATFORM_ICON[profile.platform] || Sparkles;
  return (
    <a
      href={profile.profile_url || "#"}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => { if (!profile.profile_url) e.preventDefault(); }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-secondary/70"
      title={`${profile.platform} @${profile.handle}`}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate max-w-[92px]">@{profile.handle}</span>
      <span className="text-muted-foreground tabular-nums">{fmtCompact(profile.follower_count)}</span>
    </a>
  );
}

function CreatorCard({ person, onOpen }: { person: Person; onOpen: () => void }) {
  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-lg border-border bg-card p-0 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant">
      <div className="p-6 pb-4">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary font-display text-xl uppercase text-muted-foreground">
              {person.avatar_url ? <img src={person.avatar_url} alt={person.full_name} loading="lazy" className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
              <span className="absolute inset-0 flex items-center justify-center">{person.full_name?.[0] ?? "?"}</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Creator</div>
              <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{[person.city, countryName(person.country_code)].filter(Boolean).join(", ")}</span>
              </div>
            </div>
          </div>
          {person.verified_at ? <Badge variant="outline" className="shrink-0 border-success/25 bg-success/10 text-success"><ShieldCheck className="mr-1 size-3" />Verified</Badge> : null}
        </div>
        <h2 className="mb-3 break-words font-display text-2xl font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">{person.full_name}</h2>
        {person.bio ? <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{person.bio}</p> : null}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {person.profiles.slice(0, 5).map((profile) => <ProfilePill key={profile.id} profile={profile} />)}
        </div>
        {person.niches.length ? (
          <div className="mt-4 flex flex-wrap gap-1">
            {person.niches.slice(0, 4).map((niche) => <Badge key={niche} variant="outline" className="h-5 px-1.5 py-0 text-[10px] capitalize">{niche}</Badge>)}
            {person.niches.length > 4 ? <span className="self-center text-[10px] text-muted-foreground">+{person.niches.length - 4}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="mx-5 mt-auto grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border text-center">
        <div className="bg-foreground p-3 text-background"><div className="font-display text-xl font-semibold tabular-nums">{fmtCompact(person.follower_total)}</div><div className="text-[9px] uppercase tracking-widest opacity-65">Reach</div></div>
        <div className="bg-foreground p-3 text-background"><div className="font-display text-xl font-semibold tabular-nums">{person.engagement_avg.toFixed(1)}%</div><div className="text-[9px] uppercase tracking-widest opacity-65">Eng</div></div>
        <div className="bg-foreground p-3 text-background"><div className="font-display text-xl font-semibold tabular-nums">{person.profiles.length}</div><div className="text-[9px] uppercase tracking-widest opacity-65">Profiles</div></div>
      </div>
      <div className="p-5">
        <Button variant="outline" className="w-full" onClick={onOpen}>View profile</Button>
      </div>
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-highlight" />
    </Card>
  );
}

export default function PublicDiscovery() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [country, setCountry] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [platform, setPlatform] = useState(ALL);
  const [niche, setNiche] = useState(ALL);
  const [q, setQ] = useState("");
  const [openPerson, setOpenPerson] = useState<Person | null>(null);

  const load = async (append = false, offset = 0) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-discovery-showcase", {
        body: {
          country: country === ALL ? null : country,
          city: city === ALL ? null : city,
          limit: PAGE,
          offset,
        },
      });
      if (error) throw error;
      const incoming = ((data as any)?.people ?? []) as Person[];
      setPeople((prev) => append ? [...prev, ...incoming] : incoming);
      setStats(((data as any)?.stats ?? null) as Stats | null);
      setNextOffset(((data as any)?.next_offset ?? null) as number | null);
    } catch (e: any) {
      toast.error(e?.message || "Could not load Discovery");
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  };

  useEffect(() => { setCity(ALL); }, [country]);
  useEffect(() => { void load(false, 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [country, city]);

  const countries = useMemo(() => Object.keys(stats?.countries ?? {}).sort(), [stats]);
  const cities = useMemo(() => (stats?.cities ?? []).filter((value) => value && value.trim()).sort(), [stats]);
  const niches = useMemo(() => (stats?.niches ?? []).filter(Boolean).slice(0, 80), [stats]);
  const platforms = useMemo(() => Object.keys(stats?.platforms ?? {}).sort(), [stats]);

  const filtered = useMemo(() => {
    const terms = normalize(q).split(" ").filter(Boolean);
    return people.filter((person) => {
      if (platform !== ALL && !person.profiles.some((profile) => profile.platform === platform)) return false;
      if (niche !== ALL && !person.niches.includes(niche)) return false;
      if (terms.length) {
        const hay = normalize([
          person.full_name,
          person.city,
          countryName(person.country_code),
          person.bio,
          ...person.niches,
          ...person.profiles.map((profile) => `${profile.platform} ${profile.handle}`),
          ...person.contacts.map((contact) => contact.value),
        ].filter(Boolean).join(" "));
        if (!terms.every((term) => hay.includes(term))) return false;
      }
      return true;
    });
  }, [people, q, platform, niche]);

  const activeFilters = [country !== ALL, city !== ALL, platform !== ALL, niche !== ALL, !!q.trim()].filter(Boolean).length;
  const clearFilters = () => { setQ(""); setCountry(ALL); setCity(ALL); setPlatform(ALL); setNiche(ALL); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onBook={() => setDemoOpen(true)} />
      <main>
        <section className="border-b border-border bg-gradient-paper">
          <div className="mx-auto grid max-w-screen-2xl gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[1fr_0.9fr] lg:px-16 lg:py-20">
            <div className="flex flex-col justify-center">
              <Badge variant="outline" className="mb-5 w-fit border-accent/30 bg-accent/10 text-accent"><Compass className="mr-1 size-3" /> Public Discovery showcase</Badge>
              <h1 className="max-w-4xl font-display text-4xl font-semibold leading-tight md:text-6xl">
                Explore East Africa’s creator landscape.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Search real creator profiles across Kenya, Uganda and Tanzania. The operational platform stays locked; this view shows the discovery layer prospects can evaluate.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => setDemoOpen(true)} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                  Book a meeting <ArrowRight className="size-4" />
                </Button>
                <Button asChild variant="outline" size="lg"><a href="#directory">Browse creators</a></Button>
              </div>
            </div>
            <div className="grid content-center gap-3 sm:grid-cols-2">
              <Stat label="people indexed" value={fmtCompact(stats?.people ?? 0)} />
              <Stat label="profiles" value={fmtCompact(stats?.profiles ?? 0)} />
              <Stat label="potential reach" value={fmtCompact(stats?.total_followers ?? 0)} />
              <div className="rounded-lg border border-border bg-foreground p-4 text-background shadow-elegant">
                <LockKeyhole className="mb-3 size-5 opacity-75" />
                <div className="font-display text-xl font-semibold">Private tools stay locked</div>
                <p className="mt-2 text-sm opacity-75">Campaigns, reports, inbox, payments and admin data require sign-in.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="directory" className="mx-auto max-w-screen-2xl px-4 py-10 md:px-6 lg:px-16">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Discovery directory</div>
              <h2 className="mt-1 font-display text-3xl font-semibold">Search by name, handle, market or niche</h2>
            </div>
            <div className="text-sm text-muted-foreground">Showing {filtered.length} people from {people.length} loaded</div>
          </div>

          <Card className="mb-6 rounded-lg p-4 shadow-soft">
            <div className="grid gap-3 md:grid-cols-[1fr_repeat(4,minmax(130px,170px))_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators, handles, cities…" className="pl-9" aria-label="Search public Discovery" />
              </div>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All countries</SelectItem>
                  {countries.map((code) => <SelectItem key={code} value={code}>{countryName(code)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={ALL}>All cities</SelectItem>
                  {cities.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue placeholder="Platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All platforms</SelectItem>
                  {platforms.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger><SelectValue placeholder="Niche" /></SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={ALL}>All niches</SelectItem>
                  {niches.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" onClick={clearFilters} disabled={!activeFilters}>Clear</Button>
            </div>
          </Card>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" /> Loading Discovery…</div>
          ) : filtered.length === 0 ? (
            <Card className="rounded-lg p-12 text-center">
              <Search className="mx-auto mb-4 size-8 text-muted-foreground" />
              <h3 className="font-display text-2xl font-semibold">No profiles match those filters</h3>
              <p className="mt-2 text-sm text-muted-foreground">Try a wider country, platform or search term.</p>
              <Button className="mt-5" variant="outline" onClick={clearFilters}>Clear filters</Button>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((person) => <CreatorCard key={person.key} person={person} onOpen={() => setOpenPerson(person)} />)}
            </div>
          )}

          {!loading && nextOffset !== null ? (
            <div className="mt-10 text-center">
              <Button variant="outline" disabled={loadingMore} onClick={() => void load(true, nextOffset)}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Load more creators
              </Button>
            </div>
          ) : null}
        </section>

        <section className="border-y border-border bg-foreground py-16 text-background">
          <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-5 px-4 text-center md:px-6">
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Want the campaign tools behind this?</h2>
            <p className="max-w-2xl text-sm leading-relaxed opacity-75 md:text-base">Book a short walkthrough to see briefs, approvals, live links, reporting and payments with safe test data.</p>
            <Button onClick={() => setDemoOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">Book a meeting</Button>
          </div>
        </section>
      </main>

      <Sheet open={!!openPerson} onOpenChange={(open) => !open && setOpenPerson(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {openPerson ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-display text-2xl">{openPerson.full_name} {openPerson.verified_at ? <ShieldCheck className="size-4 text-success" /> : null}</SheetTitle>
                <div className="text-sm text-muted-foreground">{[openPerson.city, countryName(openPerson.country_code)].filter(Boolean).join(", ")}</div>
              </SheetHeader>
              <div className="mt-5 space-y-5">
                {openPerson.bio ? <p className="text-sm leading-relaxed">{openPerson.bio}</p> : null}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-md bg-secondary p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reach</div><div className="font-display text-lg font-semibold">{fmtCompact(openPerson.follower_total)}</div></div>
                  <div className="rounded-md bg-secondary p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Eng</div><div className="font-display text-lg font-semibold">{openPerson.engagement_avg.toFixed(1)}%</div></div>
                  <div className="rounded-md bg-secondary p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Profiles</div><div className="font-display text-lg font-semibold">{openPerson.profiles.length}</div></div>
                </div>
                <div>
                  <h3 className="mb-2 font-display text-lg font-semibold">Social profiles</h3>
                  <div className="flex flex-wrap gap-2">{openPerson.profiles.map((profile) => <ProfilePill key={profile.id} profile={profile} />)}</div>
                </div>
                {openPerson.contacts.length ? (
                  <div>
                    <h3 className="mb-2 font-display text-lg font-semibold">Public links</h3>
                    <div className="space-y-2">
                      {openPerson.contacts.map((contact) => {
                        const isEmail = contact.kind === "email" || contact.kind === "manager_email";
                        const Icon = isEmail ? Mail : ExternalLink;
                        const href = isEmail ? `mailto:${contact.value}` : contact.value;
                        return (
                          <a key={`${contact.kind}-${contact.value}`} href={href} target={isEmail ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{contact.label || contact.value}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setDemoOpen(true)}>Discuss this creator mix</Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <PublicFooter />
      <DemoRequestDialog
        open={demoOpen}
        onOpenChange={setDemoOpen}
        source="public_discovery"
        title="Book a Daraja Pulse meeting"
        description="Tell us who you are and what creator markets you want to explore. We'll follow up with a walkthrough."
        defaultMessage="I'd like to discuss the Discovery showcase and see the campaign tools with test data."
      />
    </div>
  );
}
