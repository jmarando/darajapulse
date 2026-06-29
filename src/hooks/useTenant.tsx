import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TenantInfo = {
  kind: "agency" | "brand_org";
  id: string;
  name: string;
  slug: string;
  display_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  support_email?: string | null;
  hide_powered_by?: boolean | null;
};

// Hostnames where tenant-scoping is NOT enforced (root marketing, dev, previews).
const ROOT_LABELS = new Set(["www", "app", "darajapulse", "localhost"]);

function getSubdomainLabel(hostname: string): string | null {
  // Strip port
  const host = hostname.split(":")[0];
  if (!host) return null;
  // Lovable preview hosts (e.g. id-preview--xxx.lovable.app) — never scoped
  if (host.endsWith(".lovable.app") || host.endsWith(".lovable.dev")) return null;
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null; // apex like darajapulse.com
  const label = parts[0].toLowerCase();
  if (ROOT_LABELS.has(label)) return null;
  return label;
}

export function useTenant() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoped, setScoped] = useState(false); // true when hostname is a tenant subdomain

  useEffect(() => {
    const sub = getSubdomainLabel(window.location.hostname);
    if (!sub) {
      setScoped(false);
      setTenant(null);
      setLoading(false);
      return;
    }
    setScoped(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_tenant_by_host", { _host: window.location.hostname });
      if (!error && data && typeof data === "object") {
        setTenant(data as unknown as TenantInfo);
      }
      setLoading(false);
    })();
  }, []);

  return { tenant, loading, scoped };
}
