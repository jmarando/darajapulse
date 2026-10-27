import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import { applyPageMeta, metaForPath } from "@/lib/seo";
import PageFallback from "@/components/PageFallback";
// The homepage ships in the main bundle; every other page loads on demand.
import LandingDashboard from "./pages/landings/LandingDashboard";

const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AppShell = lazy(() => import("./components/AppShell"));
const Overview = lazy(() => import("./pages/app/Overview"));
const Clients = lazy(() => import("./pages/app/Clients"));
const Campaigns = lazy(() => import("./pages/app/Campaigns"));
const CampaignDetail = lazy(() => import("./pages/app/CampaignDetail"));
const ContestsList = lazy(() => import("./pages/app/ContestsList"));
const ContestDetail = lazy(() => import("./pages/app/ContestDetail"));
const PublicContestReport = lazy(() => import("./pages/PublicContestReport"));
const Influencers = lazy(() => import("./pages/app/Influencers"));
const Discovery = lazy(() => import("./pages/app/Discovery"));
const Inbox = lazy(() => import("./pages/app/Inbox"));
const Rsvps = lazy(() => import("./pages/app/Rsvps"));
const Briefs = lazy(() => import("./pages/app/Briefs"));
const Approvals = lazy(() => import("./pages/app/Approvals"));
const Reports = lazy(() => import("./pages/app/Reports"));
const Moderation = lazy(() => import("./pages/app/Moderation"));
const Listening = lazy(() => import("./pages/app/Listening"));
const Team = lazy(() => import("./pages/app/Team"));
const AdminBilling = lazy(() => import("./pages/app/AdminBilling"));
const Admin = lazy(() => import("./pages/app/Admin"));
const PublicModeration = lazy(() => import("./pages/PublicModeration"));
const PublicReport = lazy(() => import("./pages/PublicReport"));
const PublicPayments = lazy(() => import("./pages/PublicPayments"));
const PublicPlan = lazy(() => import("./pages/PublicPlan"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const PublicBrief = lazy(() => import("./pages/PublicBrief"));
const PublicContestSubmit = lazy(() => import("./pages/PublicContestSubmit"));
const PublicDraftReview = lazy(() => import("./pages/PublicDraftReview"));
const ConnectTikTok = lazy(() => import("./pages/ConnectTikTok"));
const ConnectInstagram = lazy(() => import("./pages/ConnectInstagram"));
const ConnectYouTube = lazy(() => import("./pages/ConnectYouTube"));
const ConnectTwitter = lazy(() => import("./pages/ConnectTwitter"));
const ConnectFacebook = lazy(() => import("./pages/ConnectFacebook"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const LandingPicker = lazy(() => import("./pages/landings/LandingPicker"));
const LandingEditorial = lazy(() => import("./pages/landings/LandingEditorial"));
const LandingCinematic = lazy(() => import("./pages/landings/LandingCinematic"));
const LandingBento = lazy(() => import("./pages/landings/LandingBento"));
const PortalShell = lazy(() => import("./components/PortalShell"));
const PortalOverview = lazy(() => import("./pages/portal/PortalOverview"));
const PortalCampaign = lazy(() => import("./pages/portal/PortalCampaign"));
const PortalListening = lazy(() => import("./pages/portal/PortalListening"));
const PublicStorefront = lazy(() => import("./pages/PublicStorefront"));
const PublicInvoice = lazy(() => import("./pages/PublicInvoice"));
const PayInvoice = lazy(() => import("./pages/PayInvoice"));
const Inventory = lazy(() => import("./pages/app/Inventory"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const PublicDiscovery = lazy(() => import("./pages/public/PublicDiscovery"));

initAnalytics();

// Title, description, canonical and robots per route. Runs before PageViewTracker
// so analytics records the new page title.
const RouteMeta = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    applyPageMeta(metaForPath(pathname));
  }, [pathname]);
  return null;
};

const PageViewTracker = () => {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteMeta />
        <PageViewTracker />
        <AuthProvider><TenantProvider>
          <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<LandingDashboard />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/landing" element={<LandingPicker />} />
            <Route path="/landing/editorial" element={<LandingEditorial />} />
            <Route path="/landing/cinematic" element={<LandingCinematic />} />
            <Route path="/landing/dashboard" element={<LandingDashboard />} />
            <Route path="/landing/bento" element={<LandingBento />} />
            <Route path="/discovery" element={<PublicDiscovery />} />
            <Route path="/r/:token" element={<PublicReport />} />
            <Route path="/payments/:token" element={<PublicPayments />} />
            <Route path="/rc/:token" element={<PublicContestReport />} />
            <Route path="/p/:token" element={<PublicPlan />} />
            <Route path="/:clientSlug/:campaignSlug/plan/:token" element={<PublicPlan />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route path="/b/:token" element={<PublicBrief />} />
            <Route path="/brief/:token" element={<PublicBrief />} />
            <Route path="/c/:token" element={<PublicContestSubmit />} />
            <Route path="/submit/:token" element={<PublicContestSubmit />} />
            <Route path="/m/:token" element={<PublicModeration />} />
            <Route path="/d/:token" element={<PublicDraftReview />} />
            <Route path="/:clientSlug/:campaignSlug/report/:token" element={<PublicReport />} />
            <Route path="/:clientSlug/:campaignSlug/brief/:token" element={<PublicBrief />} />
            <Route path="/connect/tiktok/:influencerId" element={<ConnectTikTok />} />
            <Route path="/connect/tiktok/done" element={<ConnectTikTok />} />
            <Route path="/connect/instagram/:influencerId" element={<ConnectInstagram />} />
            <Route path="/connect/instagram/done" element={<ConnectInstagram />} />
            <Route path="/connect/youtube/:influencerId" element={<ConnectYouTube />} />
            <Route path="/connect/youtube/done" element={<ConnectYouTube />} />
            <Route path="/connect/twitter/:influencerId" element={<ConnectTwitter />} />
            <Route path="/connect/twitter/done" element={<ConnectTwitter />} />
            <Route path="/connect/facebook/:influencerId" element={<ConnectFacebook />} />
            <Route path="/connect/facebook/done" element={<ConnectFacebook />} />
            <Route path="/shop/:agencySlug" element={<PublicStorefront />} />
            <Route path="/invoice/:token" element={<PublicInvoice />} />
            <Route path="/pay/:token" element={<PayInvoice />} />
            <Route path="/portal" element={<PortalShell />}>
              <Route index element={<PortalOverview />} />
              <Route path="campaigns" element={<PortalOverview />} />
              <Route path="campaigns/:id" element={<PortalCampaign />} />
              <Route path="listening" element={<PortalListening />} />
            </Route>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="clients" element={<Clients />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/:id" element={<CampaignDetail />} />
              <Route path="contests" element={<ContestsList />} />
              <Route path="contests/:id" element={<ContestDetail />} />
              <Route path="influencers" element={<Influencers />} />
              <Route path="discovery" element={<Discovery />} />
              <Route path="briefs" element={<Briefs />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="rsvps" element={<Rsvps />} />
              {/* The content calendar was never used; drafts are reviewed in Approvals. */}
              <Route path="content" element={<Navigate to="/app/approvals" replace />} />
              <Route path="reports" element={<Reports />} />
              <Route path="moderation" element={<Moderation />} />
              <Route path="listening" element={<Listening />} />
              <Route path="team" element={<Team />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="admin" element={<Admin />} />
              <Route path="admin/billing" element={<AdminBilling />} />
              <Route path="approvals" element={<Approvals />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </TenantProvider></AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
