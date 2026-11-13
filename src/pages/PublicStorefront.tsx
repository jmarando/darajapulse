import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe, Search, ShoppingCart, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import PublicFooter from "@/components/PublicFooter";
import { applyPageMeta, metaForPath } from "@/lib/seo";
import { groupListings, KIND_LABEL, platformLabel, type Listing, type ListingGroup, type PlanMatch, type RequestForm } from "@/lib/storefront";
import ListingCard from "@/components/storefront/ListingCard";
import ListingSheet from "@/components/storefront/ListingSheet";
import RequestSheet from "@/components/storefront/RequestSheet";
import { BriefStudio, PlanResults } from "@/components/storefront/BriefStudio";
import { PLATFORM_ICON } from "@/components/storefront/platformIcons";

const AGE_BANDS = ["18-24", "25-34", "35-44", "45+"];
const GROUP_ORDER = ["owned_account", "influencer", "ad_slot", "bundle"];
const GROUP_TITLE: Record<string, string> = { owned_account: "Social accounts", influencer: "On-air talent", ad_slot: "On-air formats", bundle: "Packages" };

type Agency = { id: string; name: string; slug: string; display_name?: string | null; logo_url?: string | null; primary_color?: string | null; support_email?: string | null };

/** The message a failed function call carries, read from its response body when there is one. */
async function functionError(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
    const body = ctx?.json ? await ctx.json() : null;
    if (body?.error) return body.error;
  } catch { /* the body wasn't JSON */ }
  return fallback;
}

