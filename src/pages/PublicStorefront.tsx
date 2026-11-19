import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Search, ShoppingCart, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import PublicFooter from "@/components/PublicFooter";
import { applyPageMeta, metaForPath } from "@/lib/seo";
import {
  groupListings, naturalList, platformLabel, sectionsOf,
  type Listing, type ListingGroup, type PlanMatch, type RequestForm, type Section, type WayKey,
} from "@/lib/storefront";
import {
  addItems, bookingMode, changeOption, countByWay, planTotals, removeItems, removeLine, requestLines, setBudget, setQty, toggleItem, toggleLine,
  type PickApi, type PlanLine,
} from "@/lib/storefrontPlan";
import { kes } from "@/lib/storefrontRequests";
import { fromLine, headlineNames, showcaseSlides } from "@/lib/storefrontShowcase";
import { readableShade } from "@/lib/houseColor";
import ListingCard from "@/components/storefront/ListingCard";
import Showcase from "@/components/storefront/Showcase";
import ListingSheet from "@/components/storefront/ListingSheet";
import RequestSheet from "@/components/storefront/RequestSheet";
import { BriefStudio, PlanResults } from "@/components/storefront/BriefStudio";
import WaysIndex from "@/components/storefront/WaysIndex";
import RateCard from "@/components/storefront/RateCard";
import OfferList from "@/components/storefront/OfferList";
import PackageCard from "@/components/storefront/PackageCard";
import { PlanPanel, type PlanEdits } from "@/components/storefront/PlanPanel";
import Checkout from "@/components/storefront/booking/Checkout";

const AGE_BANDS = ["18-24", "25-34", "35-44", "45+"];
/** Social accounts and talent can run to dozens of cards: show this many until the buyer asks for all. */
const CARD_LIMIT = 12;

type Agency = {
  id: string; name: string; slug: string; display_name?: string | null; logo_url?: string | null; primary_color?: string | null;
  support_email?: string | null; show_prices?: boolean | null;
  /** Online booking: "off", "test" (only on the ?book=test link) or "on". */
  booking?: string | null;
  /** The house's fees for making audio, banners and print. */
  production?: Record<string, number> | null;
};

/** The message a failed function call carries, read from its response body when there is one. */
async function functionError(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
    const body = ctx?.json ? await ctx.json() : null;
    if (body?.error) return body.error;
  } catch { /* the body wasn't JSON */ }
  return fallback;
}

