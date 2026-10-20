import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, Megaphone, Building2, FileSignature, CheckSquare, Wallet, LogOut, MessageSquare, UserCog, Menu, Search, Bell, Sparkles, Trophy, Compass, Shield, Store, Mail, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Suspense, useEffect, useState } from "react";
import logo from "@/assets/logo-pulse-mark.png";
import TenantGuard from "@/components/TenantGuard";
import PageFallback from "@/components/PageFallback";
import InstallAppButton from "@/components/InstallAppButton";
import { useNavCounts, type NavCounts } from "@/hooks/useNavCounts";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { isRootHost, workspaceRedirect } from "@/lib/appUrl";

type NavItem = { to: string; icon: any; label: string; end?: boolean; badge?: keyof NavCounts; show?: (ctx: { isSuper: boolean; isMediaHouse: boolean }) => boolean };

const navGroups: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: "/app", icon: LayoutDashboard, label: "Overview", end: true },
      { to: "/app/approvals", icon: CheckSquare, label: "Approvals", badge: "pendingDrafts" },
      { to: "/app/inbox", icon: Mail, label: "Inbox", badge: "unreadThreads" },
      { to: "/app/moderation", icon: MessageSquare, label: "Moderation" },
    ],
  },
  {
    label: "Campaigns",
    items: [
      { to: "/app/campaigns", icon: Megaphone, label: "Campaigns" },
      { to: "/app/contests", icon: Trophy, label: "Contests" },
      { to: "/app/reports", icon: BarChart3, label: "Reports" },
    ],
  },
  {
    label: "Roster",
    items: [
      { to: "/app/influencers", icon: Users, label: "Creators" },
      { to: "/app/discovery", icon: Compass, label: "Discovery" },
      { to: "/app/clients", icon: Building2, label: "Clients" },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/app/briefs", icon: FileSignature, label: "Brief templates" },
      // Media houses sell their own inventory; super admins run storefronts for them.
      { to: "/app/inventory", icon: Store, label: "Storefront", show: ({ isSuper, isMediaHouse }) => isSuper || isMediaHouse },
    ],
  },
];

const SidebarBody = ({ user, isAdmin, isSuper, counts, onSignOut, onNavigate }: any) => {
  const { tenant } = useTenant();
  const isMediaHouse = tenant?.agency_kind === "media_house";
  const brandLogo = tenant?.logo_url || logo;
  const brandName = tenant?.display_name || tenant?.name || "Daraja Pulse";
  return (
  <>
    <div className="px-5 py-5 border-b border-sidebar-border bg-white flex items-center gap-3">
      <img src={brandLogo} alt={brandName} className="h-10 w-auto object-contain" />
      <div className="leading-tight">
        <div className="font-display text-base font-semibold text-primary">{brandName}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{tenant ? "Powered by Daraja Pulse" : "Influencer OS"}</div>
      </div>
    </div>
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navGroups.map((group, gi) => ({ ...group, items: group.items.filter((item) => !item.show || item.show({ isSuper, isMediaHouse })) })).filter((group) => group.items.length).map((group, gi) => (
        <div key={gi} className={gi > 0 ? "pt-3 mt-3 border-t border-sidebar-border/60" : ""}>
          {group.label && (
            <div className="px-3 pb-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
              {group.label}
            </div>
          )}
          {group.items.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink key={to} to={to} end={end as any} onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-accent/15 text-accent font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
              <Icon className="w-4 h-4" /> {label}
              {badge && counts?.[badge] > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-accent-foreground">
                  {counts[badge] > 99 ? "99+" : counts[badge]}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
      {isAdmin && (
        <NavLink to="/app/team" onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-accent/15 text-accent font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
          <UserCog className="w-4 h-4" /> Team
        </NavLink>
      )}
      {isSuper && (
        <NavLink to="/app/admin" onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-accent/15 text-accent font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
          <Shield className="w-4 h-4" /> Super Admin
        </NavLink>
      )}
    </nav>
    <div className="p-3 border-t border-sidebar-border">
      <InstallAppButton className="text-sidebar-foreground hover:bg-sidebar-accent" />
      <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
      <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={onSignOut}>
        <LogOut className="w-4 h-4 mr-2" /> Sign out
      </Button>
    </div>
  </>
  );
};

const TopBar = ({ user }: any) => {
  const initial = (user.email || "?")[0].toUpperCase();
  return (
    <header className="hidden lg:flex items-center gap-4 px-8 h-16 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-20">
      <div className="flex-1" />
      <div className="ml-auto flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full"><Bell className="w-4 h-4" /></Button>
        <div className="h-10 w-10 rounded-full bg-gradient-warm text-accent-foreground flex items-center justify-center font-semibold text-sm shadow-soft">
          {initial}
        </div>
      </div>
    </header>
  );
};

const AppShell = () => {
  const { user, loading, signOut, isAgency, isClient, roles } = useAuth();
  const { tenant } = useTenant();
  const isAdmin = roles.includes("agency_admin");
  const isSuper = roles.includes("super_admin" as any);
  const navigate = useNavigate();
  const counts = useNavCounts(!!user && isAgency);
  const [mobileOpen, setMobileOpen] = useState(false);

  // On the root domain, send tenant workspace members to their own subdomain.
  useEffect(() => {
    if (loading || !user || !isRootHost()) return;
    let cancelled = false;
    (async () => {
      const url = await workspaceRedirect((fn) => supabase.rpc(fn as any) as any, window.location.pathname);
      if (!cancelled && url) window.location.href = url;
    })();
    return () => { cancelled = true; };
  }, [loading, user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { navigate("/auth"); return null; }
  if (!isAgency && isClient) { navigate("/portal"); return null; }

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  return (
    <TenantGuard>
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border">
        <SidebarBody user={user} isAdmin={isAdmin} isSuper={isSuper} counts={counts} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile sheet sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground flex flex-col [&>button]:text-sidebar-foreground">
          <SidebarBody user={user} isAdmin={isAdmin} isSuper={isSuper} counts={counts} onSignOut={handleSignOut} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="w-full max-w-full flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 border-b border-border bg-background px-4 py-2 sticky top-0 z-30">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
          </Sheet>
          <img src={tenant?.logo_url || logo} alt={tenant?.display_name || tenant?.name || "Daraja Pulse"} className="h-8 w-auto" />
        </header>
        <TopBar user={user} />
        <main className="min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden">
          {/* Pages load on demand; keep the shell on screen meanwhile. */}
          <Suspense fallback={<PageFallback fullScreen={false} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
    </TenantGuard>
  );
};

export default AppShell;
