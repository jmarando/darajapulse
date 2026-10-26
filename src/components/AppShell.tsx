import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, Megaphone, Building2, FileSignature, CheckSquare, Wallet, LogOut, MessageSquare, UserCog, Menu, Search, Bell, Sparkles, Compass, Shield, Store, Mail, BarChart3, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Suspense, useEffect, useState } from "react";
import logo from "@/assets/logo-pulse-mark.png";
import TenantGuard from "@/components/TenantGuard";
import PageFallback from "@/components/PageFallback";
import InstallAppButton from "@/components/InstallAppButton";
import { useNavCounts, type NavCounts } from "@/hooks/useNavCounts";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { isRootHost, workspaceRedirect } from "@/lib/appUrl";
import { cn } from "@/lib/utils";

type NavItem = { to: string; icon: any; label: string; end?: boolean; badge?: keyof NavCounts };

// The pages used every day. Contests have their own menu, and the pages used now and
// then (Team, Brief templates, Storefront, Moderation, Super Admin) sit in the account menu.
const navGroups: NavItem[][] = [
  [
    { to: "/app", icon: LayoutDashboard, label: "Overview", end: true },
    { to: "/app/campaigns", icon: Megaphone, label: "Campaigns" },
    { to: "/app/reports", icon: BarChart3, label: "Reports" },
  ],
  [
    { to: "/app/approvals", icon: CheckSquare, label: "Approvals", badge: "pendingDrafts" },
    { to: "/app/inbox", icon: Mail, label: "Inbox", badge: "unreadThreads" },
  ],
  [
    { to: "/app/influencers", icon: Users, label: "Creators" },
    { to: "/app/discovery", icon: Compass, label: "Discovery" },
    { to: "/app/clients", icon: Building2, label: "Clients" },
  ],
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-ring",
    isActive
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
  );

const SidebarBody = ({ user, isAdmin, isSuper, counts, onSignOut, onNavigate }: any) => {
  const { tenant } = useTenant();
  const isMediaHouse = tenant?.agency_kind === "media_house";
  const brandLogo = tenant?.logo_url || logo;
  const brandName = tenant?.display_name || tenant?.name || "Daraja Pulse";
  const accountLinks = [
    isAdmin && { to: "/app/team", icon: UserCog, label: "Team" },
    { to: "/app/briefs", icon: FileSignature, label: "Brief templates" },
    // Media houses sell their own inventory; super admins run storefronts for them.
    (isSuper || isMediaHouse) && { to: "/app/inventory", icon: Store, label: "Storefront" },
    { to: "/app/moderation", icon: MessageSquare, label: "Moderation" },
    isSuper && { to: "/app/admin", icon: Shield, label: "Super Admin" },
  ].filter(Boolean) as { to: string; icon: any; label: string }[];
  return (
  <>
    <div className="flex items-center gap-3 px-5 pb-3 pt-5">
      <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-white px-1.5">
        <img src={brandLogo} alt="" className="h-7 w-auto max-w-[96px] object-contain" />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate font-display text-[15px] font-semibold text-sidebar-foreground">{brandName}</div>
        <div className="text-[12px] text-sidebar-foreground/55">{tenant ? "Powered by Daraja Pulse" : "Influencer OS"}</div>
      </div>
    </div>
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
      {navGroups.map((group, gi) => (
        <div key={gi} className="space-y-0.5">
          {group.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink key={to} to={to} end={end} onClick={onNavigate} className={linkClass}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
              {badge && counts?.[badge] > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-accent-foreground">
                  {counts[badge] > 99 ? "99+" : counts[badge]}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
    <div className="border-t border-sidebar-border p-3">
      <InstallAppButton className="mb-1 text-sidebar-foreground hover:bg-sidebar-accent" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[13px] font-semibold uppercase" aria-hidden>
              {(user.email || "?")[0]}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-sidebar-foreground/85">{user.email}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          {accountLinks.map(({ to, icon: Icon, label }) => (
            <DropdownMenuItem key={to} asChild>
              <Link to={to} onClick={onNavigate}><Icon className="mr-2 h-4 w-4" aria-hidden />{label}</Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSignOut}><LogOut className="mr-2 h-4 w-4" aria-hidden />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border lg:sticky lg:top-0 lg:h-screen">
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
