import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, Megaphone, Building2, FileSignature, CheckSquare, LogOut, MessageSquare, UserCog, Menu, Compass, Shield, Store, Mail, BarChart3, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Suspense, useEffect, useState } from "react";
import TenantGuard from "@/components/TenantGuard";
import PageFallback from "@/components/PageFallback";
import InstallAppButton from "@/components/InstallAppButton";
import { useNavCounts, type NavCounts } from "@/hooks/useNavCounts";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { isRootHost, workspaceRedirect } from "@/lib/appUrl";
import { useConsoleTheme } from "@/hooks/useConsoleTheme";
import { BrandMark, NavItem as SideLink } from "@/components/dash/Sidebar";
import { GlobalSearch } from "@/components/dash/GlobalSearch";

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

const roleLabel = (roles: string[]) =>
  roles.includes("super_admin") ? "Super admin" : roles.includes("agency_admin") ? "Admin" : roles.includes("account_manager") ? "Account manager" : "Member";

const SidebarBody = ({ user, displayName, roles, isAdmin, isSuper, counts, onSignOut, onNavigate }: any) => {
  const { tenant } = useTenant();
  const isMediaHouse = tenant?.agency_kind === "media_house";
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
    <div className="space-y-4 px-3 pb-2 pt-4">
      <div className="px-1.5">
        <BrandMark name={brandName} logoUrl={tenant?.logo_url} caption={tenant ? "Powered by Daraja Pulse" : undefined} />
      </div>
      <GlobalSearch pages={[...navGroups.flat(), ...accountLinks]} />
    </div>
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
      {navGroups.map((group, gi) => (
        <div key={gi} className="space-y-0.5">
          {group.map(({ to, icon, label, end, badge }) => (
            <SideLink key={to} to={to} end={end} icon={icon} label={label} count={badge ? counts?.[badge] : undefined} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
    <div className="mx-3 border-t border-sidebar-border py-3">
      <InstallAppButton className="mb-1 text-sidebar-foreground hover:bg-sidebar-accent" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-[13px] font-semibold uppercase text-foreground ring-1 ring-border" aria-hidden>
              {(displayName || user.email || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("")}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13.5px] font-medium text-foreground">{displayName || user.email}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{roleLabel(roles)} · {brandName}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
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

const AppShell = () => {
  useConsoleTheme();
  const { user, loading, signOut, isAgency, isClient, roles } = useAuth();
  const { tenant } = useTenant();
  const isAdmin = roles.includes("agency_admin");
  const isSuper = roles.includes("super_admin" as any);
  const navigate = useNavigate();
  const counts = useNavCounts(!!user && isAgency);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => setDisplayName(data?.full_name ?? ""));
  }, [user]);

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
  const sidebarProps = { user, displayName, roles, isAdmin, isSuper, counts, onSignOut: handleSignOut };

  return (
    <TenantGuard>
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-sidebar text-sidebar-foreground flex-col lg:sticky lg:top-0 lg:h-screen">
        <SidebarBody {...sidebarProps} />
      </aside>

      {/* Mobile sheet sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground flex flex-col [&>button]:text-sidebar-foreground">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="w-full max-w-full flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur sticky top-0 z-30">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Open menu"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
          </Sheet>
          <Link to="/app" className="min-w-0 flex-1"><BrandMark name={tenant?.display_name || tenant?.name || "Daraja Pulse"} logoUrl={tenant?.logo_url} /></Link>
        </header>
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
