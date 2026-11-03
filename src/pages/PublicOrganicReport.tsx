import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase } from "@/integrations/supabase/publicClient";
import { Skeleton } from "@/components/ui/skeleton";
import PublicFooter from "@/components/PublicFooter";
import ListeningPeriod, { type Preset } from "@/components/listening/ListeningPeriod";
import DownloadDeck from "@/components/channels/DownloadDeck";
import OrganicReport from "@/components/channels/OrganicReport";
import { dayPeriod, lastDays, periodLabel, periodToRange, type Period } from "@/lib/listening";
import { buildOrganicReport, type ReportDoc } from "../../supabase/functions/_shared/organic-report";

// This function is newer than the generated database types.
const db = publicSupabase as unknown as SupabaseClient;

const PRESET_DAYS: Record<Exclude<Preset, "custom">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const PERIOD_HINT = "Numbers start from the day a handle was added, plus earlier posts read back up to 90 days.";
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function periodFromAddress(from: string | null, to: string | null): Period | null {
  if (!from || !to || !DAY_KEY.test(from) || !DAY_KEY.test(to)) return null;
  const [start, end] = [from, to].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  return Number.isFinite(+start) && Number.isFinite(+end) ? dayPeriod(start, end) : null;
}

/**
 * A brand's organic report on a share link, with no login and nothing that changes anything. Only a link the database
 * doesn't know is "not active". A call that fails (visitors are cut off after 3 seconds) keeps whatever loaded last and
 * tries again at 10 s, 20 s, 40 s, then every minute.
 */
export default function PublicOrganicReport() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [period, setPeriod] = useState<Period>(() => periodFromAddress(params.get("from"), params.get("to")) ?? lastDays(30));
  const [preset, setPreset] = useState<Preset>(() => (periodFromAddress(params.get("from"), params.get("to")) ? "custom" : "30d"));
  const [compare, setCompare] = useState(true);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [inactive, setInactive] = useState(false);
  const [failed, setFailed] = useState(false);
  const failures = useRef(0);
  const range = useMemo(() => periodToRange(period), [period]);

  const load = useCallback(async () => {
    const { data, error } = await db.rpc("get_brand_report_rows_by_token", { _token: token, _from: range.from, _to: range.to });
    if (error) return false;
    if (!data) setInactive(true);
    else setDoc(data as ReportDoc);
    return true;
  }, [token, range.from, range.to]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    failures.current = 0;
    const attempt = async () => {
      const ok = await load().catch(() => false);
      if (stopped) return;
      setFailed(!ok);
      if (ok) return;
      failures.current += 1;
      timer = setTimeout(attempt, Math.min(60_000, 5_000 * 2 ** failures.current));
    };
    attempt();
    return () => { stopped = true; clearTimeout(timer); };
  }, [load]);

  const report = useMemo(() => (doc ? buildOrganicReport(doc, Date.now()) : null), [doc]);

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setPeriod(lastDays(PRESET_DAYS[next]));
  };
  const choosePeriod = (next: Period) => {
    setPreset("custom");
    setPeriod(next);
  };

  let body: React.ReactNode;
  if (inactive) {
    body = <p className="py-16 text-center text-sm text-muted-foreground">This report link isn't active.</p>;
  } else if (!report) {
    body = failed
      ? <p className="py-16 text-center text-sm text-muted-foreground">Couldn't load this report. Trying again.</p>
      : <div className="space-y-4"><Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-72 rounded-[20px]" /></div>;
  } else {
    body = (
      <>
        <header className="mb-5 flex flex-wrap items-center gap-3">
          {doc?.client.logo_url && <img src={doc.client.logo_url} alt="" className="h-11 w-11 rounded-full object-cover" />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-medium tracking-tight">{doc?.client.name}</h1>
            <p className="text-[13px] text-muted-foreground">Organic report</p>
          </div>
          <DownloadDeck report={report} brandName={doc?.client.name ?? "Brand"} rangeLabel={periodLabel(period)} />
        </header>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <ListeningPeriod period={period} preset={preset} compare={compare} onPreset={choosePreset} onPeriod={choosePeriod} onCompare={setCompare} hint={PERIOD_HINT} />
          <span className="text-[12.5px] text-muted-foreground">{periodLabel(period)}</span>
        </div>
        {failed && <p role="status" className="mb-4 text-[12.5px] text-muted-foreground">Couldn't refresh. Trying again.</p>}
        <OrganicReport report={report} compare={compare} />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:p-8">{body}</main>
      <PublicFooter />
    </div>
  );
}