/** "radio", but "TV" stays "TV". */
const lowerFirst = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** A media house's storefront, by the slug in the address, or by `slug` when shown on the house's own subdomain. */
export default function PublicStorefront({ slug }: { slug?: string } = {}) {
  const params = useParams();
  const agencySlug = slug ?? params.agencySlug;
  const navigate = useNavigate();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<PlanLine[]>([]);

  // Detail panel and request panel
  const [detail, setDetail] = useState<{ group: ListingGroup; focusId: string | null } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; count: number } | null>(null);

  // Search and filters
  const [q, setQ] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minFollowers, setMinFollowers] = useState<string>("");
  const [maxFollowers, setMaxFollowers] = useState<string>("");
  const [minER, setMinER] = useState<string>("");
  const [ageBands, setAgeBands] = useState<string[]>([]);
  const [genderPref, setGenderPref] = useState<"any" | "female" | "male">("any");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAll, setShowAll] = useState<WayKey[]>([]);

  // Where the buyer is on the page, and a jump waiting for its section to render
  const [activeWay, setActiveWay] = useState<WayKey | null>(null);
  const [pendingJump, setPendingJump] = useState<WayKey | null>(null);

  // The brief planner
  const [brief, setBrief] = useState("");
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<PlanMatch[] | null>(null);
  const planRef = useRef<HTMLDivElement>(null);

  const runMatch = async () => {
    if (brief.trim().length < 20) {
      toast.error("Say a little more: what it is, who it's for and what you need.");
      return;
    }
    setMatching(true);
    setMatches(null);
    window.setTimeout(() => planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const { data, error } = await supabase.functions.invoke("storefront-match", { body: { agency_slug: agencySlug, brief: { brief } } });
      if (error) throw error;
      setMatches(((data as { matches?: PlanMatch[] })?.matches ?? []).map(({ item_id, score, reason, angle }) => ({ item_id, score, reason, angle })));
    } catch (e) {
      toast.error(await functionError(e, "The planner couldn't read that brief. Try again in a moment."));
    } finally {
      setMatching(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_public_storefront", { _agency_slug: agencySlug });
      if (error) toast.error(error.message);
      const payload = (data ?? {}) as { agency?: Agency | null; items?: Listing[] };
      const loadedAgency = payload.agency ?? null;
      setAgency(loadedAgency);
      setItems(payload.items ?? []);
      setLoading(false);
      // Normalize URL to the agency's canonical slug casing (not on the house's own subdomain, whose address has no slug)
      if (!slug && loadedAgency?.slug && loadedAgency.slug !== agencySlug) {
        navigate(`/shop/${loadedAgency.slug}`, { replace: true });
      }
    })();
  }, [agencySlug, slug, navigate]);

  // Title the page after the storefront once it loads, and keep unknown slugs out of
  // search. Runs on path changes too, so the slug-casing redirect above can't reset it.
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (loading) return;
    const name = agency?.display_name || agency?.name;
    applyPageMeta(name
      ? {
          ...metaForPath(pathname),
          title: `${name} media kit | Daraja Pulse`,
          description: `Every way to advertise with ${name}: see what's on offer and what it costs, plan with AI, and request a quote within 24 hours.`,
        }
      : { title: "Storefront not found | Daraja Pulse" });
  }, [loading, agency, pathname]);

  const showPrices = Boolean(agency?.show_prices);
  // Book now: the house books online (or this is its test link) and something in the plan can be booked.
  const canBook = Boolean(agency) && bookingMode(agency ?? {}, new URLSearchParams(search)) === "on"
    && lines.some((l) => items.find((i) => i.id === l.id)?.bookable);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const platforms = useMemo(() => Array.from(new Set(items.map(i => i.platform).filter(Boolean))) as string[], [items]);
  const categories = useMemo(() => Array.from(new Set(items.flatMap(i => i.tags || []))).sort(), [items]);
  const matchById = useMemo(() => new Map((matches ?? []).map(m => [m.item_id, m])), [matches]);

  // A planner pick or any one account opens the card it belongs to, with that account open.
  const groupOf = useMemo(() => {
    const map = new Map<string, ListingGroup>();
    groupListings(items).forEach(g => g.items.forEach(i => map.set(i.id, g)));
    return map;
  }, [items]);
  const openItem = (item: Listing) => setDetail({ group: groupOf.get(item.id) ?? { key: item.id, name: item.title, lead: item, items: [item], cover: item.cover_url ?? null }, focusId: item.id });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const minF = Number(minFollowers) || 0;
    const maxF = Number(maxFollowers) || Infinity;
    const minE = Number(minER) || 0;
    const city = cityFilter.trim().toLowerCase();
    return items.filter(i => {
      if (term) {
        const hay = [i.title, i.subtitle, i.description, i.handle, ...(i.tags || []), ...(i.options ?? []).map(o => o.label)].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (platformFilter !== "all" && i.platform !== platformFilter) return false;
      if (categoryFilter !== "all" && !(i.tags || []).includes(categoryFilter)) return false;
      const fc = Number(i.follower_count) || 0;
      if (fc < minF || fc > maxF) return false;
      if ((Number(i.engagement_rate) || 0) < minE) return false;
      const demo = (i.audience_demo ?? {}) as { age_bands?: Record<string, number>; gender?: Record<string, number>; top_cities?: string[] };
      if (ageBands.length && !ageBands.some(b => Number(demo.age_bands?.[b]) >= 25)) return false;
      if (genderPref !== "any" && (Number(demo.gender?.[genderPref]) || 0) < 55) return false;
      if (city && !(demo.top_cities || []).some(c => (c || "").toLowerCase().includes(city))) return false;
      return true;
    });
  }, [items, q, platformFilter, categoryFilter, minFollowers, maxFollowers, minER, ageBands, genderPref, cityFilter]);

  const allSections = useMemo(() => sectionsOf(items, showPrices), [items, showPrices]);
  const slides = useMemo(() => showcaseSlides(items, showPrices), [items, showPrices]);
  const sections = useMemo(() => sectionsOf(filtered, showPrices), [filtered, showPrices]);
  const picksByWay = useMemo(() => countByWay(lines, byId), [lines, byId]);
  const totals = useMemo(() => planTotals(lines, byId), [lines, byId]);

  const activeFilters = [
    platformFilter !== "all", categoryFilter !== "all",
    !!minFollowers, !!maxFollowers, !!minER,
    ageBands.length > 0, genderPref !== "any", !!cityFilter.trim(),
  ].filter(Boolean).length;
  const narrowed = activeFilters > 0 || q.trim().length > 0;

  const clearFilters = () => {
    setQ("");
    setPlatformFilter("all"); setCategoryFilter("all");
    setMinFollowers(""); setMaxFollowers(""); setMinER("");
    setAgeBands([]); setGenderPref("any"); setCityFilter("");
  };

  // Jump to a way to buy; when search or filters hide it, clear them and jump once it's back.
  const jump = (key: WayKey) => {
    if (!sections.some(s => s.key === key)) clearFilters();
    setPendingJump(key);
  };
  useEffect(() => {
    if (!pendingJump) return;
    const el = document.getElementById(`way-${pendingJump}`);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActiveWay(pendingJump);
    setPendingJump(null);
  }, [pendingJump, sections]);

  // Light up the way to buy being read in the section bar.
  useEffect(() => {
    if (loading || typeof IntersectionObserver === "undefined") return;
    const els = sections.map(s => document.getElementById(`way-${s.key}`)).filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (seen[0]) setActiveWay(seen[0].target.id.replace(/^way-/, "") as WayKey);
    }, { rootMargin: "-25% 0px -65% 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [loading, sections]);

  const send = async (form: RequestForm, website: string) => {
    if (!lines.length) return toast.error("Pick at least one item.");
    setSending(true);
    // item_ids too, so the page works with the request function from before choices and numbers.
    const { error } = await supabase.functions.invoke("storefront-request", {
      body: { agency_slug: agencySlug, item_ids: Array.from(new Set(lines.map(l => l.id))), lines: requestLines(lines, byId), ...form, brief: matches ? brief : null, website },
    });
    setSending(false);
    if (error) return toast.error(await functionError(error, "Your request couldn't be sent. Try again."));
    setSentTo({ email: form.contact_email, count: lines.length });
    setLines([]);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!agency) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Storefront not found</div>;

  const accent = agency.primary_color || "hsl(var(--primary))";
  /** The house colour, darkened when needed so white text on filled buttons reads. */
  const strong = readableShade(accent);
  const houseName = agency.display_name || agency.name;
  const bookingOn = bookingMode(agency, new URLSearchParams(search)) === "on";
  const names = headlineNames(slides);
  const startPrices = fromLine(allSections, showPrices);
  const firstWay = allSections.find(s => s.key === "radio")?.key ?? allSections[0]?.key ?? null;

  // The planner, in view and ready to type in.
  const toPlanner = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("plan-with-ai")?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById("brief-studio-text")?.focus({ preventScroll: true });
  };

  const pick: PickApi = {
    showPrices,
    accent,
    qtyOf: (id, option) => lines.find(l => l.id === id && l.option === option)?.qty ?? 0,
    isPicked: (id) => lines.some(l => l.id === id),
    onPick: (id, option) => setLines(ls => toggleLine(ls, id, option)),
    onToggleItem: (item) => setLines(ls => toggleItem(ls, item)),
    onAddMany: (list, add) => setLines(ls => (add ? addItems(ls, list) : removeItems(ls, list.map(i => i.id)))),
    onOpen: openItem,
  };
  const edits: PlanEdits = {
    onQty: (key, qty) => setLines(ls => setQty(ls, key, qty)),
    onOption: (key, option) => setLines(ls => changeOption(ls, key, option)),
    onRemove: (key) => setLines(ls => removeLine(ls, key)),
    onBudget: (key, budget) => setLines(ls => setBudget(ls, key, budget)),
  };

  const offer = naturalList(allSections.map(s => lowerFirst(s.title)));
  const intro = `${offer.charAt(0).toUpperCase()}${offer.slice(1)}. ${!showPrices
    ? `Pick what you need and send one request. ${houseName} replies with prices within a day.`
    : bookingOn
      ? "See the rate-card price as you go, then book online or ask for a quote."
      : "Pick what you need, see the rate-card price as you go, and send one request."}`;

  const cards = (s: Section) => {
    const groups = groupListings(s.items);
    const all = narrowed || showAll.includes(s.key);
    const shown = all ? groups : groups.slice(0, CARD_LIMIT);
    return (
      <>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(card => (
            <ListingCard key={card.key} group={card} pick={pick} inPlan={card.items.some(i => matchById.has(i.id))}
              onOpen={g => setDetail({ group: g, focusId: null })} />
          ))}
        </div>
        {shown.length < groups.length && (
          <div className="mt-5 text-center">
            <Button type="button" variant="outline" onClick={() => setShowAll(v => [...v, s.key])}>Show all {groups.length}</Button>
          </div>
        )}
      </>
    );
  };

  const sectionBody = (s: Section) => {
    switch (s.key) {
      case "packages":
        return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{s.items.map(i => <PackageCard key={i.id} item={i} pick={pick} />)}</div>;
      case "radio":
        return <RateCard items={s.items} pick={pick} />;
      case "social":
      case "talent":
        return cards(s);
      default:
        return <OfferList items={s.items} pick={pick} />;
    }
  };

  return (
    // The Daraja Pulse homepage's look (index.css `.daylight`): white, cool greys, the house colour for big type.
    <div className="daylight min-h-screen bg-background flex flex-col">
      <header className="bg-background">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-3 sm:px-6 md:min-h-[72px]">
          {agency.logo_url && <img src={agency.logo_url} alt="" data-no-outline className="h-10 w-auto max-w-[160px] object-contain" />}
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-xs text-muted-foreground">Advertise with</div>
            <div className="font-display text-[17px] font-semibold truncate">{houseName}</div>
          </div>
          {agency.support_email && <a className="text-sm text-muted-foreground hover:text-foreground hidden md:inline" href={`mailto:${agency.support_email}`}>{agency.support_email}</a>}
          {lines.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full lg:hidden" onClick={() => setRequestOpen(true)}>
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Your plan ({lines.length})
            </Button>
          )}
          <button type="button" onClick={toPlanner}
            className={`${lines.length ? "hidden sm:inline-flex" : "inline-flex"} h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
            style={{ background: strong }}>
            Plan a campaign
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pb-8">
        <section aria-labelledby="storefront-title" className="pt-8 text-center md:pt-12 lg:pt-14">
          <h1 id="storefront-title" className="mx-auto max-w-[1180px] font-display text-[clamp(2.4rem,5.4vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            {names.length >= 2 ? (
              <>
                {names.map((n, i) => <span key={`${n}-${i}`}>{i > 0 && " "}<span className="inline-block">{n}.</span></span>)}{" "}
                <span className="block" style={{ color: accent }}>{bookingOn ? "One plan. One booking." : "One plan. One request."}</span>
              </>
            ) : (
              <>Every way to advertise with {houseName}</>
            )}
          </h1>
          <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-[1.55] text-muted-foreground md:text-xl md:leading-[1.55]">{intro}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={toPlanner}
              className="group inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              style={{ background: strong }}>
              Plan my campaign
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
            {firstWay && (
              <button type="button" onClick={() => jump(firstWay)}
                className="inline-flex h-[54px] items-center justify-center gap-2 rounded-full border border-input bg-background px-7 text-[15px] font-medium transition-[background-color,transform] hover:bg-secondary active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {firstWay === "radio" && showPrices ? "Browse the rate card" : "Browse everything"}
              </button>
            )}
          </div>
          {startPrices && <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{startPrices}</p>}
        </section>

        {slides.length >= 2 && (
          <div className="mt-9 md:mt-12">
            <Showcase
              slides={slides} accent={accent} strong={strong}
              picked={(s) => lines.some(l => l.id === s.item.id && l.option === s.option)}
              onAdd={(s) => setLines(ls => toggleLine(ls, s.item.id, s.option))}
              onMore={(s) => jump(s.way)}
            />
          </div>
        )}

        <section aria-labelledby="ways-title" className="mt-10 md:mt-12">
          <h2 id="ways-title" className="mb-4 font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-muted-foreground">Every way to buy</h2>
          <WaysIndex sections={allSections} showPrices={showPrices} picks={picksByWay} accent={accent} onJump={jump} />
        </section>

        <div id="plan-with-ai" className="mt-8 scroll-mt-4">
          <BriefStudio accent={accent} houseName={houseName} brief={brief} setBrief={setBrief} running={matching} onRun={runMatch} />
        </div>

        <div ref={planRef} className="scroll-mt-6">
          {matching && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
              <p className="sr-only">Suggesting a plan</p>
              {[0, 1, 2].map(n => <div key={n} className="h-28 animate-pulse rounded-2xl bg-secondary" />)}
            </div>
          )}
          {matches && (
            <PlanResults
              matches={matches}
              items={items}
              pick={pick}
              onAddAll={() => { setLines(ls => addItems(ls, matches.map(m => byId.get(m.item_id)).filter((i): i is Listing => Boolean(i)))); toast.success("Added to your plan"); }}
              onClear={() => setMatches(null)}
            />
          )}
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            {/* The section bar stays in view, lights up where the buyer is, and counts what they've picked in each. */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
              <nav aria-label="Sections" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sections.map(s => {
                  const n = picksByWay[s.key] ?? 0;
                  const on = activeWay === s.key;
                  return (
                    <button key={s.key} type="button" onClick={() => jump(s.key)} aria-current={on ? "true" : undefined}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                      {s.title}
                      {n > 0 && <span className="rounded-full px-1.5 text-[11px] font-medium leading-5 text-white tabular-nums" style={{ background: accent }}>{n}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] max-w-md flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input className="pl-9" placeholder="Search a station, site, show, presenter or format" aria-label="Search the storefront" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
                  <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden />
                  Filters {activeFilters > 0 && <Badge variant="secondary" className="ml-1.5 h-5">{activeFilters}</Badge>}
                </Button>
                {narrowed && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
                {narrowed && <span className="text-xs text-muted-foreground">{filtered.length} of {items.length}</span>}
              </div>

              {showFilters && (
                <Card className="grid gap-4 bg-secondary/30 p-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <Label className="text-xs" htmlFor="sf-platform">Platform</Label>
                    <select id="sf-platform" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
                      <option value="all">All platforms</option>
                      {platforms.map(p => <option key={p} value={p}>{platformLabel(p)}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="sf-category">Category</Label>
                    <select id="sf-category" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                      <option value="all">All categories</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Followers</Label>
                    <div className="mt-1 flex gap-2">
                      <Input placeholder="Min" aria-label="Minimum followers" type="number" value={minFollowers} onChange={e => setMinFollowers(e.target.value)} className="h-9" />
                      <Input placeholder="Max" aria-label="Maximum followers" type="number" value={maxFollowers} onChange={e => setMaxFollowers(e.target.value)} className="h-9" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="sf-er">Min engagement %</Label>
                    <Input id="sf-er" placeholder="e.g. 2" type="number" step="0.1" value={minER} onChange={e => setMinER(e.target.value)} className="mt-1 h-9" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Audience age bands (25% or more of the audience)</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {AGE_BANDS.map(b => {
                        const on = ageBands.includes(b);
                        return <Button key={b} size="sm" variant={on ? "default" : "outline"} className="h-7 text-xs" onClick={() => setAgeBands(v => on ? v.filter(x => x !== b) : [...v, b])}>{b}</Button>;
                      })}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Audience gender lean</Label>
                    <div className="mt-1 flex gap-1.5">
                      {(["any", "female", "male"] as const).map(g => (
                        <Button key={g} size="sm" variant={genderPref === g ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setGenderPref(g)}>{g}</Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="sf-city">Top city</Label>
                    <Input id="sf-city" placeholder="e.g. Mombasa" value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="mt-1 h-9" />
                  </div>
                </Card>
              )}
            </div>

            {sections.length === 0 ? (
              <Card className="mt-8 p-16 text-center text-muted-foreground">
                <Sparkles className="mx-auto h-10 w-10 opacity-50" aria-hidden />
                <p className="mt-3">{items.length === 0 ? "No active inventory is published for this storefront yet. Contact the team to add items." : "Nothing matches that search or those filters."}</p>
              </Card>
            ) : sections.map(s => (
              <section key={s.key} id={`way-${s.key}`} aria-labelledby={`way-${s.key}-title`} className="mt-10 scroll-mt-16">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
                  <div>
                    <h2 id={`way-${s.key}-title`} className="font-display text-2xl font-semibold leading-tight">{s.title}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{s.blurb}</p>
                  </div>
                  {showPrices && (
                    <span className="text-sm tabular-nums text-muted-foreground">{s.fromPrice ? `From ${kes(s.fromPrice)}` : "Price on request"}</span>
                  )}
                </div>
                {sectionBody(s)}
              </section>
            ))}
          </div>

          <aside className="hidden lg:sticky lg:top-4 lg:block" aria-label="Your plan">
            <PlanPanel lines={lines} byId={byId} showPrices={showPrices} houseName={houseName} accent={accent}
              onRequest={() => setRequestOpen(true)} canBook={canBook} onBook={() => setCheckoutOpen(true)} {...edits} />
          </aside>
        </div>
      </main>

      {lines.length > 0 && !requestOpen && (
        <div className="sticky bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{lines.length} in your plan</div>
              {showPrices && totals.priced > 0 && (
                <div className="truncate text-xs tabular-nums text-muted-foreground">
                  {kes(totals.total)}{totals.onRequest ? ` + ${totals.onRequest} on request` : ""}
                </div>
              )}
            </div>
            {canBook ? (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>Quote</Button>
                <Button size="sm" className="text-white" style={{ background: accent }} onClick={() => setCheckoutOpen(true)}>Book now</Button>
              </div>
            ) : (
              <Button size="sm" className="shrink-0 text-white" style={{ background: accent }} onClick={() => setRequestOpen(true)}>Review and send</Button>
            )}
          </div>
        </div>
      )}

      <ListingSheet
        group={detail?.group ?? null}
        focusId={detail?.focusId ?? null}
        matches={matchById}
        pick={pick}
        onClose={() => setDetail(null)}
        onRequest={() => { setDetail(null); setRequestOpen(true); }}
      />

      <RequestSheet
        open={requestOpen}
        onOpenChange={(o) => { setRequestOpen(o); if (!o) setSentTo(null); }}
        houseName={houseName}
        accent={accent}
        lines={lines}
        byId={byId}
        showPrices={showPrices}
        edits={edits}
        onSend={send}
        sending={sending}
        sentTo={sentTo}
        onDone={() => { setRequestOpen(false); setSentTo(null); }}
      />

      <Checkout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        agencySlug={agency.slug}
        houseName={houseName}
        accent={accent}
        lines={lines}
        byId={byId}
        production={agency.production ?? {}}
      />

      <PublicFooter />
    </div>
  );
}
