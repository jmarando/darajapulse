import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AppShell from "./components/AppShell";
import Overview from "./pages/app/Overview";
import Clients from "./pages/app/Clients";
import Campaigns from "./pages/app/Campaigns";
import CampaignDetail from "./pages/app/CampaignDetail";
import ContestsList from "./pages/app/ContestsList";
import ContestDetail from "./pages/app/ContestDetail";
import PublicContestReport from "./pages/PublicContestReport";
import Influencers from "./pages/app/Influencers";
import Discovery from "./pages/app/Discovery";
import Inbox from "./pages/app/Inbox";
import Stub from "./pages/app/Stub";
import Briefs from "./pages/app/Briefs";
import Content from "./pages/app/Content";
import Moderation from "./pages/app/Moderation";
import Team from "./pages/app/Team";
import AdminBilling from "./pages/app/AdminBilling";
import Admin from "./pages/app/Admin";
import PublicModeration from "./pages/PublicModeration";
import PublicReport from "./pages/PublicReport";
import PublicPlan from "./pages/PublicPlan";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import PublicBrief from "./pages/PublicBrief";
import PublicContestSubmit from "./pages/PublicContestSubmit";
import PublicDraftReview from "./pages/PublicDraftReview";
import ConnectTikTok from "./pages/ConnectTikTok";
import ConnectInstagram from "./pages/ConnectInstagram";
import ConnectYouTube from "./pages/ConnectYouTube";
import ConnectTwitter from "./pages/ConnectTwitter";
import ConnectFacebook from "./pages/ConnectFacebook";
import NotFound from "./pages/NotFound.tsx";
import Unsubscribe from "./pages/Unsubscribe";
import DataDeletion from "./pages/DataDeletion";
import LandingPicker from "./pages/landings/LandingPicker";
import LandingEditorial from "./pages/landings/LandingEditorial";
import LandingCinematic from "./pages/landings/LandingCinematic";
import LandingDashboard from "./pages/landings/LandingDashboard";
import LandingBento from "./pages/landings/LandingBento";
import PortalShell from "./components/PortalShell";
import PortalOverview from "./pages/portal/PortalOverview";
import PortalCampaign from "./pages/portal/PortalCampaign";
import PublicStorefront from "./pages/PublicStorefront";
import PublicInvoice from "./pages/PublicInvoice";
import PayInvoice from "./pages/PayInvoice";
import Inventory from "./pages/app/Inventory";
import OAuthConsent from "./pages/OAuthConsent";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider><TenantProvider>
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
            <Route path="/r/:token" element={<PublicReport />} />
            <Route path="/rc/:token" element={<PublicContestReport />} />
            <Route path="/p/:token" element={<PublicPlan />} />
            <Route path="/:clientSlug/:campaignSlug/plan/:token" element={<PublicPlan />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route path="/b/:token" element={<PublicBrief />} />
            <Route path="/c/:token" element={<PublicContestSubmit />} />
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
              <Route path="content" element={<Content />} />
              <Route path="moderation" element={<Moderation />} />
              <Route path="team" element={<Team />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="admin" element={<Admin />} />
              <Route path="admin/billing" element={<AdminBilling />} />
              <Route path="approvals" element={<Stub title="Approvals" body="Two-round content approvals with versioning and threaded comments per asset. Ships in v0.2." />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TenantProvider></AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
