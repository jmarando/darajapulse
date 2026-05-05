import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AppShell from "./components/AppShell";
import Overview from "./pages/app/Overview";
import Clients from "./pages/app/Clients";
import Campaigns from "./pages/app/Campaigns";
import CampaignDetail from "./pages/app/CampaignDetail";
import Influencers from "./pages/app/Influencers";
import Stub from "./pages/app/Stub";
import PublicReport from "./pages/PublicReport";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/r/:token" element={<PublicReport />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="clients" element={<Clients />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/:id" element={<CampaignDetail />} />
              <Route path="influencers" element={<Influencers />} />
              <Route path="briefs" element={<Stub title="Brief builder" body="Templated objectives, do's & don'ts, deliverables, hashtags, mandatory @mentions, and e-signed influencer agreements with WHT awareness." />} />
              <Route path="approvals" element={<Stub title="Approvals" body="Two-round content approvals with versioning and threaded comments per asset. Ships in v0.2." />} />
              <Route path="payouts" element={<Stub title="Payouts" body="M-Pesa B2C disbursements via Daraja API with WHT computation and e-TIMS-ready records. Ships in v0.2." />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
