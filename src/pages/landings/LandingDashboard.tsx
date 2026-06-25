import { useState } from "react";
import { Link } from "react-router-dom";
import PublicFooter from "@/components/PublicFooter";
import DemoRequestDialog from "@/components/DemoRequestDialog";
import {
  ArrowRight,
  Network,
  Wallet,
  ShieldCheck,
  Globe2,
  Activity,
  Search,
  Users,
  Trophy,
} from "lucide-react";
import dashboardImg from "@/assets/landing-dashboard.jpg";
import logo from "@/assets/darajapulse-logo-1024.png";

/* ---------------------------------------------------------------- */
/* DarajaPulse — Influence, orchestrated.                           */
/* ---------------------------------------------------------------- */

const STEPS = [
  { n: "01", t: "Identify", d: "Surgical filtering of creators based on deep-tissue data analysis." },
  { n: "02", t: "Sync",     d: "Real-time API conduits for direct performance monitoring." },
  { n: "03", t: "Deploy",   d: "Automated campaign launches across the distributed creator network." },
  { n: "04", t: "Optimize", d: "AI-driven adjustments to content mix and spend in mid-flight." },
  { n: "05", t: "Scale",    d: "Force multiplication of successful patterns for geometric growth." },
];

const CAPABILITIES = [
  {
    icon: Search,
    title: "Creator Discovery",
    desc: "Search a living index of African creators by platform, niche, audience geography, and authentic engagement. Score handles in seconds — not weeks of manual scouting.",
  },
  {
    icon: Users,
    title: "Influencer Management",
    desc: "One roster for every relationship: briefs, deliverables, approvals, deadlines, payouts. Everything you used to track in spreadsheets and DMs, now in one operating system.",
  },
  {
    icon: Trophy,
    title: "Contest Management",
    desc: "Run UGC contests end-to-end — public submission pages, automated metric polling, transparent leaderboards, and verifiable draw closures for prize fulfilment.",
  },
];

function TopNav({ onDemo }: { onDemo: () => void }) {
  return (
    <nav className="w-full sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
      <div className="flex justify-between items-center gap-3 h-20 md:h-24 px-4 md:px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-10 min-w-0">
          <Link to="/" className="flex items-center gap-2 md:gap-3 min-w-0">
            <img src={logo} alt="DarajaPulse" className="h-10 md:h-14 w-auto shrink-0" data-no-outline />
            <span className="hidden lg:inline font-display font-semibold tracking-tight text-lg truncate">DarajaPulse</span>
          </Link>
          <div className="hidden md:flex gap-6">
            <a href="#capabilities" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">Platform</a>
            <a href="#flow" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">How it works</a>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <Link
            to="/auth"
            className="text-sm font-medium px-3 py-2 rounded hover:bg-secondary transition-[background-color,scale] active:scale-[0.96] whitespace-nowrap"
          >
            Sign In
          </Link>
          <button
            onClick={onDemo}
            className="bg-accent text-accent-foreground text-sm font-semibold px-3 md:px-5 py-2.5 rounded hover:brightness-110 transition-[filter,scale] active:scale-[0.96] whitespace-nowrap"
          >
            Request Demo
          </button>
        </div>
      </div>
    </nav>
  );
}

