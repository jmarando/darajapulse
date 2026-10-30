import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/dash/PageHeader";
import { PageTab, PageTabList } from "@/components/dash/PageTabs";
import { Panel } from "@/components/dash/Panel";
import { lastDays, periodLabel, previousPeriod, withinPeriod, type ListeningMention, type ListeningTopic, type Period } from "@/lib/listening";
import { buildListeningDeck } from "@/lib/listeningDeck";
import ListeningOverview from "./ListeningOverview";
import ListeningMentions from "./ListeningMentions";
import ListeningKeywords from "./ListeningKeywords";
import ListeningPeriod, { type Preset } from "./ListeningPeriod";

type Brand = { id: string; name: string };

// The listening tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const MENTION_COLUMNS = "id, topic_id, source, url, title, snippet, author, reach, shares, published_at, found_at, sentiment, sentiment_score, theme";
const PRESET_DAYS: Record<Exclude<Preset, "custom">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Mentions found since a moment, read in pages so none are cut off at the API's 1,000
 * rows. Everything found stays in the table, so filtering by when we found it is enough
 * to reach any period: a post cannot be found before the day it was published.
 */
async function loadMentions(clientId: string, since: number): Promise<ListeningMention[]> {
  const from = new Date(since).toISOString();
  const out: ListeningMention[] = [];
  for (let start = 0; start < 10_000; start += 1000) {
    const { data, error } = await db
      .from("listening_mentions")
      .select(MENTION_COLUMNS)
      .eq("client_id", clientId)
      .gte("found_at", from)
      .order("found_at", { ascending: false })
      .range(start, start + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Social listening for one brand: share of voice against competitors, mood,
 * themes and posts that need attention, the mentions themselves, and the
 * keywords that find them. Agency staff pick any of their clients and can
 * search on demand; brands see their own and add keywords, which the hourly
 * sweep picks up. Everything is shown for a chosen period, with the period
 * before it for comparison, and can be downloaded as a deck.
 */
export default function ListeningPage({ portal = false }: { portal?: boolean }) {
  const { user, isAgency, isSuperAdmin } = useAuth();
  const staff = !portal && (isAgency || isSuperAdmin);
  const [params, setParams] = useSearchParams();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [topics, setTopics] = useState<ListeningTopic[]>([]);
  const [mentions, setMentions] = useState<ListeningMention[]>([]);
  const [period, setPeriod] = useState<Period>(() => lastDays(30));
  const [preset, setPreset] = useState<Preset>("30d");
  const [compare, setCompare] = useState(true);
  const [creditsToday, setCreditsToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tab = params.get("tab") ?? "overview";
  const clientId = params.get("brand") ?? brands?.[0]?.id ?? null;
  const brand = brands?.find((b) => b.id === clientId) ?? null;

  // The window the chosen period is compared with, and the earliest day either needs.
  const previous = useMemo(() => previousPeriod(period), [period]);
  const loadedFrom = Math.min(period.start, previous.start);

  const inPeriod = useMemo(() => withinPeriod(mentions, period), [mentions, period]);
  const inPrevious = useMemo(() => withinPeriod(mentions, previous), [mentions, previous]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (portal) {
        const { data } = await supabase.from("client_members").select("client_id, clients(id, name)").eq("user_id", user.id);
        const list = ((data ?? []) as { clients: Brand | null }[]).map((r) => r.clients).filter((c): c is Brand => !!c);
        setBrands(list.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const { data } = await supabase.from("clients").select("id, name").order("name");
        setBrands((data ?? []) as Brand[]);
      }
    })();
  }, [user, portal]);

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [t, m, c] = await Promise.all([
        db.from("listening_topics").select("*").eq("client_id", clientId).order("created_at"),
        loadMentions(clientId, loadedFrom),
        db.rpc("listening_credits_today", { _client_id: clientId }),
      ]);
      if (t.error) throw t.error;
      setTopics(t.data ?? []);
      setMentions(m);
      setCreditsToday(typeof c.data === "number" ? c.data : null);
    } catch (e) {
      toast({ title: "Couldn't load listening", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [clientId, loadedFrom]);

  useEffect(() => { load(); }, [load]);

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setPeriod(lastDays(PRESET_DAYS[next]));
  };

  // Stepping or picking dates is no longer one of the presets, so the label shows the dates.
  const choosePeriod = (next: Period) => {
    setPreset("custom");
    setPeriod(next);
  };

  const searchNow = async () => {
    if (!clientId) return;
    setSearching(true);
    const { data, error } = await supabase.functions.invoke("listening-sweep", { body: { client_id: clientId } });
    setSearching(false);
    if (error || data?.error) {
      toast({ title: "Search didn't run", description: error?.message ?? data?.error, variant: "destructive" });
      return;
    }
    if (data?.ran === false) {
      toast({ title: "Search is busy", description: data.note });
      return;
    }
    const note = (data?.notes ?? [])[0];
    toast({
      title: data?.topics ? `Searched ${data.topics} keyword${data.topics === 1 ? "" : "s"} · ${data.stored} new post${data.stored === 1 ? "" : "s"}` : "Nothing to search right now",
      description: data?.topics ? `${data.credits_used} credits used${note ? ` · ${note}` : ""}` : note ?? "Every keyword was searched in the last hour.",
    });
    load();
  };

  const downloadPpt = async () => {
    if (!brand) return;
    setExporting(true);
    try {
      const deck = buildListeningDeck({
        brandName: brand.name,
        topics,
        mentions: inPeriod,
        previousMentions: inPrevious,
        period,
        previous,
        compare,
      });
      // Loaded only when someone exports, so the page doesn't carry the deck code around.
      const { exportListeningToPptx } = await import("@/lib/exportListening");
      await exportListeningToPptx(deck);
    } catch (e) {
      toast({ title: "Couldn't build the deck", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const activeTopics = useMemo(() => topics.filter((t) => t.active), [topics]);

  if (brands && brands.length === 0) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:p-8">
        <PageHeader title="Listening" subtitle="What people say about your brand and its competitors." />
        <Panel>
          <p className="text-sm text-muted-foreground">
            {portal ? "Your account isn't linked to a brand yet. Ask your agency to invite you." : "Add a client first. Listening runs per client brand."}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:p-8">
      <PageHeader
        title="Listening"
        subtitle={brand ? `What people say about ${brand.name} and its competitors on TikTok, YouTube and Reddit.` : "What people say about your brand and its competitors."}
        actions={
          <>
            {brands && brands.length > 1 && (
              <Select value={clientId ?? undefined} onValueChange={(v) => setParam("brand", v)}>
                <SelectTrigger className="h-9 w-[220px]" aria-label="Brand"><SelectValue placeholder="Pick a brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={downloadPpt}
              disabled={exporting || !inPeriod.length}
              title={inPeriod.length ? "Download the period as a PowerPoint deck" : "No posts in this period to put in a deck"}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {exporting ? "Preparing…" : "Download PPT"}
            </Button>
            {staff && (
              <Button variant="outline" size="sm" className="h-9" onClick={searchNow} disabled={searching || !activeTopics.length}>
                <RefreshCw className={`mr-2 h-4 w-4 ${searching ? "animate-spin" : ""}`} /> {searching ? "Searching…" : "Search now"}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ListeningPeriod
          period={period}
          preset={preset}
          compare={compare}
          onPreset={choosePreset}
          onPeriod={choosePeriod}
          onCompare={setCompare}
        />
        <span className="text-[12.5px] text-muted-foreground">{periodLabel(period)}</span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)}>
        <PageTabList active={tab} className="mb-5 w-fit max-w-full">
          <PageTab value="overview">Overview</PageTab>
          <PageTab value="mentions">Mentions</PageTab>
          <PageTab value="keywords" count={activeTopics.length || undefined}>Keywords</PageTab>
        </PageTabList>
        {loading || !brands ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-[20px]" />)}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-72 rounded-[20px] lg:col-span-2" />
              <Skeleton className="h-72 rounded-[20px]" />
            </div>
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-0">
              <ListeningOverview
                brandName={brand?.name ?? "Your brand"}
                topics={topics}
                mentions={inPeriod}
                previousMentions={inPrevious}
                period={period}
                rangeLabel={periodLabel(period)}
                compare={compare}
                hasAnyPosts={mentions.length > 0}
                onResetPeriod={() => choosePreset("30d")}
                creditsToday={creditsToday}
                showCredits={staff}
                onAddKeywords={() => setParam("tab", "keywords")}
              />
            </TabsContent>
            <TabsContent value="mentions" className="mt-0">
              <ListeningMentions topics={topics} mentions={inPeriod} />
            </TabsContent>
            <TabsContent value="keywords" className="mt-0">
              {clientId && (
                <ListeningKeywords
                  clientId={clientId}
                  brandName={brand?.name ?? "your brand"}
                  topics={topics}
                  creditsToday={creditsToday}
                  showCredits={staff}
                  onChanged={load}
                />
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