/** A media house's storefront, by the slug in the address, or by `slug` when shown on the house's own subdomain. */
export default function PublicStorefront({ slug }: { slug?: string } = {}) {
  const params = useParams();
  const agencySlug = slug ?? params.agencySlug;
  const navigate = useNavigate();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<string[]>([]);

  // Detail panel and request panel
  const [detail, setDetail] = useState<{ group: ListingGroup; focusId: string | null } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; count: number } | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minFollowers, setMinFollowers] = useState<string>("");
  const [maxFollowers, setMaxFollowers] = useState<string>("");
  const [minER, setMinER] = useState<string>("");
  const [ageBands, setAgeBands] = useState<string[]>([]);
  const [genderPref, setGenderPref] = useState<"any" | "female" | "male">("any");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

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
  const { pathname } = useLocation();
  useEffect(() => {
    if (loading) return;
    const name = agency?.display_name || agency?.name;
    applyPageMeta(name
      ? {
          ...metaForPath(pathname),
          title: `${name} media kit | Daraja Pulse`,
          description: `Browse ${name}'s channels, talent and ad slots, plan with AI, and request a quote within 24 hours.`,
        }
      : { title: "Storefront not found | Daraja Pulse" });
  }, [loading, agency, pathname]);

  const platforms = useMemo(() => Array.from(new Set(items.map(i => i.platform).filter(Boolean))) as string[], [items]);
  const kinds = useMemo(() => GROUP_ORDER.filter(k => items.some(i => i.kind === k)), [items]);
  const categories = useMemo(() => Array.from(new Set(items.flatMap(i => i.tags || []))).sort(), [items]);
  const matchById = useMemo(() => new Map((matches ?? []).map(m => [m.item_id, m])), [matches]);

  const stats = useMemo(() => ({
    following: items.filter(i => i.kind === "owned_account").reduce((sum, i) => sum + (Number(i.follower_count) || 0), 0),
    channels: items.filter(i => i.kind === "owned_account").length,
    talent: items.filter(i => i.kind === "influencer").length,
    formats: items.filter(i => i.kind === "ad_slot" || i.kind === "bundle").length,
  }), [items]);

  const toggle = (id: string) => setCart(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const addMany = (ids: string[], add: boolean) => setCart(c => add ? Array.from(new Set([...c, ...ids])) : c.filter(x => !ids.includes(x)));

  // A planner pick or any one account opens the card it belongs to, with that account open.
  const groupOf = useMemo(() => {
    const byId = new Map<string, ListingGroup>();
    groupListings(items).forEach(g => g.items.forEach(i => byId.set(i.id, g)));
    return byId;
  }, [items]);
  const openItem = (item: Listing) => setDetail({ group: groupOf.get(item.id) ?? { key: item.id, name: item.title, lead: item, items: [item], cover: item.cover_url ?? null }, focusId: item.id });
  const cartItems = useMemo(() => cart.map(id => items.find(i => i.id === id)).filter((i): i is Listing => Boolean(i)), [items, cart]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const minF = Number(minFollowers) || 0;
    const maxF = Number(maxFollowers) || Infinity;
    const minE = Number(minER) || 0;
    const city = cityFilter.trim().toLowerCase();
    return items.filter(i => {
      if (term) {
        const hay = [i.title, i.subtitle, i.description, i.handle, ...(i.tags || [])].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (platformFilter !== "all" && i.platform !== platformFilter) return false;
      if (kindFilter !== "all" && i.kind !== kindFilter) return false;
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
  }, [items, q, platformFilter, kindFilter, categoryFilter, minFollowers, maxFollowers, minER, ageBands, genderPref, cityFilter]);

  const groups = useMemo(() => {
    const out: Record<string, Listing[]> = {};
    filtered.forEach(i => { (out[i.kind] = out[i.kind] || []).push(i); });
    return GROUP_ORDER.filter(k => out[k]?.length).map(k => ({ kind: k, cards: groupListings(out[k]) }));
  }, [filtered]);

  const activeFilters = [
    platformFilter !== "all", kindFilter !== "all", categoryFilter !== "all",
    !!minFollowers, !!maxFollowers, !!minER,
    ageBands.length > 0, genderPref !== "any", !!cityFilter.trim(),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setQ("");
    setPlatformFilter("all"); setKindFilter("all"); setCategoryFilter("all");
    setMinFollowers(""); setMaxFollowers(""); setMinER("");
    setAgeBands([]); setGenderPref("any"); setCityFilter("");
  };

  const send = async (form: RequestForm, website: string) => {
    if (!cart.length) return toast.error("Pick at least one item.");
    setSending(true);
    const { error } = await supabase.functions.invoke("storefront-request", {
      body: { agency_slug: agencySlug, item_ids: cart, ...form, brief: matches ? brief : null, website },
    });
    setSending(false);
    if (error) return toast.error(await functionError(error, "Your request couldn't be sent. Try again."));
    setSentTo({ email: form.contact_email, count: cart.length });
    setCart([]);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!agency) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Storefront not found</div>;

  const accent = agency.primary_color || "hsl(var(--primary))";
  const houseName = agency.display_name || agency.name;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-4">
          {agency.logo_url && <img src={agency.logo_url} alt={houseName} className="h-12 w-auto max-w-[200px] rounded-lg object-contain" />}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Media kit · Book now</div>
            <h1 className="font-display text-2xl font-semibold truncate">{houseName}</h1>
          </div>
          {agency.support_email && <a className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline" href={`mailto:${agency.support_email}`}>{agency.support_email}</a>}
          {cart.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Request ({cart.length})
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <BriefStudio accent={accent} houseName={houseName} brief={brief} setBrief={setBrief} running={matching} onRun={runMatch} stats={stats} />

        <div ref={planRef} className="scroll-mt-6">
          {matching && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
              <p className="sr-only">Building your plan</p>
              {[0, 1, 2].map(n => <div key={n} className="h-28 animate-pulse rounded-2xl bg-secondary" />)}
            </div>
          )}
          {matches && (
            <PlanResults
              matches={matches}
              items={items}
              accent={accent}
              cart={cart}
              onToggle={toggle}
              onOpen={openItem}
              onAddAll={() => { setCart(c => Array.from(new Set([...c, ...matches.map(m => m.item_id).filter(id => items.some(i => i.id === id))]))); toast.success("Added to your request"); }}
              onClear={() => setMatches(null)}
            />
          )}
        </div>

        {/* Filter bar */}
        <div className="mt-10 mb-6 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl">Everything on offer</h2>
            <div className="text-xs text-muted-foreground">{filtered.length} of {items.length}</div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" aria-hidden />
              <Input className="pl-9" placeholder="Search a station, presenter, show or platform" aria-label="Search the storefront" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
              <SlidersHorizontal className="w-4 h-4 mr-1.5" aria-hidden />
              Filters {activeFilters > 0 && <Badge variant="secondary" className="ml-1.5 h-5">{activeFilters}</Badge>}
            </Button>
            {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={kindFilter === "all" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setKindFilter("all")}>Everything</Button>
            {kinds.map(k => (
              <Button key={k} size="sm" variant={kindFilter === k ? "default" : "outline"} className="h-7 text-xs" onClick={() => setKindFilter(k)}>{GROUP_TITLE[k] || KIND_LABEL[k] || k}</Button>
            ))}
            <div className="w-px h-6 bg-border mx-1" />
            <Button size="sm" variant={platformFilter === "all" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPlatformFilter("all")}>All platforms</Button>
            {platforms.map(p => {
              const Icon = PLATFORM_ICON[p] || Globe;
              return <Button key={p} size="sm" variant={platformFilter === p ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPlatformFilter(p)}><Icon className="w-3 h-3 mr-1" aria-hidden />{platformLabel(p)}</Button>;
            })}
          </div>

          {showFilters && (
            <Card className="p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 bg-secondary/30">
              <div>
                <Label className="text-xs" htmlFor="sf-category">Category</Label>
                <select id="sf-category" className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Followers</Label>
                <div className="flex gap-2 mt-1">
                  <Input placeholder="Min" aria-label="Minimum followers" type="number" value={minFollowers} onChange={e => setMinFollowers(e.target.value)} className="h-9" />
                  <Input placeholder="Max" aria-label="Maximum followers" type="number" value={maxFollowers} onChange={e => setMaxFollowers(e.target.value)} className="h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs" htmlFor="sf-er">Min engagement %</Label>
                <Input id="sf-er" placeholder="e.g. 2" type="number" step="0.1" value={minER} onChange={e => setMinER(e.target.value)} className="h-9 mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Audience age bands (25% or more of the audience)</Label>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {AGE_BANDS.map(b => {
                    const on = ageBands.includes(b);
                    return <Button key={b} size="sm" variant={on ? "default" : "outline"} className="h-7 text-xs" onClick={() => setAgeBands(v => on ? v.filter(x => x !== b) : [...v, b])}>{b}</Button>;
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">Audience gender lean</Label>
                <div className="flex gap-1.5 mt-1">
                  {(["any", "female", "male"] as const).map(g => (
                    <Button key={g} size="sm" variant={genderPref === g ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setGenderPref(g)}>{g}</Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs" htmlFor="sf-city">Top city</Label>
                <Input id="sf-city" placeholder="e.g. Mombasa" value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="h-9 mt-1" />
              </div>
            </Card>
          )}
        </div>

        {groups.length === 0 ? (
          <Card className="p-16 text-center text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto opacity-50" aria-hidden />
            <p className="mt-3">{items.length === 0 ? "No active inventory is published for this storefront yet. Contact the team to add items." : "Nothing matches those filters."}</p>
          </Card>
        ) : groups.map(group => (
          <section key={group.kind} className="mb-12" aria-labelledby={`group-${group.kind}`}>
            <div className="flex items-baseline justify-between mb-4">
              <h3 id={`group-${group.kind}`} className="font-display text-xl">{GROUP_TITLE[group.kind] || KIND_LABEL[group.kind]}</h3>
              <span className="text-xs text-muted-foreground">{group.cards.length} option{group.cards.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {group.cards.map(card => (
                <ListingCard key={card.key} group={card} accent={accent} cart={cart} inPlan={card.items.some(i => matchById.has(i.id))}
                  onOpen={g => setDetail({ group: g, focusId: null })} onToggle={toggle} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {cart.length > 0 && !requestOpen && (
        <div className="sticky bottom-4 z-30 px-6">
          <div className="max-w-6xl mx-auto bg-card border border-border rounded-2xl shadow-lg p-3 pl-5 flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-semibold">{cart.length}</span> in your request
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCart([])}><X className="w-3 h-3 mr-1.5" aria-hidden /> Clear</Button>
              <Button size="sm" className="text-white" onClick={() => setRequestOpen(true)} style={{ background: accent }}><ShoppingCart className="w-3 h-3 mr-1.5" aria-hidden /> Review and send</Button>
            </div>
          </div>
        </div>
      )}

      <ListingSheet
        group={detail?.group ?? null}
        focusId={detail?.focusId ?? null}
        matches={matchById}
        accent={accent}
        cart={cart}
        onClose={() => setDetail(null)}
        onToggle={toggle}
        onAddMany={addMany}
        onRequest={() => { setDetail(null); setRequestOpen(true); }}
      />

      <RequestSheet
        open={requestOpen}
        onOpenChange={(o) => { setRequestOpen(o); if (!o) setSentTo(null); }}
        houseName={houseName}
        accent={accent}
        items={cartItems}
        onRemove={toggle}
        onSend={send}
        sending={sending}
        sentTo={sentTo}
        onDone={() => { setRequestOpen(false); setSentTo(null); }}
      />

      <PublicFooter />
    </div>
  );
}
