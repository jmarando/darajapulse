import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, Printer, RefreshCw, ChevronRight, Layers, ArrowUpRight, ExternalLink, X } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  PublicationRow, byCountry, byDeliverable, byInfluencer, byMonth, byPlatform, deliverableKey,
  fmtNum, fmtShort, monthKey, monthLabel, normalizeRow, platformCounts, rowCountry, titleCase, totalsFor,
} from "@/lib/reporting";
import { UNKNOWN, cityItems, countryItems, useGeo } from "@/lib/geo";
import { buildDetailedSheets, buildSummarySheets, exportToCsv, exportToExcel, printReport } from "@/lib/reportExports";
import DeliverableGrouping from "@/components/DeliverableGrouping";

const ALL = "__all__";

/** Chart palette drawn from the app's own tokens — accent, ink, amber highlight. */
const C_ACCENT = "hsl(var(--accent))";
const C_INK = "hsl(var(--primary))";
const C_HIGHLIGHT = "hsl(var(--highlight))";

const Stat = ({ label, value, hint, onClick, to }: {
  label: string; value: string; hint?: string; onClick?: () => void; to?: string;
}) => {
  const interactive = !!onClick;
  return (
    <Card
      {...(interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); }
            },
            "aria-label": `${label} — ${value}. ${to || "Open details"}`,
            title: to,
          }
        : {})}
      className={
        interactive
          ? "cursor-pointer transition-[box-shadow,transform] duration-150 hover:shadow-soft active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest text-accent font-medium">{label}</div>
          {interactive && <ArrowUpRight className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden />}
        </div>
        <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
};

