import { ReactNode } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/**
 * Restricts access when the app is loaded under a tenant-scoped subdomain
 * (e.g. pakakumi.darajapulse.com). Super admins always pass. Other users
 * must have a role scoped to that tenant's agency_id or brand_org_id.
 */
const TenantGuard = ({ children }: { children: ReactNode }) => {
  const { tenant, loading, scoped } = useTenant();
  const { user, roles, agencyIds, brandOrgIds, isSuperAdmin } = useAuth() as any;

  if (!scoped) return <>{children}</>;
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading workspace…</div>;

  if (!tenant) {
    return (
      <Blocked title="Workspace not found"
        body="This subdomain isn't connected to an active Daraja Pulse workspace. Please check the URL or contact your administrator." />
    );
  }

  if (!user) return <>{children}</>; // let auth flow handle sign-in; guard re-runs after

  // Payment suspension applies to all users (including admins of that org). Super admins pass.
  if (tenant.is_suspended && !isSuperAdmin) {
    return (
      <Blocked
        title={`${tenant.display_name || tenant.name} is suspended for non-payment`}
        body={`Your workspace has an invoice more than 14 days overdue. Access is temporarily paused. Please settle the outstanding invoice — access is restored automatically once payment is received. Contact billing@darajapulse.com if you have already paid.`}
        showSignOut
      />
    );
  }

  if (isSuperAdmin) return <>{children}</>;

  const allowed =
    (tenant.kind === "agency" && (agencyIds ?? []).includes(tenant.id)) ||
    (tenant.kind === "brand_org" && (brandOrgIds ?? []).includes(tenant.id));

  if (!allowed) {
    return (
      <Blocked
        title={`No access to ${tenant.display_name || tenant.name}`}
        body={`Your account isn't a member of this workspace. Sign in with an account that belongs to ${tenant.display_name || tenant.name}, or contact your administrator for access.`}
        showSignOut
      />
    );
  }

  return <>{children}</>;
};

function Blocked({ title, body, showSignOut }: { title: string; body: string; showSignOut?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
        {showSignOut && (
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}

export default TenantGuard;
