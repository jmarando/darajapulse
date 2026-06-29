import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Megaphone, LogOut, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-pulse-mark.png";
import GettingStartedDialog from "@/components/GettingStartedDialog";
import TenantGuard from "@/components/TenantGuard";

const nav = [
  { to: "/portal", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/portal/campaigns", icon: Megaphone, label: "Campaigns" },
];

const PortalShell = () => {
  const { user, loading, signOut, isClient, isAgency } = useAuth();
  const navigate = useNavigate();
  const [tourOpen, setTourOpen] = useState<boolean | undefined>(undefined);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { navigate("/auth"); return null; }
  if (isAgency && !isClient) { navigate("/app"); return null; }

  return (
  return (
    <TenantGuard>
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-6 border-b border-sidebar-border bg-white">
          <img src={logo} alt="Daraja Pulse" className="h-20 w-auto mx-auto" />
        </div>
        <div className="px-4 pt-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Brand portal</div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end as any}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50'}`}>
              <Icon className="w-4 h-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setTourOpen(true)}>
            <HelpCircle className="w-4 h-4 mr-2" /> Getting started
          </Button>
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <GettingStartedDialog open={tourOpen} onOpenChange={setTourOpen} />
    </div>
  );
};
export default PortalShell;
