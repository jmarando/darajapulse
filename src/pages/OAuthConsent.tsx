import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import logo from "@/assets/logo-pulse-mark.png";

// Local typing for the beta supabase.auth.oauth namespace.
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

function oauthNs(): OAuthNs | null {
  const ns = (supabase.auth as any).oauth;
  return ns ?? null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const ns = oauthNs();
      if (!ns) return setError("OAuth is not available on this Supabase client. Please update the client.");
      const { data, error } = await ns.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const ns = oauthNs();
    if (!ns) return;
    setBusy(true);
    const { data, error } = approve
      ? await ns.approveAuthorization(authorizationId)
      : await ns.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect returned by the authorization server.");
    }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen bg-gradient-paper flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="Daraja Pulse" className="h-20 w-auto mx-auto mb-4" />
        </div>
        <Card className="p-6 shadow-elegant space-y-4">
          {error ? (
            <>
              <h1 className="font-display text-xl font-semibold">Couldn't load this request</h1>
              <p className="text-muted-foreground text-sm">{error}</p>
            </>
          ) : !details ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold">
                Connect {details.client?.name ?? details.client?.client_name ?? "this app"} to your Daraja Pulse account?
              </h1>
              <p className="text-sm text-muted-foreground">
                It will be able to read your workspace data (clients, campaigns, influencers) using your permissions. You can disconnect at any time from the connected app.
              </p>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  Approve
                </Button>
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                  Deny
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
