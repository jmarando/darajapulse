import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TenantKind = "agency" | "media_house" | "brand";
export type TenantInfo = {
  kind: "agency" | "brand_org";
  /** Business model of the workspace: traditional agency, media house, or direct brand/client. */
  agency_kind?: TenantKind | null;
  id: string;
  name: string;
  slug: string;
  display_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  support_email?: string | null;
  hide_powered_by?: boolean | null;
  is_suspended?: boolean | null;
  suspension_reason?: string | null;
};

/** Copy variants based on the workspace kind. Use in UI to swap "agency" wording. */
export function tenantCopy(kind?: TenantKind | null) {
  const k = kind ?? "agency";
  if (k === "brand") {
    return {
      orgWord: "brand",
      teamLabel: "Team",
      teamSubtitle: "Invite your team and manage roles. Public signup is disabled — accounts are invite-only.",
      invitePlaceholder: "teammate@yourbrand.com",
      adminRole: "Brand admin",
    };
  }
  if (k === "media_house") {
    return {
      orgWord: "media house",
      teamLabel: "Team",
      teamSubtitle: "Invite your media house staff and manage roles. Public signup is disabled — accounts are invite-only.",
      invitePlaceholder: "teammate@mediahouse.com",
      adminRole: "Media house admin",
    };
  }
  return {
    orgWord: "agency",
    teamLabel: "Team",
    teamSubtitle: "Invite agency staff and manage roles. Public signup is disabled — accounts are invite-only.",
    invitePlaceholder: "teammate@agency.com",
    adminRole: "Agency admin",
  };
}

// Hostnames where tenant-scoping is NOT enforced (root marketing, dev, previews).
const ROOT_LABELS = new Set(["www", "app", "darajapulse", "localhost"]);

function getSubdomainLabel(hostname: string): string | null {
  const host = hostname.split(":")[0];
  if (!host) return null;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovable.dev")) return null;
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null;
  const label = parts[0].toLowerCase();
  if (ROOT_LABELS.has(label)) return null;
  return label;
}

// Convert any CSS color (hex/rgb/named) into an HSL triplet "H S% L%" for our CSS vars.
function toHslTriplet(input: string): string | null {
  if (!input) return null;
  const el = document.createElement("div");
  el.style.color = input;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  let r = +m[1] / 255, g = +m[2] / 255, b = +m[3] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

type Ctx = { tenant: TenantInfo | null; loading: boolean; scoped: boolean };
const TenantCtx = createContext<Ctx>({ tenant: null, loading: false, scoped: false });

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoped, setScoped] = useState(false);

  useEffect(() => {
    const sub = getSubdomainLabel(window.location.hostname);
    if (!sub) { setScoped(false); setTenant(null); setLoading(false); return; }
    setScoped(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_tenant_by_host", { _host: window.location.hostname });
      if (!error && data && typeof data === "object") setTenant(data as unknown as TenantInfo);
      setLoading(false);
    })();
  }, []);

  // Apply tenant branding: page title, favicon, accent color.
  useEffect(() => {
    if (!tenant) return;
    const label = tenant.display_name || tenant.name;
    if (label) document.title = label;
    if (tenant.logo_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = tenant.logo_url;
    }
    if (tenant.primary_color) {
      const hsl = toHslTriplet(tenant.primary_color);
      if (hsl) {
        const root = document.documentElement;
        root.style.setProperty("--accent", hsl);
        root.style.setProperty("--ring", hsl);
        root.style.setProperty("--sidebar-primary", hsl);
        root.style.setProperty("--sidebar-ring", hsl);
        root.style.setProperty("--gradient-warm", `linear-gradient(135deg, hsl(${hsl}), hsl(${hsl} / 0.8))`);
      }
    }
  }, [tenant]);

  return <TenantCtx.Provider value={{ tenant, loading, scoped }}>{children}</TenantCtx.Provider>;
};

export function useTenant() { return useContext(TenantCtx); }
