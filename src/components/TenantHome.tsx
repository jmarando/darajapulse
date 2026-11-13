import { lazy } from "react";
import { useTenant } from "@/hooks/useTenant";
import PageFallback from "@/components/PageFallback";
import LandingDashboard from "@/pages/landings/LandingDashboard";

const PublicStorefront = lazy(() => import("@/pages/PublicStorefront"));

/**
 * The front page. On a media house's own subdomain (radioafrica.darajapulse.com) it is that house's storefront, so
 * the address they hand to agencies opens straight onto what they sell. Everywhere else it is Daraja Pulse's homepage.
 */
export default function TenantHome() {
  const { tenant, loading, scoped } = useTenant();
  if (scoped && loading) return <PageFallback />;
  if (scoped && tenant?.agency_kind === "media_house" && tenant.slug) return <PublicStorefront slug={tenant.slug} />;
  return <LandingDashboard />;
}
