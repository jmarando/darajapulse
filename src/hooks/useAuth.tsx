import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "super_admin" | "agency_admin" | "account_manager" | "client_user" | "client_viewer" | "brand_owner" | "brand_viewer" | "influencer";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: Role[];
  agencyIds: string[];
  loading: boolean;
  isAgency: boolean;
  isClient: boolean;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, roles: [], agencyIds: [], loading: true, isAgency: false, isClient: false, isSuperAdmin: false, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [agencyIds, setAgencyIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role, agency_id").eq("user_id", s.user.id);
          setRoles((data ?? []).map((r: any) => r.role));
          setAgencyIds(Array.from(new Set((data ?? []).map((r: any) => r.agency_id).filter(Boolean))));
        }, 0);
      } else {
        setRoles([]);
        setAgencyIds([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        const { data: r } = await supabase.from("user_roles").select("role, agency_id").eq("user_id", data.session.user.id);
        setRoles((r ?? []).map((x: any) => x.role));
        setAgencyIds(Array.from(new Set((r ?? []).map((x: any) => x.agency_id).filter(Boolean))));
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const isAgency = roles.includes("agency_admin") || roles.includes("account_manager");
  const isClient = roles.includes("client_user");
  const isSuperAdmin = roles.includes("super_admin");

  return (
    <Ctx.Provider value={{ user, session, roles, agencyIds, loading, isAgency, isClient, isSuperAdmin, signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
