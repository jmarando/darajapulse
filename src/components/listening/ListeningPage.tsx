import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/dash/PageHeader";
import { Panel } from "@/components/dash/Panel";
import type { ListeningMention, ListeningTopic } from "@/lib/listening";
import ListeningOverview from "./ListeningOverview";
import ListeningMentions from "./ListeningMentions";
import ListeningKeywords from "./ListeningKeywords";

type Brand = { id: string; name: string };

// The listening tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const MENTION_COLUMNS = "id, topic_id, source, url, title, snippet, author, reach, shares, published_at, found_at, sentiment, sentiment_score, theme";
const DAYS = 30;

/** The brand's last 30 days of mentions, read in pages so none are cut off at the API's 1,000 rows. */
async function loadMentions(clientId: string): Promise<ListeningMention[]> {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const out: ListeningMention[] = [];
  for (let start = 0; start < 10_000; start += 1000) {
    const { data, error } = await db
      .from("listening_mentions")
      .select(MENTION_COLUMNS)
      .eq("client_id", clientId)
      .gte("found_at", since)
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
 * sweep picks up.
 */
export default function ListeningPage({ portal = false }: { portal?: boolean }) {
  const { user, isAgency, isSuperAdmin } = useAuth();
  const staff = !portal && (isAgency || isSuperAdmin);
  const [params, setParams] = useSearchParams();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [topics, setTopics] = useState<ListeningTopic[]>([]);
  const [mentions, setMentions] = useState<ListeningMention[]>([]);
  const [creditsToday, setCreditsToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const tab = params.get("tab") ?? "overview";
  const clientId = params.get("brand") ?? brands?.[0]?.id ?? null;
  const brand = brands?.find((b) => b.id === clientId) ?? null;

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
        loadMentions(clientId),
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
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

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
            {staff && (
              <Button variant="outline" size="sm" className="h-9" onClick={searchNow} disabled={searching || !activeTopics.length}>
                <RefreshCw className={`mr-2 h-4 w-4 ${searching ? "animate-spin" : ""}`} /> {searching ? "Searching…" : "Search now"}
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)}>
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mentions">Mentions</TabsTrigger>
          <TabsTrigger value="keywords">Keywords{topics.length ? ` · ${activeTopics.length}` : ""}</TabsTrigger>
        </TabsList>
        {loading || !brands ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[20px]" />)}
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-0">
              <ListeningOverview brandName={brand?.name ?? "Your brand"} topics={topics} mentions={mentions} onAddKeywords={() => setParam("tab", "keywords")} />
            </TabsContent>
            <TabsContent value="mentions" className="mt-0">
              <ListeningMentions topics={topics} mentions={mentions} />
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