const Reports = () => {
  const [rows, setRows] = useState<PublicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [client, setClient] = useState(ALL);
  const [campaign, setCampaign] = useState(ALL);
  const [creator, setCreator] = useState(ALL);
  const [platform, setPlatform] = useState(ALL);
  const [month, setMonth] = useState(ALL);
  const [contentType, setContentType] = useState(ALL);
  const [delStatus, setDelStatus] = useState(ALL);
  const [campStatus, setCampStatus] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const { countries, nameOf } = useGeo();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openDeliverable, setOpenDeliverable] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [tab, setTab] = useState("summary");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Read shareable filter state from the URL once on mount.
  useEffect(() => {
    const g = (k: string) => params.get(k) || "";
    if (g("client")) setClient(g("client"));
    if (g("campaign")) setCampaign(g("campaign"));
    if (g("creator")) setCreator(g("creator"));
    if (g("platform")) setPlatform(g("platform"));
    if (g("month")) setMonth(g("month"));
    if (g("type")) setContentType(g("type"));
    if (g("dstatus")) setDelStatus(g("dstatus"));
    if (g("cstatus")) setCampStatus(g("cstatus"));
    if (g("country")) setCountry(g("country"));
    if (g("city")) setCity(g("city"));
    if (g("from")) setFrom(g("from"));
    if (g("to")) setTo(g("to"));
    if (g("tab")) setTab(g("tab"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const page = 1000;
    const all: any[] = [];
    try {
      for (let start = 0; ; start += page) {
        const { data, error } = await (supabase.rpc("reporting_publications", {
          _campaign_ids: null, _from: null, _to: null,
        } as any) as any).range(start, start + page - 1);
        if (error) throw error;
        const batch = (data as any[]) ?? [];
        all.push(...batch);
        if (batch.length < page) break;
      }
      setRows(all.map(normalizeRow));
      setLastRefreshed(new Date());
    } catch (e: any) {
      setLoadError(e?.message || "Unknown error");
      toast({ title: "Could not load reporting data", description: e?.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);


  const options = useMemo(() => {
    const uniq = (list: { id: string; label: string }[]) => {
      const m = new Map<string, string>();
      list.forEach(({ id, label }) => id && m.set(id, label));
      return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
    };
    return {
      clients: uniq(rows.map((r) => ({ id: r.client_id || "", label: r.client_name || "Unassigned" }))),
      campaigns: uniq(rows
        .filter((r) => client === ALL || r.client_id === client)
        .map((r) => ({ id: r.campaign_id, label: r.campaign_name }))),
      creators: uniq(rows
        .filter((r) => campaign === ALL || r.campaign_id === campaign)
        .map((r) => ({ id: r.influencer_id || "", label: r.influencer_name || "Unknown" }))),
      platforms: [...new Set(rows.map((r) => r.platform))].sort(),
      months: [...new Set(rows.map((r) => monthKey(r.posted_at)))].sort().reverse(),
      contentTypes: [...new Set(rows.map((r) => r.deliverable_content_type).filter(Boolean))] as string[],
      delStatuses: [...new Set(rows.map((r) => r.deliverable_status).filter(Boolean))] as string[],
      campStatuses: [...new Set(rows.map((r) => r.campaign_status).filter(Boolean))] as string[],
      // Countries/cities present in the data the user can actually see.
      countries: countries.filter((c) => rows.some((r) => rowCountry(r) === c.code)),
      cities: [...new Set(rows
        .filter((r) => country === ALL || country === UNKNOWN || rowCountry(r) === country)
        .map((r) => r.influencer_city).filter(Boolean))] as string[],
    };
  }, [rows, client, campaign, countries, country]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (client !== ALL && r.client_id !== client) return false;
    if (campaign !== ALL && r.campaign_id !== campaign) return false;
    if (creator !== ALL && r.influencer_id !== creator) return false;
    if (platform !== ALL && r.platform !== platform) return false;
    if (month !== ALL && monthKey(r.posted_at) !== month) return false;
    if (contentType !== ALL && r.deliverable_content_type !== contentType) return false;
    if (delStatus !== ALL && r.deliverable_status !== delStatus) return false;
    if (campStatus !== ALL && r.campaign_status !== campStatus) return false;
    if (country !== ALL) {
      const c = rowCountry(r);
      if (country === UNKNOWN ? !!c : c !== country) return false;
    }
    if (city !== ALL) {
      if (city === UNKNOWN ? !!r.influencer_city : r.influencer_city !== city) return false;
    }
    const at = r.posted_at ? r.posted_at.slice(0, 10) : "";
    if (from && (!at || at < from)) return false;
    if (to && (!at || at > to)) return false;
    return true;
  }), [rows, client, campaign, creator, platform, month, contentType, delStatus, campStatus, country, city, from, to]);

  const totals = useMemo(() => totalsFor(filtered), [filtered]);
  const platforms = useMemo(() => byPlatform(filtered), [filtered]);
  const creators = useMemo(() => byInfluencer(filtered), [filtered]);
  const months = useMemo(() => byMonth(filtered), [filtered]);
  const deliverables = useMemo(() => byDeliverable(filtered), [filtered]);
  const countryGroups = useMemo(() => byCountry(filtered, nameOf), [filtered, nameOf]);

  const reportName = useMemo(() => {
    const parts = ["Daraja Pulse report"];
    if (campaign !== ALL) parts.push(filtered[0]?.campaign_name || "");
    else if (client !== ALL) parts.push(filtered[0]?.client_name || "");
    if (creator !== ALL) parts.push(filtered[0]?.influencer_name || "");
    if (platform !== ALL) parts.push(titleCase(platform));
    if (country !== ALL) parts.push(country === UNKNOWN ? "No country" : nameOf(country));
    if (city !== ALL) parts.push(city === UNKNOWN ? "No city" : city);
    if (month !== ALL) parts.push(monthLabel(month));
    return parts.filter(Boolean).join(" - ");
  }, [campaign, client, creator, platform, country, city, month, filtered, nameOf]);

  const doExport = (kind: "excel" | "csv", detail: "summary" | "detailed") => {
    const sheets = detail === "summary" ? buildSummarySheets(filtered, nameOf) : buildDetailedSheets(filtered, nameOf);
    if (kind === "excel") exportToExcel(sheets, reportName);
    else exportToCsv(sheets, reportName);
  };

  const resetFilters = () => {
    setClient(ALL); setCampaign(ALL); setCreator(ALL); setPlatform(ALL);
    setMonth(ALL); setContentType(ALL); setDelStatus(ALL); setCampStatus(ALL);
    setCountry(ALL); setCity(ALL);
    setFrom(""); setTo("");
  };

  // Keep the URL in step with the filters so reports can be shared and
  // so drill-through links can carry context back.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (client !== ALL) next.client = client;
    if (campaign !== ALL) next.campaign = campaign;
    if (creator !== ALL) next.creator = creator;
    if (platform !== ALL) next.platform = platform;
    if (month !== ALL) next.month = month;
    if (contentType !== ALL) next.type = contentType;
    if (delStatus !== ALL) next.dstatus = delStatus;
    if (campStatus !== ALL) next.cstatus = campStatus;
    if (country !== ALL) next.country = country;
    if (city !== ALL) next.city = city;
    if (from) next.from = from;
    if (to) next.to = to;
    if (tab !== "summary") next.tab = tab;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, campaign, creator, platform, month, contentType, delStatus, campStatus, country, city, from, to, tab]);

  const labelOf = (list: { id: string; label: string }[], id: string) =>
    list.find((i) => i.id === id)?.label || id;

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (client !== ALL) chips.push({ key: "client", label: `Client: ${labelOf(options.clients, client)}`, clear: () => setClient(ALL) });
    if (campaign !== ALL) chips.push({ key: "campaign", label: `Campaign: ${labelOf(options.campaigns, campaign)}`, clear: () => setCampaign(ALL) });
    if (creator !== ALL) chips.push({ key: "creator", label: `Creator: ${labelOf(options.creators, creator)}`, clear: () => setCreator(ALL) });
    if (platform !== ALL) chips.push({ key: "platform", label: `Platform: ${titleCase(platform)}`, clear: () => setPlatform(ALL) });
    if (month !== ALL) chips.push({ key: "month", label: `Month: ${monthLabel(month)}`, clear: () => setMonth(ALL) });
    if (contentType !== ALL) chips.push({ key: "type", label: `Type: ${titleCase(contentType)}`, clear: () => setContentType(ALL) });
    if (delStatus !== ALL) chips.push({ key: "dstatus", label: `Deliverable: ${titleCase(delStatus)}`, clear: () => setDelStatus(ALL) });
    if (campStatus !== ALL) chips.push({ key: "cstatus", label: `Campaign status: ${titleCase(campStatus)}`, clear: () => setCampStatus(ALL) });
    if (country !== ALL) chips.push({ key: "country", label: `Country: ${country === UNKNOWN ? "Not specified" : nameOf(country)}`, clear: () => { setCountry(ALL); setCity(ALL); } });
    if (city !== ALL) chips.push({ key: "city", label: `City: ${city === UNKNOWN ? "Not specified" : city}`, clear: () => setCity(ALL) });
    if (from) chips.push({ key: "from", label: `From ${from}`, clear: () => setFrom("") });
    if (to) chips.push({ key: "to", label: `To ${to}`, clear: () => setTo("") });
    return chips;
  }, [options, client, campaign, creator, platform, month, contentType, delStatus, campStatus, country, city, from, to, nameOf]);

  const monthChart = months.map((m) => ({
    month: m.key === "unknown" ? "Undated" : m.label.replace(/^(\w{3})\w* (\d{4})$/, "$1 $2").slice(0, 8),

    views: Math.round(m.views),
    engagement: Math.round(m.engagement),
    deliverables: m.deliverables,
    publications: m.publications,
  }));

  return (
    <div className="p-6 space-y-6 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Campaign, creator, platform and monthly performance — deliverables counted once, publications counted per platform.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><Download className="w-4 h-4 mr-2" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("excel", "summary")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel — summary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("excel", "detailed")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel — detailed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv", "summary")}>
                <Download className="w-4 h-4 mr-2" /> CSV — summary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv", "detailed")}>
                <Download className="w-4 h-4 mr-2" /> CSV — detailed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={printReport}>
                <Printer className="w-4 h-4 mr-2" /> Print / PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="print:hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Combobox allValue={ALL} value={client} onChange={(v) => { setClient(v); setCampaign(ALL); setCreator(ALL); }} placeholder="All clients" items={options.clients} />
            <Combobox allValue={ALL} value={campaign} onChange={(v) => { setCampaign(v); setCreator(ALL); }} placeholder="All campaigns" items={options.campaigns} />
            <Combobox allValue={ALL} value={creator} onChange={setCreator} placeholder="All creators" items={options.creators} />
            <Combobox allValue={ALL} value={platform} onChange={setPlatform} placeholder="All platforms" items={options.platforms.map((p) => ({ id: p, label: titleCase(p) }))} />
            <Combobox allValue={ALL} value={country} onChange={(v) => { setCountry(v); setCity(ALL); }} placeholder="All countries" items={countryItems(options.countries)} />
            <Combobox allValue={ALL} value={city} onChange={setCity} placeholder="All cities" items={cityItems(options.cities)} />
            <Combobox allValue={ALL} value={month} onChange={setMonth} placeholder="All months" items={options.months.map((m) => ({ id: m, label: monthLabel(m) }))} />
            <Combobox allValue={ALL} value={contentType} onChange={setContentType} placeholder="All content types" items={options.contentTypes.map((c) => ({ id: c, label: titleCase(c) }))} />
            <Combobox allValue={ALL} value={delStatus} onChange={setDelStatus} placeholder="All deliverable statuses" items={options.delStatuses.map((c) => ({ id: c, label: titleCase(c) }))} />
            <Combobox allValue={ALL} value={campStatus} onChange={setCampStatus} placeholder="All campaign statuses" items={options.campStatuses.map((c) => ({ id: c, label: titleCase(c) }))} />
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
            </div>
          </div>
          {!!activeChips.length && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Active filters</span>
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="max-w-[220px] truncate">{c.label}</span>
                  <X className="w-3 h-3" />
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={resetFilters}>Clear all</Button>
              {campaign !== ALL && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/app/campaigns/${campaign}`)}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open campaign
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-14" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Unique deliverables" value={fmtNum(totals.deliverables)} hint={`${totals.creators} creators`}
            to="Deliverables register" onClick={() => setTab("deliverables")} />
          <Stat label="Platform publications" value={fmtNum(totals.publications)} hint="one per platform post"
            to={campaign !== ALL ? "Campaign submissions" : "Detailed posts"}
            onClick={() => (campaign !== ALL ? navigate(`/app/campaigns/${campaign}?tab=submissions`) : setTab("posts"))} />
          <Stat label="Total views" value={fmtShort(totals.views)} hint={fmtNum(totals.views)}
            to="Platform breakdown" onClick={() => setTab("platform")} />
          <Stat label="Total engagement" value={fmtShort(totals.engagement)} hint={`${totals.er.toFixed(1)}% rate`}
            to="Creator breakdown" onClick={() => setTab("influencer")} />
          <Stat label="Total likes" value={fmtShort(totals.likes)} />
          <Stat label="Total comments" value={fmtShort(totals.comments)} />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="print:hidden flex-wrap h-auto">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="influencer">By influencer</TabsTrigger>
          <TabsTrigger value="platform">By platform</TabsTrigger>
          <TabsTrigger value="month">By month</TabsTrigger>
          <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
          <TabsTrigger value="posts">Detailed posts</TabsTrigger>
          <TabsTrigger value="grouping">Grouping</TabsTrigger>
        </TabsList>

        {/* SUMMARY */}
        <TabsContent value="summary" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly views trend</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} tickFormatter={fmtShort} />
                    <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
                    <Line type="monotone" dataKey="views" stroke={C_ACCENT} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly engagement trend</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} tickFormatter={fmtShort} />
                    <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
                    <Line type="monotone" dataKey="engagement" stroke={C_HIGHLIGHT} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Platform comparison</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platforms.map((p) => ({ name: titleCase(p.label), views: Math.round(p.views), engagement: Math.round(p.engagement) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={fmtShort} />
                    <Tooltip formatter={(v: any) => fmtNum(Number(v))} /><Legend />
                    <Bar dataKey="views" fill={C_ACCENT} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="engagement" fill={C_INK} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Deliverables vs publications by month</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip /><Legend />
                    <Bar dataKey="deliverables" fill={C_ACCENT} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="publications" fill={C_INK} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top creators</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={creators.slice(0, 12).map((c) => ({ name: c.label.split(" ")[0], views: Math.round(c.views) }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" fontSize={11} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis fontSize={11} tickFormatter={fmtShort} />
                  <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
                  <Bar dataKey="views" fill={C_ACCENT} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* COUNTRY BREAKDOWN — follows every other active filter */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Views and engagement by country</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryGroups.map((c) => ({ name: c.label, views: Math.round(c.views), engagement: Math.round(c.engagement) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={fmtShort} />
                    <Tooltip formatter={(v: any) => fmtNum(Number(v))} /><Legend />
                    <Bar dataKey="views" fill={C_ACCENT} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="engagement" fill={C_INK} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Country breakdown</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Country</TableHead><TableHead className="text-right">Creators</TableHead>
                    <TableHead className="text-right">Deliverables</TableHead><TableHead className="text-right">Publications</TableHead>
                    <TableHead className="text-right">Views</TableHead><TableHead className="text-right">Engagement</TableHead>
                    <TableHead className="text-right">ER</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {countryGroups.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No country data for these filters</TableCell></TableRow>
                    ) : countryGroups.map((c) => (
                      <TableRow
                        key={c.key}
                        className="cursor-pointer"
                        onClick={() => setCountry(c.key === "unknown" ? UNKNOWN : c.key)}
                        title={`Filter reports to ${c.label}`}
                      >
                        <TableCell className="font-medium">{c.label}</TableCell>
                        <TableCell className="text-right">{c.creators}</TableCell>
                        <TableCell className="text-right">{c.deliverables}</TableCell>
                        <TableCell className="text-right">{c.publications}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.views)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.engagement)}</TableCell>
                        <TableCell className="text-right">{c.er.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>


        {/* BY INFLUENCER */}
        <TabsContent value="influencer" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Influencer</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Deliverables</TableHead>
                <TableHead className="text-right">Publications</TableHead><TableHead className="text-right">TikTok</TableHead>
                <TableHead className="text-right">Instagram</TableHead><TableHead className="text-right">Facebook</TableHead>
                <TableHead className="text-right">Other</TableHead><TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Likes</TableHead><TableHead className="text-right">Comments</TableHead>
                <TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Engagement</TableHead>
                <TableHead className="text-right">ER</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {creators.map((c) => {
                  const pc = platformCounts(c.rows);
                  const other = c.publications - (pc.tiktok || 0) - (pc.instagram || 0) - (pc.facebook || 0);
                  const mrows = byMonth(c.rows);
                  return (
                    <>
                      <TableRow key={c.key} className="cursor-pointer" onClick={() => setOpenMonth(openMonth === c.key ? null : c.key)}>
                        <TableCell className="font-medium">{c.label}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {[c.rows[0].influencer_city, rowCountry(c.rows[0]) ? nameOf(rowCountry(c.rows[0])) : ""].filter(Boolean).join(", ") || "Not specified"}
                        </TableCell>
                        <TableCell className="text-right">{c.deliverables}</TableCell>
                        <TableCell className="text-right">{c.publications}</TableCell>
                        <TableCell className="text-right">{pc.tiktok || 0}</TableCell>
                        <TableCell className="text-right">{pc.instagram || 0}</TableCell>
                        <TableCell className="text-right">{pc.facebook || 0}</TableCell>
                        <TableCell className="text-right">{other}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.views)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.likes)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.comments)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.shares)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.engagement)}</TableCell>
                        <TableCell className="text-right">{c.er.toFixed(1)}%</TableCell>
                      </TableRow>
                      {openMonth === c.key && mrows.map((m) => (
                        <TableRow key={`${c.key}-${m.key}`} className="bg-muted/40 text-sm">
                          <TableCell className="pl-8 text-muted-foreground">{m.label}</TableCell>
                          <TableCell className="text-right">{m.deliverables}</TableCell>
                          <TableCell className="text-right">{m.publications}</TableCell>
                          <TableCell colSpan={4} />
                          <TableCell className="text-right">{fmtNum(m.views)}</TableCell>
                          <TableCell className="text-right">{fmtNum(m.likes)}</TableCell>
                          <TableCell className="text-right">{fmtNum(m.comments)}</TableCell>
                          <TableCell className="text-right">{fmtNum(m.shares)}</TableCell>
                          <TableCell className="text-right">{fmtNum(m.engagement)}</TableCell>
                          <TableCell className="text-right">{m.er.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* BY PLATFORM */}
        <TabsContent value="platform" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Platform</TableHead><TableHead className="text-right">Publications</TableHead>
                <TableHead className="text-right">Deliverables represented</TableHead><TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Likes</TableHead><TableHead className="text-right">Comments</TableHead>
                <TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Engagement</TableHead>
                <TableHead className="text-right">ER</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {platforms.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="font-medium">{titleCase(p.label)}</TableCell>
                    <TableCell className="text-right">{p.publications}</TableCell>
                    <TableCell className="text-right">{p.deliverables}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.views)}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.likes)}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.comments)}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.shares)}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.engagement)}</TableCell>
                    <TableCell className="text-right">{p.er.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* BY MONTH */}
        <TabsContent value="month" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Month</TableHead><TableHead className="text-right">Deliverables</TableHead>
                <TableHead className="text-right">Publications</TableHead><TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Likes</TableHead><TableHead className="text-right">Comments</TableHead>
                <TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Engagement</TableHead>
                <TableHead className="text-right">ER</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {months.map((m) => (
                  <>
                    <TableRow key={m.key} className="cursor-pointer" onClick={() => setOpenMonth(openMonth === `m:${m.key}` ? null : `m:${m.key}`)}>
                      <TableCell className="font-medium flex items-center gap-1">
                        <ChevronRight className={`w-3 h-3 transition-transform ${openMonth === `m:${m.key}` ? "rotate-90" : ""}`} />{m.label}
                      </TableCell>
                      <TableCell className="text-right">{m.deliverables}</TableCell>
                      <TableCell className="text-right">{m.publications}</TableCell>
                      <TableCell className="text-right">{fmtNum(m.views)}</TableCell>
                      <TableCell className="text-right">{fmtNum(m.likes)}</TableCell>
                      <TableCell className="text-right">{fmtNum(m.comments)}</TableCell>
                      <TableCell className="text-right">{fmtNum(m.shares)}</TableCell>
                      <TableCell className="text-right">{fmtNum(m.engagement)}</TableCell>
                      <TableCell className="text-right">{m.er.toFixed(1)}%</TableCell>
                    </TableRow>
                    {openMonth === `m:${m.key}` && byInfluencer(m.rows).map((c) => (
                      <TableRow key={`${m.key}-${c.key}`} className="bg-muted/40 text-sm">
                        <TableCell className="pl-8 text-muted-foreground">{c.label}</TableCell>
                        <TableCell className="text-right">{c.deliverables}</TableCell>
                        <TableCell className="text-right">{c.publications}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.views)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.likes)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.comments)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.shares)}</TableCell>
                        <TableCell className="text-right">{fmtNum(c.engagement)}</TableCell>
                        <TableCell className="text-right">{c.er.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* DELIVERABLES */}
        <TabsContent value="deliverables" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Deliverable</TableHead><TableHead>Influencer</TableHead><TableHead>Platforms</TableHead>
                <TableHead className="text-right">Publications</TableHead><TableHead>Published</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Likes</TableHead><TableHead className="text-right">Comments</TableHead>
                <TableHead className="text-right">Engagement</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {deliverables.map((d) => (
                  <>
                    <TableRow key={d.key} className="cursor-pointer" onClick={() => setOpenDeliverable(openDeliverable === d.key ? null : d.key)}>
                      <TableCell className="font-medium max-w-[320px] truncate flex items-center gap-1">
                        <Layers className="w-3 h-3 text-muted-foreground shrink-0" />{d.label}
                      </TableCell>
                      <TableCell>{d.rows[0].influencer_name || "—"}</TableCell>
                      <TableCell className="space-x-1">
                        {[...new Set(d.rows.map((r) => r.platform))].map((p) => (
                          <Badge key={p} variant="secondary" className="text-[10px]">{titleCase(p)}</Badge>
                        ))}
                      </TableCell>
                      <TableCell className="text-right">{d.publications}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[...new Set(d.rows.map((r) => (r.posted_at || "").slice(0, 10)).filter(Boolean))].join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{titleCase(d.rows[0].deliverable_status || "")}</TableCell>
                      <TableCell className="text-right">{fmtNum(d.views)}</TableCell>
                      <TableCell className="text-right">{fmtNum(d.likes)}</TableCell>
                      <TableCell className="text-right">{fmtNum(d.comments)}</TableCell>
                      <TableCell className="text-right">{fmtNum(d.engagement)}</TableCell>
                    </TableRow>
                    {openDeliverable === d.key && d.rows.map((r) => (
                      <TableRow key={r.post_id} className="bg-muted/40 text-sm">
                        <TableCell className="pl-8 text-muted-foreground">
                          {r.post_url ? <a href={r.post_url} target="_blank" rel="noreferrer" className="underline">{titleCase(r.platform)} publication</a> : `${titleCase(r.platform)} publication`}
                        </TableCell>
                        <TableCell colSpan={2} className="text-xs text-muted-foreground truncate max-w-[260px]">{r.caption?.slice(0, 80)}</TableCell>
                        <TableCell className="text-right">1</TableCell>
                        <TableCell className="text-xs">{(r.posted_at || "").slice(0, 10)}</TableCell>
                        <TableCell className="text-xs">{titleCase(r.post_status || "")}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.views)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.likes)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.comments)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.likes + r.comments + r.shares + r.saves)}</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* DETAILED POSTS */}
        <TabsContent value="posts" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Influencer</TableHead><TableHead>Campaign</TableHead><TableHead>Platform</TableHead>
                <TableHead>Published</TableHead><TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Likes</TableHead><TableHead className="text-right">Comments</TableHead>
                <TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Saves</TableHead>
                <TableHead className="text-right">Reach</TableHead><TableHead>Link</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((r) => (
                  <TableRow key={r.post_id}>
                    <TableCell className="font-medium">{r.influencer_name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.campaign_name}</TableCell>
                    <TableCell>{titleCase(r.platform)}</TableCell>
                    <TableCell className="text-xs">{(r.posted_at || "").slice(0, 10)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.views)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.likes)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.comments)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.shares)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.saves)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.reach)}</TableCell>
                    <TableCell>{r.post_url ? <a href={r.post_url} target="_blank" rel="noreferrer" className="underline text-xs">Open</a> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 500 && (
              <div className="p-3 text-xs text-muted-foreground">Showing the first 500 publications — export for the full list.</div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* GROUPING */}
        <TabsContent value="grouping" className="mt-4">
          <DeliverableGrouping rows={filtered} campaignId={campaign === ALL ? null : campaign} onChanged={load} />
        </TabsContent>
      </Tabs>

      {loading && <div className="text-sm text-muted-foreground">Loading reporting data…</div>}
      {!loading && loadError && (
        <div className="text-sm text-destructive">
          Reporting data could not be loaded: {loadError}{" "}
          <Button variant="link" size="sm" className="px-1" onClick={load}>Try again</Button>
        </div>
      )}
      {!loading && !loadError && !rows.length && (
        <div className="text-sm text-muted-foreground">
          No publications have been recorded yet for the campaigns you can access. Add posts to a campaign, then refresh metrics.
        </div>
      )}
      {!loading && !loadError && !!rows.length && !filtered.length && (
        <div className="text-sm text-muted-foreground">
          No reporting data matches the selected filters.{" "}
          <Button variant="link" size="sm" className="px-1" onClick={resetFilters}>Clear filters</Button>
        </div>
      )}
      {!loading && lastRefreshed && (
        <div className="text-xs text-muted-foreground">Last refreshed {lastRefreshed.toLocaleString()}</div>
      )}
    </div>
  );
};


export default Reports;
