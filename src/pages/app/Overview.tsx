import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Megaphone, Users, Building2, Wallet, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";

const Stat = ({ icon: Icon, label, value, sub }: any) => (
  <Card className="p-5">
    <div className="flex items-center justify-between">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <Icon className="w-4 h-4 text-accent" />
    </div>
    <div className="font-display text-4xl font-semibold mt-3">{value}</div>
    {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
  </Card>
);

const Overview = () => {
  const [s, setS] = useState({ clients: 0, campaigns: 0, influencers: 0, payouts: 0, live: 0 });

  useEffect(() => {
    (async () => {
      const [c, ca, i, p, lv] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }),
        supabase.from("influencers").select("id", { count: "exact", head: true }),
        supabase.from("payouts").select("net_kes"),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "live"),
      ]);
      const totalPayout = (p.data ?? []).reduce((a: number, r: any) => a + Number(r.net_kes || 0), 0);
      setS({ clients: c.count ?? 0, campaigns: ca.count ?? 0, influencers: i.count ?? 0, payouts: totalPayout, live: lv.count ?? 0 });
    })();
  }, []);

  const series = Array.from({ length: 14 }, (_, i) => ({ d: `D${i + 1}`, v: Math.round(50 + Math.sin(i / 2) * 20 + i * 4) }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Agency console</div>
        <h1 className="font-display text-4xl font-semibold mt-1">Good morning.</h1>
        <p className="text-muted-foreground mt-1">Here's where your campaigns stand today.</p>
      </header>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon={Building2} label="Clients" value={s.clients} />
        <Stat icon={Megaphone} label="Campaigns" value={s.campaigns} sub={`${s.live} live`} />
        <Stat icon={Users} label="Influencers" value={s.influencers} />
        <Stat icon={Wallet} label="Paid (KES)" value={s.payouts.toLocaleString()} />
      </div>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Engagement velocity</div>
            <h2 className="font-display text-2xl mt-1">Last 14 days</h2>
          </div>
          <div className="flex items-center gap-2 text-success text-sm"><TrendingUp className="w-4 h-4" /> +12.4%</div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Line type="monotone" dataKey="v" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

export default Overview;
