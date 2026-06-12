import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Circle, Building2, Megaphone, Users, X, Sparkles } from "lucide-react";

const DISMISS_KEY = "onboarding_dismissed_v1";

interface Step {
  id: string;
  title: string;
  body: string;
  done: boolean;
  icon: any;
  to: string;
  cta: string;
}

const OnboardingChecklist = () => {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [agencyName, setAgencyName] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY)) {
      setDismissed(true);
      return;
    }
    (async () => {
      const { data: ag } = await (supabase.from("agencies") as any).select("name,logo_url").limit(1).maybeSingle();
      const hasLogo = !!ag?.logo_url;
      setAgencyName(ag?.name ?? "");
      const { count: clientCount } = await (supabase.from("clients") as any).select("id", { count: "exact", head: true });
      const { count: campaignCount } = await (supabase.from("campaigns") as any).select("id", { count: "exact", head: true });
      const { count: teamCount } = await (supabase.from("user_roles") as any).select("user_id", { count: "exact", head: true }).in("role", ["agency_admin", "account_manager"]);

      setSteps([
        { id: "logo", title: "Add your logo & brand", body: "Personalise your portal — appears on reports and client emails.", done: hasLogo, icon: Sparkles, to: "/app/admin", cta: "Open admin" },
        { id: "client", title: "Add your first client", body: "Create a brand profile to attach campaigns to.", done: (clientCount ?? 0) > 0, icon: Building2, to: "/app/clients", cta: "Add client" },
        { id: "campaign", title: "Launch a campaign", body: "Create a brief, add creators, and start tracking posts.", done: (campaignCount ?? 0) > 0, icon: Megaphone, to: "/app/campaigns", cta: "New campaign" },
        { id: "team", title: "Invite your team", body: "Bring account managers in so you're not solo.", done: (teamCount ?? 0) > 1, icon: Users, to: "/app/team", cta: "Invite team" },
      ]);
    })();
  }, []);

  if (dismissed || !steps) return null;
  const completed = steps.filter(s => s.done).length;
  if (completed === steps.length) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); };

  return (
    <Card className="p-6 mb-6 border-accent/30 bg-gradient-to-br from-accent/5 to-transparent relative">
      <button onClick={dismiss} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-md bg-accent/15 text-accent flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <div className="font-display text-lg">Get {agencyName || "your agency"} set up</div>
          <div className="text-xs text-muted-foreground">{completed} of {steps.length} complete</div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {steps.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.id} className={`flex items-start gap-3 p-3 rounded-lg border ${s.done ? "bg-success/5 border-success/30" : "bg-background border-border"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                {s.done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.body}</div>
                {!s.done && (
                  <Link to={s.to}>
                    <Button size="sm" variant="outline" className="mt-2 h-7 text-xs">{s.cta}</Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default OnboardingChecklist;
