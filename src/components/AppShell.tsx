import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Users, Megaphone, Building2, FileSignature, CheckSquare, Wallet, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-pulse-mark.png";

const nav = [
  { to: "/app", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/app/clients", icon: Building2, label: "Clients" },
  { to: "/app/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/app/influencers", icon: Users, label: "Influencers" },
  { to: "/app/briefs", icon: FileSignature, label: "Briefs" },
  { to: "/app/approvals", icon: CheckSquare, label: "Approvals" },
  { to: "/app/payouts", icon: Wallet, label: "Payouts" },
];

const AppShell = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { navigate("/auth"); return null; }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-6 border-b border-sidebar-border bg-white">
          <img src={logo} alt="Daraja Pulse — Influencer Intelligence" className="h-12 w-auto mx-auto" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end as any}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50'}`}>
              <Icon className="w-4 h-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
