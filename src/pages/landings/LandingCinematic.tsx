import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Activity, Wallet, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo-pulse-mark.png";

const LandingCinematic = () => (
  <div className="min-h-screen bg-[hsl(20_14%_6%)] text-[hsl(36_30%_97%)] relative overflow-hidden">
    {/* Glow */}
    <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full"
      style={{ background: "radial-gradient(closest-side, hsl(0 99% 57% / 0.35), transparent 70%)" }} />
    <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
      style={{ backgroundImage: "radial-gradient(hsl(36 30% 97%) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

    <header className="relative max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
      <div className="bg-white rounded px-2 py-1"><img src={logo} alt="Daraja Pulse" className="h-7 w-auto" /></div>
      <nav className="hidden md:flex items-center gap-8 text-sm opacity-80">
        <a href="#" className="hover:text-accent">Product</a>
        <a href="#" className="hover:text-accent">Pricing</a>
        <a href="#" className="hover:text-accent">Manifesto</a>
      </nav>
      <Link to="/auth"><Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">Launch console</Button></Link>
    </header>

    <section className="relative max-w-6xl mx-auto px-6 pt-24 pb-32 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 text-[11px] uppercase tracking-widest mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Now live in Nairobi
      </div>
      <h1 className="font-display text-6xl md:text-8xl leading-[0.95] font-semibold">
        Stop guessing<br />
        <span className="text-accent">what worked.</span>
      </h1>
      <p className="mt-8 text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
        Influence, measured to the minute. Creators paid before the trend dies.
      </p>
      <div className="mt-10 flex items-center justify-center gap-4">
        <Link to="/auth">
          <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 px-8 h-12">
            Open the console <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
        <Button size="lg" variant="ghost" className="text-white hover:bg-white/10 h-12">See a live report →</Button>
      </div>

      {/* Floating stat cards */}
      <div className="mt-20 grid md:grid-cols-3 gap-4 text-left">
        {[
          { icon: Activity, k: "2.41M views", v: "Hustler Fund · Day 6", glow: true },
          { icon: Wallet, k: "M-Pesa in 9 min", v: "B2C · WHT auto" },
          { icon: ShieldCheck, k: "KRA aware", v: "e-TIMS ready records" },
        ].map(({ icon: Icon, k, v, glow }) => (
          <div key={k} className={`rounded-xl p-5 border border-white/10 bg-white/[0.03] backdrop-blur ${glow ? 'ring-1 ring-accent/40' : ''}`}>
            <Icon className={`w-5 h-5 ${glow ? 'text-accent' : 'text-white/70'}`} />
            <div className="font-display text-2xl mt-3">{k}</div>
            <div className="text-xs uppercase tracking-widest text-white/50 mt-1">{v}</div>
          </div>
        ))}
      </div>
    </section>
  </div>
);
export default LandingCinematic;
