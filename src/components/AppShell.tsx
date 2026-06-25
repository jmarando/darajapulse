import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, Megaphone, Building2, FileSignature, CheckSquare, Wallet, LogOut, Calendar, MessageSquare, UserCog, Menu, Search, Bell, Sparkles, Trophy, Compass, Shield, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import logo from "@/assets/logo-pulse-mark.png";

const navGroups: { label?: string; items: { to: string; icon: any; label: string; end?: boolean }[] }[] = [
  {
    items: [
      { to: "/app", icon: LayoutDashboard, label: "Overview", end: true },
    ],
  },
  {
    label: "Campaign Management",
    items: [
      { to: "/app/campaigns", icon: Megaphone, label: "Campaigns" },
      { to: "/app/contests", icon: Trophy, label: "Contests" },
      { to: "/app/briefs", icon: FileSignature, label: "Briefs" },
      { to: "/app/content", icon: Calendar, label: "Content" },
      { to: "/app/approvals", icon: CheckSquare, label: "Approvals" },
      { to: "/app/moderation", icon: MessageSquare, label: "Moderation" },
    ],
  },
  {
    label: "Roster",
    items: [
      { to: "/app/clients", icon: Building2, label: "Clients" },
      { to: "/app/influencers", icon: Users, label: "Influencers" },
      { to: "/app/discovery", icon: Compass, label: "Discovery" },
    ],
  },
  {
    label: "Media house",
    items: [
      { to: "/app/inventory", icon: Store, label: "Storefront" },
    ],
  },
];

const SidebarBody = ({ user, isAdmin, isSuper, onSignOut, onNavigate }: any) => (
  <>
    <div className="px-5 py-5 border-b border-sidebar-border bg-white flex items-center gap-3">
      <img src={logo} alt="Daraja Pulse" className="h-10 w-auto" />
      <div className="leading-tight">
        <div className="font-display text-base font-semibold text-primary">DarajaPulse</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Influencer OS</div>
      </div>
    </div>
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navGroups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "pt-3 mt-3 border-t border-sidebar-border/60" : ""}>
          {group.label && (
            <div className="px-3 pb-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
              {group.label}
            </div>
          )}
          {group.items.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end as any} onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-accent/15 text-accent font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
              <Icon className="w-4 h-4" /> {label}
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
      <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
      <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={onSignOut}>
        <LogOut className="w-4 h-4 mr-2" /> Sign out
      </Button>
    </div>
  </>
);

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
  const isAdmin = roles.includes("agency_admin");
  const isSuper = roles.includes("super_admin" as any);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { navigate("/auth"); return null; }
  if (!isAgency && isClient) { navigate("/portal"); return null; }

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border">
        <SidebarBody user={user} isAdmin={isAdmin} isSuper={isSuper} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile sheet sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground flex flex-col [&>button]:text-sidebar-foreground">
          <SidebarBody user={user} isAdmin={isAdmin} isSuper={isSuper} onSignOut={handleSignOut} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 border-b border-border bg-background px-4 py-2 sticky top-0 z-30">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
          </Sheet>
          <img src={logo} alt="Daraja Pulse" className="h-8 w-auto" />
        </header>
        <TopBar user={user} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
