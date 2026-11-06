import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/dash/PageHeader";
import { Panel } from "@/components/dash/Panel";
import ListeningPeriod, { type Preset } from "@/components/listening/ListeningPeriod";
import { lastDays, periodLabel, periodToRange, type Period } from "@/lib/listening";
import { loadChannels, loadReportDoc, startConnect, type BrandChannel } from "@/lib/brandChannels";
import { buildOrganicReport, type ReportDoc } from "../../../supabase/functions/_shared/organic-report";
import BrandReportEmail from "./BrandReportEmail";
import ChannelsCard from "./ChannelsCard";
import ConnectMeta from "./ConnectMeta";
import DownloadDeck from "./DownloadDeck";
import OrganicReport from "./OrganicReport";
import ShareReport from "./ShareReport";

type Brand = { id: string; name: string };

const PRESET_DAYS: Record<Exclude<Preset, "custom">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const PERIOD_HINT = "Numbers start from the day a handle was added, plus earlier posts read back up to 90 days.";

/**
 * How a brand's own accounts are doing. Agency staff pick any of their clients and add handles; a brand's users see
 * their own, and connect or disconnect their pages.
 */
export default function ChannelsPage({ portal = false }: { portal?: boolean }) {
  const { user, isAgency, isSuperAdmin } = useAuth();
  const canManage = !portal && (isAgency || isSuperAdmin);
  const [params, setParams] = useSearchParams();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [channels, setChannels] = useState<BrandChannel[] | null>(null);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<Period>(() => lastDays(30));
  const [preset, setPreset] = useState<Preset>("30d");
  const [compare, setCompare] = useState(true);
  const [reloads, setReloads] = useState(0);
  const clientId = params.get("brand") ?? brands?.[0]?.id ?? null;
  const brand = brands?.find((b) => b.id === clientId) ?? null;
  const range = useMemo(() => periodToRange(period), [period]);
  const reload = useCallback(() => setReloads((n) => n + 1), []);

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

  // A late answer for a brand or period we have moved away from must not fill in this one.
  useEffect(() => {
    if (!clientId) return;
    let current = true;
    setFailed(false);
    loadChannels(clientId)
      .then((list) => { if (current) setChannels(list); })
      .catch((e) => {
        if (!current) return;
        setChannels([]);
        toast({ title: "Couldn't load the accounts", description: (e as Error).message, variant: "destructive" });
      });
    loadReportDoc(clientId, range.from, range.to)
      .then((next) => { if (current) setDoc(next); })
      .catch(() => { if (current) { setDoc(null); setFailed(true); } });
    return () => { current = false; };
  }, [clientId, range.from, range.to, reloads]);

  const report = useMemo(() => (doc ? buildOrganicReport(doc, Date.now()) : null), [doc]);

  const setBrand = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("brand", id);
    setParams(next, { replace: true });
    setChannels(null);
    setDoc(null);
  };

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setPeriod(lastDays(PRESET_DAYS[next]));
  };

  const choosePeriod = (next: Period) => {
    setPreset("custom");
    setPeriod(next);
  };

  const reconnect = async () => {
    if (!clientId) return;
    try {
      window.location.assign(await startConnect(clientId));
    } catch (e) {
      toast({ title: "Couldn't start the Facebook step", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (brands && brands.length === 0) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:p-8">
        <PageHeader title="Channels" subtitle="How a brand's own accounts are doing." />
        <Panel>
          <p className="text-sm text-muted-foreground">
            {portal ? "Your account isn't linked to a brand yet. Ask your agency to invite you." : "Add a client first. Channels run per client brand."}
          </p>
        </Panel>
      </div>
    );
  }

  const hasChannels = !!channels && channels.length > 0;
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:p-8">
      <PageHeader
        title="Channels"
        subtitle={brand ? `How ${brand.name}'s own accounts are doing.` : "How a brand's own accounts are doing."}
        actions={
          <>
            {brands && brands.length > 1 && (
              <Select value={clientId ?? undefined} onValueChange={setBrand}>
                <SelectTrigger className="h-9 w-[220px]" aria-label="Brand"><SelectValue placeholder="Pick a brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {canManage && hasChannels && clientId && <ShareReport clientId={clientId} brandName={brand?.name ?? "This brand"} />}
            {report && hasChannels && <DownloadDeck report={report} brandName={brand?.name ?? doc?.client.name ?? "Brand"} rangeLabel={periodLabel(period)} />}
          </>
        }
      />

      {clientId && channels ? (
        <ChannelsCard
          clientId={clientId}
          brandName={brand?.name ?? "This brand"}
          channels={channels}
          canManage={canManage}
          canConnect
          onChanged={reload}
          onReconnect={reconnect}
          connect={<ConnectMeta clientId={clientId} brandName={brand?.name ?? "this brand"} canMakeLinks={canManage} />}
        />
      ) : (
        <Skeleton className="mb-5 h-40 rounded-[20px]" />
      )}

      {channels && !hasChannels ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            {canManage ? "Add this brand's handles to start its report." : "Your agency hasn't added your accounts yet."}
          </p>
        </Panel>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <ListeningPeriod period={period} preset={preset} compare={compare} onPreset={choosePreset} onPeriod={choosePeriod} onCompare={setCompare} hint={PERIOD_HINT} />
            <span className="text-[12.5px] text-muted-foreground">{periodLabel(period)}</span>
          </div>
          {failed ? (
            <Panel>
              <p className="text-sm text-muted-foreground">Couldn't load the report.</p>
              <Button variant="outline" size="sm" className="mt-3 h-9" onClick={reload}>Try again</Button>
            </Panel>
          ) : report ? (
            <>
              <OrganicReport report={report} compare={compare} />
              {clientId && <div className="mt-5"><BrandReportEmail clientId={clientId} brandName={brand?.name ?? "this brand"} canEdit={canManage} /></div>}
            </>
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-28 rounded-[20px]" />
              <Skeleton className="h-72 rounded-[20px]" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
