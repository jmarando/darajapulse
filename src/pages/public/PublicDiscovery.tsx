import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DemoRequestDialog from "@/components/DemoRequestDialog";
import PublicFooter from "@/components/PublicFooter";
import { ExternalLink, Instagram, Loader2, Mail, MapPin, Music2, Phone, Search, ShieldCheck, Sparkles, Users, Youtube, Twitter, Facebook, ArrowDown, ArrowRight, Calendar, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

const ALL = "all";
const PAGE = 360;
const PLATFORM_ICON: Record<string, any> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, twitter: Twitter, facebook: Facebook };
const COUNTRY_NAME: Record<string, string> = { KE: "Kenya", UG: "Uganda", TZ: "Tanzania", ZM: "Zambia" };

/* ---------------------------------------------------------------- */
/* The homepage's Daylight look (index.css `.daylight`): a white      */
/* page, cool greys, pill buttons and the brand red for big type. No  */
/* dark sections. The marks and the graph paper are copied from       */
/* LandingDashboard.tsx, as the storefront showcase does.             */
/* ---------------------------------------------------------------- */

const WRAP = "mx-auto w-full max-w-[1240px] px-5 md:px-8 lg:px-16";
const WIDE = "mx-auto w-full max-w-[1400px] px-3 md:px-6 lg:px-8";

const GRAPH_PAPER =
  "bg-secondary [background-image:linear-gradient(hsl(var(--border)/0.65)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.65)_1px,transparent_1px)] [background-size:32px_32px] [background-position:-1px_-1px]";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const BUTTON = `group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full transition-[filter,background-color,transform] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 ${FOCUS}`;
const BUTTON_PRIMARY = `${BUTTON} bg-accent-strong font-semibold text-white hover:brightness-110`;
const BUTTON_QUIET = `${BUTTON} border border-input bg-background font-medium hover:bg-secondary`;
const LARGE = "h-[54px] px-7 text-[15px]";
const SMALL = "h-11 px-5 text-sm";

/** Fields as pills, filled white: the UI kit's default fill is the cream of the other public pages. */
const FIELD = "h-11 rounded-full border-input bg-background px-4";
/** Dropdowns open outside the page, so they take the theme themselves, and the option under the pointer
    gets the homepage's pale red tint instead of the public theme's solid red with cream text. */
const MENU =
  "daylight rounded-xl [&_[role=option]]:rounded-lg [&_[role=option][data-highlighted]]:bg-accent/[0.07] [&_[role=option][data-highlighted]]:text-accent-strong";
const CARD = "rounded-[18px] border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_12px_24px_-18px_hsl(var(--foreground)/0.18)]";
const EYEBROW = "font-mono text-xs uppercase tracking-[0.2em] text-accent-strong";

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

/** The browser bar on a phone follows this page (white) and goes back to the app's colour on leaving. */
function useThemeColor(color: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = color;
    return () => {
      meta.content = previous;
    };
  }, [color]);
}

/** The heartbeat from the logo, as crisp vector. */
function PulseMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" className={className} aria-hidden fill="none">
      <path
        d="M1 12 H24 L27 8.5 L29.5 15 L32.5 1.5 L37 22.5 L39.5 12 H63"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PULSE_PATH =
  "M0 100 h260 l20 -30 l15 55 l25 -107 l30 164 l20 -82 h430 l20 -30 l15 55 l25 -107 l30 164 l20 -82 h290";

