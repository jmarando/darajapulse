import { Link, Outlet, useNavigate } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Megaphone, HelpCircle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import GettingStartedDialog from "@/components/GettingStartedDialog";
import TenantGuard from "@/components/TenantGuard";
import PageFallback from "@/components/PageFallback";
import InstallAppButton from "@/components/InstallAppButton";
import { useTenant } from "@/hooks/useTenant";
import { useConsoleTheme } from "@/hooks/useConsoleTheme";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark, NavItem, UserCard } from "@/components/dash/Sidebar";

const nav = [
  { to: "/portal", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/portal/campaigns", icon: Megaphone, label: "Campaigns" },
];

const PortalShell = () => {
  useConsoleTheme();
  const { user, loading, signOut, isClient, isAgency } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [tourOpen, setTourOpen] = useState<boolean | undefined>(undefined);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const brandName = tenant?.display_name || tenant?.name || "Daraja Pulse";

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => setDisplayName(data?.full_name ?? ""));
  }, [user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { navigate("/auth"); return null; }
  if (isAgency && !isClient) { navigate("/app"); return null; }

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  const body = (onNavigate?: () => void) => (
    <div className="flex h-full min-h-0 flex-col px-3 py-4">
      <div className="px-1.5 pb-5">
        <BrandMark name={brandName} logoUrl={tenant?.logo_url} caption="Brand portal" />
      </div>
      <nav aria-label="Main" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {nav.map((n) => <NavItem key={n.to} {...n} onNavigate={onNavigate} />)}
      </nav>
      <div className="mt-3 space-y-1 border-t border-sidebar-border pt-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => { onNavigate?.(); setTourOpen(true); }}>
          <HelpCircle className="w-4 h-4 mr-2" /> Getting started
        </Button>
        <InstallAppButton className="text-sidebar-foreground hover:bg-sidebar-accent" />
        <UserCard name={displayName || user.email || "Signed in"} detail={`Client · ${brandName}`} email={user.email} onSignOut={handleSignOut} />
      </div>
    </div>
  );

  return (
    <TenantGuard>
    <div className="min-h-screen flex bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-sidebar text-sidebar-foreground lg:block">
        {body()}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {body(() => setMobileOpen(false))}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Open menu"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
          </Sheet>
          <Link to="/portal" className="min-w-0 flex-1"><BrandMark name={brandName} logoUrl={tenant?.logo_url} /></Link>
        </header>
        <main className="min-w-0 flex-1">
          <Suspense fallback={<PageFallback fullScreen={false} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <GettingStartedDialog open={tourOpen} onOpenChange={setTourOpen} />
    </div>
    </TenantGuard>
  );
};
export default PortalShell;