function Hero({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="relative pt-24 pb-32 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 0%, hsl(0 99% 57% / 0.08) 0%, transparent 45%), radial-gradient(circle at 10% 100%, hsl(20 14% 10% / 0.06) 0%, transparent 35%)",
        }}
      />
      <div className="relative px-6 lg:px-16 max-w-screen-2xl mx-auto flex flex-col items-center text-center">
        <h1 className="font-display text-5xl md:text-6xl lg:text-7xl max-w-4xl mb-5 leading-[1.05] tracking-tight text-balance animate-enter">
          Influence,{" "}
          <span className="font-serif italic font-normal text-accent">orchestrated</span>.
        </h1>
        <p
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 text-pretty animate-enter"
          style={{ animationDelay: "120ms" }}
        >
          The operating system for African creator marketing. Discover the right creators,
          run campaigns and contests end-to-end, and prove the return — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-20 animate-enter" style={{ animationDelay: "240ms" }}>
          <button
            onClick={onDemo}
            className="bg-accent text-accent-foreground px-8 py-4 rounded-lg text-sm font-semibold shadow-[0_20px_40px_-20px_hsl(0_99%_57%/0.55)] hover:brightness-110 transition-[filter,scale] active:scale-[0.96]"
          >
            Request Demo
          </button>
          <a
            href="#capabilities"
            className="border border-foreground/80 text-foreground px-8 py-4 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
          >
            Explore Platform
          </a>
        </div>

        <div className="relative w-full max-w-5xl animate-enter" style={{ animationDelay: "360ms" }}>
          <div className="absolute -inset-4 bg-gradient-to-br from-accent/10 via-transparent to-foreground/10 blur-2xl rounded-3xl" />
          <div
            className="relative rounded-2xl overflow-hidden shadow-elegant border border-white/60 p-2 bg-white/70 backdrop-blur-md"
            style={{ animation: "float 6s ease-in-out infinite" }}
          >
            <img
              src={dashboardImg}
              alt="DarajaPulse dashboard"
              width={1536}
              height={1024}
              className="w-full rounded-xl shadow-soft"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="py-28">
      <div className="px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="max-w-2xl mb-14">
          <span className="font-mono text-xs text-accent tracking-wider mb-3 block uppercase">What it does</span>
          <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight text-balance">
            One platform for the full creator lifecycle.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CAPABILITIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <article
                key={c.title}
                className="group p-8 rounded-2xl border border-border bg-card hover:bg-secondary/40 transition-colors animate-enter"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="size-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6 transition-transform group-hover:scale-110">
                  <Icon className="size-6 text-accent" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-2xl font-semibold mb-3 tracking-tight">{c.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">{c.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FiveSteps({ onDemo }: { onDemo: () => void }) {
  return (
    <section id="flow" className="py-28 bg-card border-y border-border">
      <div className="px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-end mb-14 gap-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-balance">
              Five steps to total orchestration
            </h2>
            <p className="text-muted-foreground">
              A precision methodology that turns scattered creator spend into compounding growth.
            </p>
          </div>
          <button
            onClick={onDemo}
            className="text-sm font-semibold text-accent inline-flex items-center gap-2 hover:underline self-start md:self-auto"
          >
            Get started <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Bento({ onDemo }: { onDemo: () => void }) {
  return (
    <section id="product" className="py-28">
      <div className="px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 p-8 md:p-10 rounded-2xl border border-border bg-card relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-soft">
            <div className="relative z-10 max-w-lg">
              <h3 className="font-display text-2xl md:text-3xl font-semibold mb-3 tracking-tight">Universal Creator Node</h3>
              <p className="text-muted-foreground mb-8 text-pretty">
                Connect your entire influence network into a single, cohesive dashboard. Eliminate
                fragmentation and gain absolute clarity on performance across every channel.
              </p>
              <button
                onClick={onDemo}
                className="inline-block bg-foreground text-background px-5 py-2.5 rounded text-sm font-medium hover:opacity-90 transition-[opacity,scale] active:scale-[0.96]"
              >
                Book a walkthrough
              </button>
            </div>
            <Network className="absolute -right-10 -bottom-10 size-[260px] md:size-[320px] text-accent/10 pointer-events-none" strokeWidth={0.5} />
          </div>

          <div className="col-span-12 lg:col-span-4 p-8 md:p-10 rounded-2xl bg-accent text-accent-foreground flex flex-col justify-between min-h-[320px] shadow-elegant overflow-hidden">
            <div>
              <Wallet className="size-10 mb-5" strokeWidth={1.25} />
              <h3 className="font-display text-xl md:text-2xl font-semibold mb-3">Instant Liquidity</h3>
              <p className="opacity-90 text-sm leading-relaxed text-pretty">
                Automated payout systems that handle cross-border compliance and instant transfers for creators.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-8">
              <div className="h-px w-12 bg-accent-foreground/60" />
              <span className="font-mono text-[10px] tracking-wider uppercase">Active Settlements</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-4 p-8 rounded-2xl border border-border bg-secondary/40 hover:bg-secondary transition-colors">
            <ShieldCheck className="size-7 text-accent mb-4" strokeWidth={1.5} />
            <h4 className="font-display text-xl font-semibold mb-2">Audit-Ready</h4>
            <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
              Verified campaign logs ensure every dollar spent is accounted for with zero margin for error.
            </p>
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-4 p-8 rounded-2xl border border-border bg-card hover:bg-secondary/40 transition-colors">
            <Globe2 className="size-7 text-foreground mb-4" strokeWidth={1.5} />
            <h4 className="font-display text-xl font-semibold mb-2">Global Mesh</h4>
            <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
              Localized intelligence across 140+ markets, translating cultural nuances into campaign parameters.
            </p>
          </div>

          <div className="col-span-12 md:col-span-12 lg:col-span-4 p-8 rounded-2xl border border-border bg-card hover:bg-secondary/40 transition-colors">
            <Activity className="size-7 text-destructive mb-4" strokeWidth={1.5} />
            <h4 className="font-display text-xl font-semibold mb-2">Predictive Drift</h4>
            <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
              AI modeling anticipates engagement fatigue before it impacts ROI, suggesting pivot points automatically.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA({ onDemo }: { onDemo: () => void }) {
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
        <h2 className="font-display text-4xl md:text-6xl font-semibold tracking-tight mb-6 text-balance">
          Ready to <span className="font-serif italic font-normal text-accent">orchestrate</span>?
        </h2>
        <p className="text-lg opacity-80 max-w-xl mx-auto mb-10 text-pretty">
          Join the operators turning fragmented creator spend into measured, compounding growth.
        </p>
        <button
          onClick={onDemo}
          className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-8 py-4 rounded-lg text-sm font-semibold hover:brightness-110 transition-[filter,scale] active:scale-[0.96]"
        >
          Request Demo <ArrowRight className="size-4" />
        </button>
      </div>
    </section>
  );
}

export default function LandingDashboard() {
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <TopNav onDemo={openDemo} />
      <main className="relative overflow-hidden">
        <Hero onDemo={openDemo} />
        <Capabilities />
        <FiveSteps onDemo={openDemo} />
        <Bento onDemo={openDemo} />
        <CTA onDemo={openDemo} />
      </main>
      <PublicFooter />
      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
