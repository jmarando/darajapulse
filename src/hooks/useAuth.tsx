import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "agency_admin" | "account_manager" | "client_user" | "client_viewer" | "influencer";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: Role[];
  loading: boolean;
  isAgency: boolean;
  isClient: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, roles: [], loading: true, isAgency: false, isClient: false, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
          setRoles((data ?? []).map((r: any) => r.role));
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
        setRoles((r ?? []).map((x: any) => x.role));
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const isAgency = roles.includes("agency_admin") || roles.includes("account_manager");
  const isClient = roles.includes("client_user");

  return (
    <Ctx.Provider value={{ user, session, roles, loading, isAgency, isClient, signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
