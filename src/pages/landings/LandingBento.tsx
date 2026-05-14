import { Link } from "react-router-dom";
import PublicFooter from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Wallet, BarChart3, Users, ShieldCheck, Zap, Sparkles } from "lucide-react";
import logo from "@/assets/logo-pulse-mark.png";

const LandingBento = () => (
  <div className="min-h-screen bg-background">
    <header className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
      <img src={logo} alt="Daraja Pulse" className="h-9 w-auto" />
      <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
    </header>

    <section className="max-w-7xl mx-auto px-6 pt-8 pb-20">
      <div className="grid grid-cols-12 grid-rows-[auto] gap-4 auto-rows-[140px]">
        {/* Headline */}
        <div className="col-span-12 md:col-span-8 row-span-2 rounded-2xl bg-gradient-ink text-primary-foreground p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-accent/30 blur-3xl" />
          <div className="text-[11px] uppercase tracking-[0.3em] opacity-70">Influence OS · Kenya</div>
          <h1 className="font-display text-5xl md:text-7xl leading-[0.95] font-semibold relative">
            Influence,<br /><span className="text-accent italic">measured.</span>
          </h1>
          <Link to="/auth" className="self-start"><Button className="bg-accent text-accent-foreground hover:bg-accent/90">Open the console <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
        </div>

        {/* Payouts */}
        <div className="col-span-6 md:col-span-4 rounded-2xl bg-card border border-border p-5 flex flex-col justify-between">
          <Wallet className="w-5 h-5 text-accent" />
          <div>
            <div className="font-display text-3xl">9 min</div>
            <div className="text-xs text-muted-foreground">avg creator payout</div>
          </div>
        </div>

        {/* Live metric */}
        <div className="col-span-6 md:col-span-4 rounded-2xl bg-accent text-accent-foreground p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest opacity-90"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live</div>
          <div>
            <div className="font-display text-3xl">2.41M</div>
            <div className="text-xs opacity-90">views · Hustler Fund</div>
          </div>
        </div>

        {/* Subhead */}
        <div className="col-span-12 md:col-span-4 rounded-2xl bg-secondary p-5 flex items-center">
          <p className="text-sm leading-snug">
            Brief, approve, publish, measure and pay across TikTok, Instagram, YouTube and X. The end of the PDF report.
          </p>
        </div>

        {/* Creators */}
        <div className="col-span-6 md:col-span-3 rounded-2xl bg-card border border-border p-5">
          <Users className="w-5 h-5 text-accent" />
          <div className="font-display text-3xl mt-2">312</div>
          <div className="text-xs text-muted-foreground">creators on roster</div>
          <div className="flex -space-x-2 mt-3">
            {["#fe2424","#222","#aaa","#444"].map((c,i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-card" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* KRA */}
        <div className="col-span-6 md:col-span-3 rounded-2xl bg-card border border-border p-5 flex flex-col justify-between">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <div>
            <div className="font-display text-lg">KRA aware</div>
            <div className="text-xs text-muted-foreground">WHT · e-TIMS records</div>
          </div>
        </div>

        {/* Reports */}
        <div className="col-span-12 md:col-span-6 rounded-2xl bg-card border border-border p-5">
          <BarChart3 className="w-5 h-5 text-accent" />
          <div className="font-display text-xl mt-2">The live client report</div>
          <p className="text-xs text-muted-foreground mt-1">A tokenized, embed-grade page brand managers actually forward internally. Updated every minute.</p>
          <div className="mt-3 h-12 rounded bg-gradient-to-r from-accent/30 via-accent/10 to-transparent" />
        </div>

        {/* Speed */}
        <div className="col-span-6 md:col-span-3 rounded-2xl bg-foreground text-background p-5 flex flex-col justify-between">
          <Zap className="w-5 h-5 text-accent" />
          <div>
            <div className="font-display text-3xl">60s</div>
            <div className="text-xs opacity-70">brief → published</div>
          </div>
        </div>

        {/* Tag */}
        <div className="col-span-6 md:col-span-3 rounded-2xl border border-dashed border-border p-5 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Built in Nairobi</span>
        </div>
      </div>
    </section>
    <PublicFooter />
  </div>
);
export default LandingBento;
