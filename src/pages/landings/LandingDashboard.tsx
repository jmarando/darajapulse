import { Link } from "react-router-dom";
import PublicFooter from "@/components/PublicFooter";
import {
  ArrowRight,
  Hub,
  Wallet,
  ShieldCheck,
  Globe2,
  Activity,
} from "lucide-react";
import dashboardImg from "@/assets/landing-dashboard.jpg";
import logo from "@/assets/darajapulse-logo-1024.png";

/* ---------------------------------------------------------------- */
/* DarajaPulse — Influence, orchestrated.                           */
/* Layout: floating-hero + 5-step methodology + bento + dark CTA     */
/* ---------------------------------------------------------------- */

const STEPS = [
  { n: "01", t: "Identify", d: "Surgical filtering of creators based on deep-tissue data analysis." },
  { n: "02", t: "Sync",     d: "Establish real-time API conduits for direct performance monitoring." },
  { n: "03", t: "Deploy",   d: "Automated campaign launches across the distributed creator network." },
  { n: "04", t: "Optimize", d: "AI-driven adjustments to content mix and spend in mid-flight." },
  { n: "05", t: "Scale",    d: "Force multiplication of successful patterns for geometric growth." },
];

function TopNav() {
  return (
    <nav className="w-full sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="flex justify-between items-center h-20 px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-10">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="DarajaPulse" className="h-8 w-auto" data-no-outline />
            <span className="font-display font-semibold tracking-tight">DarajaPulse</span>
          </Link>
          <div className="hidden md:flex gap-6">
            <a href="#product" className="text-sm font-semibold text-accent border-b-2 border-accent pb-1">Product</a>
            <a href="#flow" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">Flow</a>
            <a href="#creators" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">Creators</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">Pricing</a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="text-sm font-medium px-3 py-2 rounded hover:bg-secondary transition-[background-color,scale] active:scale-[0.96]"
          >
            Sign In
          </Link>
          <Link
            to="/auth"
            className="bg-accent text-accent-foreground text-sm font-semibold px-5 py-2.5 rounded hover:brightness-110 transition-[filter,scale] active:scale-[0.96]"
          >
            Start Free
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative pt-24 pb-32 overflow-hidden">
      {/* radial wash */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 0%, hsl(0 99% 57% / 0.08) 0%, transparent 45%), radial-gradient(circle at 10% 100%, hsl(20 14% 10% / 0.06) 0%, transparent 35%)",
        }}
      />
      <div className="relative px-6 lg:px-16 max-w-screen-2xl mx-auto flex flex-col items-center text-center">
        <h1 className="font-display text-5xl md:text-6xl lg:text-7xl max-w-4xl mb-5 leading-[1.05] tracking-tight animate-enter">
          Influence,{" "}
          <span className="font-serif italic font-normal text-accent">orchestrated</span>.
        </h1>
        <p
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 animate-enter"
          style={{ animationDelay: "120ms" }}
        >
          Precise execution. Measurable growth. DarajaPulse transforms complex creator ecosystems
          into streamlined growth engines with surgical accuracy.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-20 animate-enter" style={{ animationDelay: "240ms" }}>
          <Link
            to="/auth"
            className="bg-accent text-accent-foreground px-8 py-4 rounded-lg text-sm font-semibold shadow-[0_20px_40px_-20px_hsl(0_99%_57%/0.55)] hover:brightness-110 transition-[filter,transform] active:scale-[0.96]"
          >
            Request Demo
          </Link>
          <a
            href="#flow"
            className="border border-foreground/80 text-foreground px-8 py-4 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
          >
            Explore Platform
          </a>
        </div>

        {/* Floating dashboard */}
        <div className="relative w-full max-w-5xl animate-enter" style={{ animationDelay: "360ms" }}>
          <div className="absolute -inset-4 bg-gradient-to-br from-accent/10 via-transparent to-foreground/10 blur-2xl rounded-3xl" />
          <div
            className="relative rounded-2xl overflow-hidden shadow-elegant border border-white/60 p-2 bg-white/70 backdrop-blur-md"
            style={{ animation: "float 6s ease-in-out infinite" }}
          >
            <img
              src={dashboardImg}
              alt="DarajaPulse dashboard"
              className="w-full rounded-xl shadow-soft"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FiveSteps() {
  return (
    <section id="flow" className="py-28 bg-card border-y border-border">
      <div className="px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-end mb-16 gap-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2">
              Five steps to total orchestration
            </h2>
            <p className="text-muted-foreground">
              Our precision methodology ensures every campaign is a calculated victory.
            </p>
          </div>
          <a href="#flow" className="text-sm font-semibold text-accent inline-flex items-center gap-2 hover:underline">
            View Full Methodology <ArrowRight className="size-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="group p-6 border border-border rounded-lg bg-background hover:bg-secondary/60 transition-colors animate-enter"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="font-mono text-xs text-accent tracking-wider mb-4 block">{s.n}</span>
              <h3 className="font-display text-xl font-semibold mb-2 transition-transform group-hover:translate-x-1">
                {s.t}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Bento() {
  return (
    <section id="product" className="py-28">
      <div className="px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Large feature */}
          <div className="col-span-12 lg:col-span-8 p-10 rounded-2xl border border-border bg-card relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-soft">
            <div className="relative z-10 max-w-lg">
              <h3 className="font-display text-3xl font-semibold mb-3 tracking-tight">Universal Creator Node</h3>
              <p className="text-muted-foreground mb-8">
                Connect your entire influence network into a single, cohesive dashboard. Eliminate
                fragmentation and gain absolute clarity on performance across every channel.
              </p>
              <button className="bg-foreground text-background px-5 py-2.5 rounded text-sm font-medium hover:opacity-90 transition-[opacity,scale] active:scale-[0.96]">
                Explore Architecture
              </button>
            </div>
            <Hub className="absolute -right-10 -bottom-10 size-[320px] text-accent/10 pointer-events-none" strokeWidth={0.5} />
          </div>

          {/* Side accent card */}
          <div className="col-span-12 lg:col-span-4 p-10 rounded-2xl bg-accent text-accent-foreground flex flex-col justify-between min-h-[320px] shadow-elegant">
            <div>
              <Wallet className="size-12 mb-6" strokeWidth={1.25} />
              <h3 className="font-display text-2xl font-semibold mb-3">Instant Liquidity</h3>
              <p className="opacity-90 text-sm leading-relaxed">
                Automated payout systems that handle cross-border compliance and instant transfers for creators.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-8">
              <div className="h-px w-12 bg-accent-foreground" />
              <span className="font-mono text-xs tracking-wider uppercase">Active Settlements</span>
            </div>
          </div>

          {/* Small feature 1 */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 p-8 rounded-2xl border border-border bg-secondary/50 hover:bg-secondary transition-colors">
            <ShieldCheck className="size-7 text-accent mb-4" strokeWidth={1.5} />
            <h4 className="font-display text-xl font-semibold mb-2">Audit-Ready</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Verified campaign logs ensure every dollar spent is accounted for with zero margin for error.
            </p>
          </div>

          {/* Small feature 2 */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 p-8 rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-colors">
            <Globe2 className="size-7 text-foreground mb-4" strokeWidth={1.5} />
            <h4 className="font-display text-xl font-semibold mb-2">Global Mesh</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Localized intelligence across 140+ markets, translating cultural nuances into technical
              campaign parameters.
            </p>
          </div>

          {/* Small feature 3 */}
          <div className="col-span-12 md:col-span-12 lg:col-span-4 p-8 rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-colors">
            <Activity className="size-7 text-destructive mb-4" strokeWidth={1.5} />
            <h4 className="font-display text-xl font-semibold mb-2">Predictive Drift</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI modeling that anticipates engagement fatigue before it impacts your ROI, suggesting
              pivot points automatically.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-32 bg-foreground text-background relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 30%, hsl(0 99% 57%) 0%, transparent 35%), radial-gradient(circle at 75% 70%, hsl(36 30% 97%) 0%, transparent 35%)",
        }}
      />
      <div className="relative z-10 px-6 lg:px-16 max-w-screen-2xl mx-auto text-center">
        <h2 className="font-display text-5xl md:text-6xl font-semibold tracking-tight mb-6">
          Ready to <span className="font-serif italic font-normal text-accent">orchestrate</span>?
        </h2>
        <p className="text-lg opacity-80 max-w-xl mx-auto mb-10">
          Join the operators turning fragmented creator spend into measured, compounding growth.
        </p>
        <Link
          to="/auth"
          className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-8 py-4 rounded-lg text-sm font-semibold hover:brightness-110 transition-[filter,scale] active:scale-[0.96]"
        >
          Start Free <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

export default function LandingDashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="relative overflow-hidden">
        <Hero />
        <FiveSteps />
        <Bento />
        <CTA />
      </main>
      <PublicFooter />
    </div>
  );
}
