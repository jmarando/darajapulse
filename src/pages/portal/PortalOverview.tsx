import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, Megaphone, ArrowUpRight } from "lucide-react";

const PortalOverview = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: cl } = await supabase.from("clients").select("*");
      setClients(cl ?? []);
      const { data: cp } = await supabase.from("campaigns").select("*, clients(name, logo_url)").order("created_at", { ascending: false });
      setCampaigns(cp ?? []);
    })();
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Welcome</div>
      <h1 className="font-display text-4xl font-semibold mt-1 mb-8">Your campaigns</h1>

      {clients.length === 0 ? (
        <Card className="p-16 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="font-display text-2xl mt-4">No access yet</h3>
          <p className="text-muted-foreground mt-1">Your agency hasn't linked you to a brand yet.</p>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {clients.map(c => (
              <Card key={c.id} className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center overflow-hidden border">
                    {c.logo_url ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-contain p-1" /> : <span className="font-display text-lg">{c.name[0]}</span>}
                  </div>
                  <div><div className="font-display text-lg">{c.name}</div><div className="text-xs text-muted-foreground">{c.industry || "—"}</div></div>
                </div>
              </Card>
            ))}
          </div>

          <h2 className="font-display text-2xl mb-3">Campaigns</h2>
          {campaigns.length === 0 ? (
            <Card className="p-12 text-center"><Megaphone className="w-8 h-8 mx-auto text-muted-foreground" /><p className="mt-2 text-muted-foreground">No campaigns yet.</p></Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map(c => (
                <Link key={c.id} to={`/portal/campaigns/${c.id}`} className="group">
                  <Card className="p-5 hover:shadow-elegant hover:-translate-y-0.5 transition-all">
                    <div className="text-xs text-muted-foreground">{c.clients?.name}</div>
                    <div className="font-display text-xl mt-1">{c.name}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{c.start_date} — {c.end_date}</div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="px-2 py-0.5 rounded bg-secondary capitalize">{c.status}</span>
                      <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
export default PortalOverview;
