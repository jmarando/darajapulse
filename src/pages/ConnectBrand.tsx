import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { platformLabel } from "@/lib/reportInsights";
import type { SharedAsset } from "../../supabase/functions/_shared/meta-graph";

// This function is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const FINISHED = "This step is finished or has expired. Open the link again if you still need to connect.";
const ERRORS: Record<string, string> = {
  denied: "You cancelled the Facebook step, so nothing was connected.",
  no_pages: "Facebook didn't share any pages. Log in with the profile that manages the page, and leave the page ticked when Facebook asks.",
  invalid_state: "This step has expired. Open the link again.",
  token: "Facebook didn't finish the login. Please try again.",
};

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-4">
    <Card className="w-full max-w-md p-6 sm:p-8">{children}</Card>
  </div>
);
const Say = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
const BackToPulse = () => <Button asChild variant="outline" size="sm" className="mt-4 h-9"><Link to="/app/channels">Back to Pulse</Link></Button>;

type LinkInfo = { status: "open" | "expired" | "cancelled"; brand_name: string; brand_logo: string | null; agency_name: string | null };

/** The page a connect link opens: no Pulse login, what we read and won't do, and the button to Facebook. */
function LinkPage({ token }: { token: string }) {
  const [info, setInfo] = useState<LinkInfo | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await db.rpc("get_brand_connect_link", { _token: token });
    if (error) return setFailed(true);
    setInfo((data ?? null) as LinkInfo | null);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setStarting(true);
    setProblem(null);
    const { data, error } = await supabase.functions.invoke("brand-connect-start", { body: { link_token: token } });
    if (error || !data?.url) {
      setStarting(false);
      return setProblem("Couldn't start the Facebook step. Please try again.");
    }
    window.location.assign(data.url);
  };

  if (failed) {
    return (
      <Frame>
        <Say>Couldn't load this page.</Say>
        <Button variant="outline" size="sm" className="mt-4 h-9" onClick={load}>Try again</Button>
      </Frame>
    );
  }
  if (info === undefined) return <Frame><Say>Loading…</Say></Frame>;
  if (info === null) return <Frame><Say>We don't know this link. Check you have all of it.</Say></Frame>;
  const agency = info.agency_name ?? "your agency";
  if (info.status === "expired") return <Frame><Say>This link has expired. Ask {agency} for a new one.</Say></Frame>;
  if (info.status === "cancelled") return <Frame><Say>This link was cancelled. Ask {agency} for a new one.</Say></Frame>;

  return (
    <Frame>
      {info.brand_logo && <img src={info.brand_logo} alt="" className="mb-4 h-12 w-12 rounded-full object-cover" />}
      <h1 className="text-xl font-medium">Connect {info.brand_name} to Daraja Pulse</h1>
      <p className="mt-1 text-sm text-muted-foreground">{agency} uses Daraja Pulse to report on {info.brand_name}'s pages.</p>
      <p className="mt-4 text-sm"><span className="font-medium">We'll read:</span> your pages' posts, their views, likes, comments and shares, your followers and audience.</p>
      <p className="mt-2 text-sm"><span className="font-medium">We won't:</span> post, comment or read your messages.</p>
      <Button className="mt-6 h-10 w-full" onClick={start} disabled={starting}>Continue with Facebook</Button>
      {problem && <p role="alert" className="mt-2 text-[12.5px] text-destructive">{problem}</p>}
      <p className="mt-3 text-[12.5px] text-muted-foreground">If Facebook won't open here, open this link in Chrome or Safari.</p>
    </Frame>
  );
}

type Connected = { name: string | null; username: string | null; platform: string };

const connectedLabel = (c: Connected) =>
  c.platform === "instagram" && c.username ? `@${c.username} (Instagram)` : `${c.name ?? c.username ?? "An account"} (${platformLabel(c.platform)})`;

/** After login: which of what Facebook shared belongs to this brand. Nothing is ticked, and nothing unticked is kept. */
function ChoosePage({ pendingId, state }: { pendingId: string; state: string }) {
  const [read, setRead] = useState<{ brand_name: string; assets: SharedAsset[] } | null>(null);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<{ connected: Connected[]; signed_in: boolean } | "cancelled" | null>(null);

  const call = useCallback(
    (body: Record<string, unknown>) => supabase.functions.invoke("brand-connect-confirm", { body: { ...body, pending_id: pendingId, state } }),
    [pendingId, state],
  );
  const isGone = (error: unknown) => (error as { context?: { status?: number } })?.context?.status === 410;

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await call({ action: "read" });
    if (isGone(error)) return setGone(true);
    if (error || !data) return setFailed(true);
    setRead(data);
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const { data, error } = await call({ action: "confirm", asset_ids: [...ticked] });
    setBusy(false);
    if (isGone(error)) return setGone(true);
    if (error || !data) return setProblem("Couldn't connect those. Please try again.");
    setDone(data);
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    await call({ action: "cancel" });
    setBusy(false);
    setDone("cancelled");
  };

  if (gone) return <Frame><Say>{FINISHED}</Say></Frame>;
  if (done === "cancelled") return <Frame><Say>Nothing was connected. You can close this page.</Say></Frame>;
  if (done) {
    return (
      <Frame>
        <Say>Connected: {done.connected.map(connectedLabel).join(", ")}. You can close this page.</Say>
        {done.signed_in && <BackToPulse />}
      </Frame>
    );
  }
  if (failed) {
    return (
      <Frame>
        <Say>Couldn't load this page.</Say>
        <Button variant="outline" size="sm" className="mt-4 h-9" onClick={load}>Try again</Button>
      </Frame>
    );
  }
  if (!read) return <Frame><Say>Loading…</Say></Frame>;

  return (
    <Frame>
      <h1 className="text-xl font-medium">Which of these are {read.brand_name}'s?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tick only {read.brand_name}'s accounts. We keep nothing about the others.</p>
      <ul className="mt-4 space-y-2">
        {read.assets.map((asset) => (
          <li key={asset.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-3">
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={ticked.has(asset.id)} onChange={() => toggle(asset.id)} />
              {asset.avatar_url ? <img src={asset.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-secondary" aria-hidden />}
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{asset.name ?? asset.username ?? asset.id}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">{platformLabel(asset.platform)}{asset.username ? ` · @${asset.username}` : ""}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {problem && <p role="alert" className="mt-3 text-[12.5px] text-destructive">{problem}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="h-10 flex-1" onClick={confirm} aria-busy={busy} disabled={ticked.size === 0}>{busy ? "Connecting…" : "Connect selected"}</Button>
        <Button variant="outline" className="h-10" onClick={cancel}>None of these</Button>
      </div>
    </Frame>
  );
}

/** `/connect/brand/:token` opens a link; `/connect/brand/done` is where Facebook sends the person back. */
export default function ConnectBrand() {
  const { token } = useParams();
  const [params] = useSearchParams();
  if (token) return <LinkPage token={token} />;
  const pendingId = params.get("p");
  const state = params.get("s");
  if (pendingId && state) return <ChoosePage pendingId={pendingId} state={state} />;
  const link = params.get("link");
  return (
    <Frame>
      <Say>{ERRORS[params.get("reason") ?? ""] ?? "Something went wrong. Please try again."}</Say>
      {link ? (
        <Button asChild variant="outline" size="sm" className="mt-4 h-9"><Link to={`/connect/brand/${link}`}>Try again</Link></Button>
      ) : (
        <BackToPulse />
      )}
    </Frame>
  );
}