/** A monitor line with a beat travelling along it. */
function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden fill="none" className={`pointer-events-none ${className}`}>
      <path d={PULSE_PATH} pathLength={1000} className="stroke-accent/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path
        d={PULSE_PATH}
        pathLength={1000}
        className="stroke-accent animate-pulse-trace"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="160 1000"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Header({ onBook }: { onBook: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const link = "inline-flex h-11 items-center transition-colors hover:text-foreground";
  return (
    <header className={`sticky top-0 z-40 w-full bg-background/90 backdrop-blur-md transition-shadow duration-300 ${scrolled ? "shadow-[0_1px_0_hsl(var(--border))]" : ""}`}>
      <div className={`${WRAP} flex h-16 items-center justify-between gap-3 md:h-[72px]`}>
        <Link to="/" className="flex min-w-0 items-center gap-2 md:gap-2.5" aria-label="Daraja Pulse home">
          <PulseMark className="h-5 w-auto shrink-0 text-accent md:h-[21px]" />
          <span className="whitespace-nowrap font-display text-[15px] font-bold uppercase tracking-[0.04em] md:text-[17px] md:tracking-[0.06em]">Daraja Pulse</span>
        </Link>
        <nav aria-label="Discovery" className="hidden items-center gap-8 text-sm font-medium text-muted-foreground lg:flex">
          <Link to="/" className={link}>Home</Link>
          <a href="#brief-match" className={link}>Brief matching</a>
          <a href="#directory" className={link}>Directory</a>
        </nav>
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <Link
            to="/auth"
            className="hidden h-11 items-center rounded-full px-3 text-sm font-medium transition-[background-color,transform] hover:bg-secondary active:scale-[0.96] sm:inline-flex"
          >
            Sign in
          </Link>
          <button onClick={onBook} aria-label="Book a meeting" className={`${BUTTON_PRIMARY} h-11 px-4 text-sm md:px-[18px]`}>
            {/* The hero repeats the full button right below on phones. */}
            <Calendar className="size-4 sm:hidden" aria-hidden />
            <span className="sm:hidden">Book</span>
            <span className="hidden sm:inline">Book a meeting</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** A live total as the homepage shows its numbers: big, the K or M in the brand red, the words for screen readers. */
function Stat({ label, value }: { label: string; value?: number }) {
  const text = value === undefined ? "–" : fmtCompact(value);
  const unit = /[KM]$/.test(text) ? text.slice(-1) : "";
  return (
    <li>
      <span className="sr-only">{text} {label}</span>
      <span aria-hidden className="block font-display text-[clamp(2rem,4.4vw,4rem)] font-semibold leading-none tracking-[-0.045em] tabular-nums">
        {unit ? text.slice(0, -1) : text}
        <span className="text-accent">{unit}</span>
      </span>
      <span aria-hidden className="mt-2.5 block text-sm text-muted-foreground md:text-[15px]">{label}</span>
    </li>
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
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-border/70"
      title={`${profile.platform} @${profile.handle}`}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate max-w-[92px]">@{profile.handle}</span>
      <span className="text-muted-foreground tabular-nums">{fmtCompact(profile.follower_count)}</span>
    </a>
  );
}

/** Reach, engagement and profile count on a light panel; the label comes first for screen readers. */
function Figures({ person }: { person: Person }) {
  const figures = [
    ["Reach", fmtCompact(person.follower_total)],
    ["Eng", `${person.engagement_avg.toFixed(1)}%`],
    ["Profiles", String(person.profiles.length)],
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-border/70 rounded-xl border border-border/70 bg-secondary/60 text-center">
      {figures.map(([label, value]) => (
        <div key={label} className="flex flex-col-reverse px-2 py-3">
          <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
          <dd className="font-display text-xl font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CreatorCard({ person, onOpen }: { person: Person; onOpen: () => void }) {
  return (
    <article className={`${CARD} group flex h-full flex-col p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-elegant md:p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-secondary font-display text-xl uppercase text-muted-foreground">
            {person.avatar_url ? <img src={person.avatar_url} alt={person.full_name} loading="lazy" className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
            <span className="absolute inset-0 flex items-center justify-center">{person.full_name?.[0] ?? "?"}</span>
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Creator</div>
            <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{[person.city, countryName(person.country_code)].filter(Boolean).join(", ")}</span>
            </div>
          </div>
        </div>
        {person.verified_at ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-[3px] text-[11.5px] font-medium text-success">
            <ShieldCheck className="size-3" /> Verified
          </span>
        ) : null}
      </div>
      <h3 className="mt-5 break-words font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] transition-colors group-hover:text-accent-strong">{person.full_name}</h3>
      {person.bio ? <p className="mt-2 line-clamp-2 text-[13.5px] leading-normal text-muted-foreground">{person.bio}</p> : null}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {person.profiles.slice(0, 5).map((profile) => <ProfilePill key={profile.id} profile={profile} />)}
      </div>
      {person.niches.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {person.niches.slice(0, 4).map((item) => (
            <span key={item} className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium capitalize text-muted-foreground">{item}</span>
          ))}
          {person.niches.length > 4 ? <span className="self-center text-[10.5px] text-muted-foreground">+{person.niches.length - 4}</span> : null}
        </div>
      ) : null}
      <div className="mt-auto pt-5">
        <Figures person={person} />
        <button onClick={onOpen} className={`${BUTTON_QUIET} mt-3 h-11 w-full text-sm`}>View profile</button>
      </div>
    </article>
  );
}

type Match = {
  creator_id: string;
  score: number;
  reason?: string;
  angle?: string;
  full_name?: string | null;
  handle?: string | null;
  platform?: string | null;
  follower_count?: number | null;
  city?: string | null;
};

function BriefMatcher({ onBook }: { onBook: () => void }) {
  const [brief, setBrief] = useState("");
  const [tier, setTier] = useState("any");
  const [market, setMarket] = useState(ALL);
  const [running, setRunning] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);

  const run = async () => {
    const goal = brief.trim();
    if (goal.length < 15) { toast.error("Add a bit more detail about the campaign."); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("discovery-match", {
        body: { goal, brief: goal.slice(0, 2000), budget_tier: tier, country_code: market === ALL ? null : market, source: "public_discovery" },
      });
      if (error) throw error;
      const list = ((data as any)?.matches ?? []) as Match[];
      setMatches(list);
      if (!list.length) toast.message("No strong matches yet — try describing the audience or product more specifically.");
    } catch (e: any) {
      toast.error(e?.message || "Matching is busy right now, try again shortly.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section id="brief-match" aria-labelledby="brief-match-title" className={`${WIDE} scroll-mt-20 pt-14 md:pt-20 lg:pt-24`}>
      <div className={`rounded-[20px] border border-border p-3.5 md:rounded-[32px] md:p-6 lg:p-8 ${GRAPH_PAPER}`}>
        <div className="flex items-center gap-4 px-1 pb-4 font-mono text-[11px] uppercase tracking-[0.18em] md:pb-[18px]">
          <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">AI brief matching</span>
          <PulseLine className="h-[34px] min-w-0 flex-1" />
          <span className="whitespace-nowrap text-accent-strong">Your shortlist</span>
        </div>
        <div className="grid gap-3 md:gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className={`${CARD} p-5 md:p-7`}>
            <h2 id="brief-match-title" className="font-display text-[clamp(1.625rem,2.6vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
              Describe your campaign, get a creator shortlist
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-[1.55] text-muted-foreground">
              Paste your brief — product, audience, market and tone. The matcher reads every profile in Discovery and returns the creators that genuinely fit, with the reason and a content angle for each.
            </p>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value.slice(0, 2000))}
              rows={6}
              placeholder="e.g. Launching a new cooking oil in Nairobi. We want everyday home cooks and food creators who make recipe videos in Swahili and English, mid-size audiences, warm family tone."
              className="mt-5 w-full rounded-2xl border border-input bg-background p-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Audience size" /></SelectTrigger>
                <SelectContent className={MENU}>
                  <SelectItem value="any">Any audience size</SelectItem>
                  <SelectItem value="nano">Nano (1K–10K)</SelectItem>
                  <SelectItem value="micro">Micro (10K–100K)</SelectItem>
                  <SelectItem value="mid">Mid (100K–500K)</SelectItem>
                  <SelectItem value="macro">Macro (500K+)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Market" /></SelectTrigger>
                <SelectContent className={MENU}>
                  <SelectItem value={ALL}>All markets</SelectItem>
                  <SelectItem value="KE">Kenya</SelectItem>
                  <SelectItem value="UG">Uganda</SelectItem>
                  <SelectItem value="TZ">Tanzania</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button onClick={run} disabled={running} className={`${BUTTON_PRIMARY} ${SMALL} mt-4 w-full sm:w-auto`}>
              {running ? <><Loader2 className="size-4 animate-spin" /> Matching…</> : <><Sparkles className="size-4" /> Match creators</>}
            </button>
          </div>

          <div className={`${CARD} flex flex-col p-5 md:p-6`}>
            {running ? (
              <div className="flex min-h-[260px] flex-1 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" /> Reading your brief…</div>
            ) : !matches ? (
              <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center text-center text-muted-foreground">
                <div className="mb-4 grid size-11 place-items-center rounded-xl bg-secondary text-accent-strong">
                  <Sparkles className="size-[22px]" strokeWidth={1.75} />
                </div>
                <p className="max-w-sm text-sm">Your shortlist appears here — ranked, with a fit score, the reason and a suggested content angle.</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="flex min-h-[260px] flex-1 items-center justify-center text-center text-sm text-muted-foreground">No strong matches for that brief yet. Try adding the market, product category and audience.</div>
            ) : (
              <div className="space-y-3">
                <div className={EYEBROW}>{matches.length} suggested creators</div>
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {matches.map((m) => (
                    <div key={m.creator_id} className="rounded-xl border border-border/70 bg-secondary/60 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{m.full_name || `@${m.handle}`}</div>
                          <div className="truncate text-xs text-muted-foreground">@{m.handle} · {m.platform}{m.city ? ` · ${m.city}` : ""} · {fmtCompact(Number(m.follower_count) || 0)} followers</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-accent/[0.07] px-2 py-[3px] text-[11.5px] font-medium tabular-nums text-accent-strong">{Math.round(Number(m.score) || 0)}% fit</span>
                      </div>
                      {m.reason ? <p className="mt-2 text-sm text-muted-foreground">{m.reason}</p> : null}
                      {m.angle ? <p className="mt-1 text-xs"><span className="font-semibold">Angle:</span> {m.angle}</p> : null}
                    </div>
                  ))}
                </div>
                <button className={`${BUTTON_QUIET} ${SMALL} w-full`} onClick={onBook}>Talk through this shortlist</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
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
  useThemeColor("#ffffff");

  const load = async (append = false, offset = 0) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-discovery-showcase", {
        body: {
          country: country === ALL ? null : country,
          city: city === ALL ? null : city,
          platform: platform === ALL ? null : platform,
          niche: niche === ALL ? null : niche,
          q: q.trim() || null,
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
  useEffect(() => {
    const t = window.setTimeout(() => { void load(false, 0); }, 250);
    return () => window.clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [country, city, platform, niche, q]);

  const countries = useMemo(() => Object.keys(stats?.countries ?? {}).sort(), [stats]);
  const cities = useMemo(() => (stats?.cities ?? []).filter((value) => value && value.trim()).sort(), [stats]);
  const niches = useMemo(() => (stats?.niches ?? []).filter(Boolean).slice(0, 80), [stats]);
  const platforms = useMemo(() => Object.keys(stats?.platforms ?? {}).sort(), [stats]);

  const filtered = people;

  const activeFilters = [country !== ALL, city !== ALL, platform !== ALL, niche !== ALL, !!q.trim()].filter(Boolean).length;
  const clearFilters = () => { setQ(""); setCountry(ALL); setCity(ALL); setPlatform(ALL); setNiche(ALL); };

  return (
    <div className="daylight min-h-screen bg-background text-foreground antialiased">
      <Header onBook={() => setDemoOpen(true)} />
      <main>
        <section className={`${WRAP} pt-11 text-center md:pt-16 lg:pt-[88px]`}>
          <h1 className="font-display text-[clamp(2.375rem,5.9vw,5.375rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            Explore East Africa’s <span className="block text-accent">creator landscape.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-[1.55] text-muted-foreground md:text-xl md:leading-[1.55]">
            Search real creator profiles across Kenya, Uganda and Tanzania. The operational platform stays locked; this view shows the discovery layer prospects can evaluate.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button onClick={() => setDemoOpen(true)} className={`${BUTTON_PRIMARY} ${LARGE}`}>
              Book a meeting
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <a href="#directory" className={`${BUTTON_QUIET} ${LARGE}`}>
              Browse creators
              <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
            </a>
          </div>
        </section>

        <section aria-label="Discovery in numbers" className={`${WRAP} pt-12 text-center md:pt-16`}>
          <ul className="mx-auto grid max-w-[900px] grid-cols-3 gap-x-4">
            <Stat label="people indexed" value={stats?.people} />
            <Stat label="profiles" value={stats?.profiles} />
            <Stat label="potential reach" value={stats?.total_followers} />
          </ul>
          <p className="mx-auto mt-8 max-w-[560px] text-sm leading-relaxed text-muted-foreground text-balance">
            <LockKeyhole className="mr-1.5 inline size-4 -translate-y-px text-accent-strong" aria-hidden />
            <span className="font-medium text-foreground">Private tools stay locked.</span> Campaigns, reports, inbox, payments and admin data require sign-in.
          </p>
        </section>

        <BriefMatcher onBook={() => setDemoOpen(true)} />

        <section id="directory" aria-labelledby="directory-title" className={`${WRAP} scroll-mt-20 pt-[72px] md:pt-24 lg:pt-[120px]`}>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-[820px]">
              <span className={EYEBROW}>Discovery directory</span>
              <h2 id="directory-title" className="mt-3.5 font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
                Search by name, handle, market or niche
              </h2>
            </div>
            <div className="text-sm text-muted-foreground">Showing {filtered.length} people from {people.length} loaded</div>
          </div>

          <div className="mb-6 mt-8 rounded-3xl border border-border bg-card p-3 md:mt-10 md:p-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,160px))_auto]">
              <div className="relative col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators, handles, cities…" className={`${FIELD} pl-10`} aria-label="Search public Discovery" />
              </div>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent className={MENU}>
                  <SelectItem value={ALL}>All countries</SelectItem>
                  {countries.map((code) => <SelectItem key={code} value={code}>{countryName(code)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="City" /></SelectTrigger>
                <SelectContent className={`${MENU} max-h-80`}>
                  <SelectItem value={ALL}>All cities</SelectItem>
                  {cities.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Platform" /></SelectTrigger>
                <SelectContent className={MENU}>
                  <SelectItem value={ALL}>All platforms</SelectItem>
                  {platforms.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger className={FIELD}><SelectValue placeholder="Niche" /></SelectTrigger>
                <SelectContent className={`${MENU} max-h-80`}>
                  <SelectItem value={ALL}>All niches</SelectItem>
                  {niches.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                onClick={clearFilters}
                disabled={!activeFilters}
                className={`${BUTTON} col-span-2 h-11 px-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground lg:col-span-1`}
              >
                Clear
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" /> Loading Discovery…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-12 text-center">
              <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-secondary text-muted-foreground">
                <Search className="size-[22px]" strokeWidth={1.75} />
              </div>
              <h3 className="font-display text-2xl font-semibold tracking-[-0.02em]">No profiles match those filters</h3>
              <p className="mt-2 text-sm text-muted-foreground">Try a wider country, platform or search term.</p>
              <button className={`${BUTTON_QUIET} ${SMALL} mt-5`} onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
              {filtered.map((person) => <CreatorCard key={person.key} person={person} onOpen={() => setOpenPerson(person)} />)}
            </div>
          )}

          {!loading && nextOffset !== null ? (
            <div className="mt-10 text-center">
              <button className={`${BUTTON_QUIET} ${SMALL}`} disabled={loadingMore} onClick={() => void load(true, nextOffset)}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Load more creators
              </button>
            </div>
          ) : null}
        </section>

        <section className={`${WIDE} pb-7 pt-14 md:pb-12 md:pt-20 lg:pt-[104px]`}>
          {/* The extra room at the bottom keeps the button clear of the pulse line. */}
          <div className={`relative overflow-hidden rounded-[20px] border border-border px-5 pb-[104px] pt-14 text-center md:rounded-[32px] md:px-16 md:pb-40 md:pt-[104px] ${GRAPH_PAPER}`}>
            <h2 className="mx-auto max-w-[900px] font-display text-[clamp(2.25rem,5.4vw,5rem)] font-semibold leading-none tracking-[-0.05em]">
              Want the <span className="inline-block text-accent">campaign tools</span> behind this?
            </h2>
            <p className="mx-auto mt-[22px] max-w-[560px] text-lg leading-[1.55] text-muted-foreground">
              Book a short walkthrough to see briefs, approvals, live links, reporting and payments with safe test data.
            </p>
            <div className="mt-9 flex justify-center">
              <button onClick={() => setDemoOpen(true)} className={`${BUTTON_PRIMARY} ${LARGE}`}>
                Book a meeting
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <PulseLine className="absolute inset-x-0 bottom-0 h-16 w-full md:h-[92px]" />
          </div>
        </section>
      </main>

      <Sheet open={!!openPerson} onOpenChange={(open) => !open && setOpenPerson(null)}>
        {/* The panel renders outside the page, so it takes the Daylight theme itself. */}
        <SheetContent className="daylight w-full overflow-y-auto text-foreground sm:max-w-lg">
          {openPerson ? (
            <>
              <SheetHeader className="pr-6 text-left">
                <SheetTitle className="flex items-center gap-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                  {openPerson.full_name} {openPerson.verified_at ? <ShieldCheck className="size-4 shrink-0 text-success" /> : null}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" />
                  {[openPerson.city, countryName(openPerson.country_code)].filter(Boolean).join(", ")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {openPerson.bio ? <p className="text-[15px] leading-relaxed">{openPerson.bio}</p> : null}
                <Figures person={openPerson} />
                <div>
                  <h3 className="mb-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-muted-foreground">Social profiles</h3>
                  <div className="flex flex-wrap gap-2">{openPerson.profiles.map((profile) => <ProfilePill key={profile.id} profile={profile} />)}</div>
                </div>
                {openPerson.contacts.length ? (
                  <div>
                    <h3 className="mb-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-muted-foreground">Contact &amp; links</h3>
                    <div className="space-y-2">
                      {openPerson.contacts.map((contact) => {
                        const isEmail = contact.kind === "email" || contact.kind === "manager_email";
                        const isPhone = contact.kind === "phone" || contact.kind === "whatsapp";
                        const Icon = isEmail ? Mail : isPhone ? Phone : ExternalLink;
                        const href = isEmail
                          ? `mailto:${contact.value}`
                          : isPhone
                            ? `tel:${contact.value.replace(/[^\d+]/g, "")}`
                            : contact.value;
                        const text = isEmail || isPhone ? contact.value : contact.label || contact.value;
                        return (
                          <a key={`${contact.kind}-${contact.value}`} href={href} target={isEmail || isPhone ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-sm transition-colors hover:bg-secondary">
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{text}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <button className={`${BUTTON_PRIMARY} ${SMALL} w-full`} onClick={() => setDemoOpen(true)}>Discuss this creator mix</button>
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
