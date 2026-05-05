import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis } from "recharts";
import logo from "@/assets/logo-pulse-mark.png";

const seed = Array.from({ length: 12 }, (_, i) => ({ x: i, v: 40 + Math.sin(i / 1.7) * 18 + i * 4 }));

const LandingDashboard = () => {
  const [views, setViews] = useState(2_413_902);
  useEffect(() => {
    const t = setInterval(() => setViews(v => v + Math.floor(20 + Math.random() * 80)), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-screen bg-gradient-paper">
      <header className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <img src={logo} alt="Daraja Pulse" className="h-20 w-auto" />
        <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-12 pb-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-accent mb-5">Influence Operating System</div>
          <h1 className="font-display text-6xl md:text-7xl leading-[1.02] font-semibold text-balance">
            Your client report<br /><span className="text-accent italic">refreshes itself.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-lg">
            Brief, publish, measure and pay — across TikTok, Instagram, YouTube and X. M-Pesa native. KRA aware.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth"><Button size="lg" className="bg-primary">Open the console <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Button size="lg" variant="outline">Watch 60s tour</Button>
          </div>
          <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
            <div>★★★★★ 4.9 from 38 brands</div>
            <div>Trusted by Safaricom · NCBA · Bolt</div>
          </div>
        </div>

        {/* Live report mock */}
        <div className="relative">
          <div className="absolute -inset-6 bg-gradient-warm opacity-20 blur-3xl rounded-full" />
          <div className="relative rounded-2xl bg-card border border-border shadow-elegant overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live · Hustler Fund</div>
              <div className="text-muted-foreground">updated just now</div>
            </div>
            <div className="p-6">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Total views</div>
              <div className="font-display text-5xl mt-1 tabular-nums">{views.toLocaleString()}</div>
              <div className="h-28 mt-4 -mx-2">
                <ResponsiveContainer>
                  <AreaChart data={seed}>
                    <defs>
                      <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0 99% 57%)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(0 99% 57%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="x" hide />
                    <Area type="monotone" dataKey="v" stroke="hsl(0 99% 57%)" strokeWidth={2} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-4">
                {[
                  { i: Eye, l: "Views", v: "2.4M" },
                  { i: Heart, l: "Likes", v: "184k" },
                  { i: MessageCircle, l: "Comments", v: "9.2k" },
                  { i: Share2, l: "Shares", v: "21k" },
                ].map(({ i: I, l, v }) => (
                  <div key={l} className="rounded-lg bg-secondary/60 p-3">
                    <I className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="font-display text-lg mt-1">{v}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 bg-secondary/40 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>14 creators · 21 posts</span>
              <span>daraja.pulse/r/h7s2k</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
export default LandingDashboard;
