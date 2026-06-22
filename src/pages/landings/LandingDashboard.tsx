import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import PublicFooter from "@/components/PublicFooter";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import creatorPortrait from "@/assets/landing-creator.jpg";
import logo from "@/assets/logo-pulse-mark.png";

// Charcoal & Ember palette — locked from selected design direction
const INK = "#1a1a1a";
const SURFACE = "#2d2d2d";
const MUTED = "#4a4a4a";
const PAPER = "#f5f3ee";
const EMBER = "#e85d3a";

const display = { fontFamily: "'Space Grotesk', system-ui, sans-serif" } as const;
const body = { fontFamily: "'DM Sans', system-ui, sans-serif" } as const;

// Count-up hook — animates once when element enters viewport
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return;
      started.current = true;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        // ease-out-cubic
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(target * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);

  return { ref, value };
}

const KPI = ({ label, value, format }: { label: string; value: number; format: (n: number) => string }) => {
  const { ref, value: v } = useCountUp(value);
  return (
    <div style={{ background: INK }} className="p-8">
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4" style={{ color: MUTED }}>{label}</p>
      <p ref={ref} style={display} className="text-4xl font-bold text-[#f5f3ee] tabular-nums">{format(v)}</p>
    </div>
  );
};

const LandingDashboard = () => {
  return (
    <div style={{ background: INK, color: PAPER, ...body }} className="min-h-screen selection:bg-[#e85d3a] selection:text-[#1a1a1a]">
      {/* Masthead */}
      <header className="border-b" style={{ borderColor: SURFACE }}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 transition-[opacity] duration-150 hover:opacity-80">
            <img src={logo} alt="Daraja Pulse" data-no-outline className="h-8 w-auto" width={32} height={32} />
            <div className="leading-tight">
              <div style={display} className="text-base font-bold">DarajaPulse</div>
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: MUTED }}>Influencer OS</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ color: PAPER }}>
            <a href="#product" className="transition-[color] duration-150 hover:text-[#e85d3a]">Product</a>
            <a href="#proof" className="transition-[color] duration-150 hover:text-[#e85d3a]">Proof</a>
            <Link to="/landing" className="transition-[color] duration-150 hover:text-[#e85d3a]">Studios</Link>
            <Link to="/auth" className="transition-[color] duration-150 hover:text-[#e85d3a]">Sign in</Link>
          </nav>
          <Link
            to="/auth"
            style={{ background: EMBER, color: INK }}
            className="hidden sm:inline-flex items-center px-4 py-2 font-bold text-sm transition-[filter,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110"
          >
            Book demo
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16 md:py-20 flex flex-col gap-16">
        {/* HERO — magazine feature */}
        <section className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 flex flex-col gap-8">
            <div
              className="inline-flex items-center gap-2 border px-3 py-1 w-fit animate-enter"
              style={{ background: SURFACE, borderColor: MUTED, animationDelay: "0ms" }}
            >
              <span style={{ background: EMBER }} className="w-2 h-2 rounded-full animate-pulse-counter" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: MUTED }}>
                Influencer OS · Built in Nairobi
              </span>
            </div>

            <h1
              style={{ ...display, color: PAPER, animationDelay: "80ms" }}
              className="text-6xl md:text-8xl lg:text-9xl font-bold leading-[0.85] tracking-[-0.02em] text-balance animate-enter"
            >
              Influence is <br />
              <span style={{ color: EMBER }}>institutional.</span>
            </h1>

            <p
              style={{ color: MUTED, animationDelay: "180ms" }}
              className="text-xl md:text-2xl max-w-xl leading-relaxed text-pretty animate-enter"
            >
              The operating system for African marketing agencies. Run campaigns, settle creators via M-Pesa, and publish live ROI to clients — in one interface.
            </p>

            <div className="flex flex-wrap gap-4 pt-2 animate-enter" style={{ animationDelay: "280ms" }}>
              <Link
                to="/auth"
                style={{ background: EMBER, color: INK }}
                className="px-8 py-5 font-bold text-lg transition-[filter,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110"
              >
                Book demo
              </Link>
              <Link
                to="/landing"
                style={{ borderColor: MUTED, color: PAPER }}
                className="px-8 py-5 border-2 font-bold text-lg transition-[border-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:border-[#e85d3a] hover:text-[#e85d3a]"
              >
                See live report
              </Link>
            </div>
          </div>

          {/* Featured case study side card */}
          <div className="lg:col-span-4 animate-enter" style={{ animationDelay: "360ms" }}>
            <div
              style={{ background: SURFACE, borderColor: MUTED }}
              className="border aspect-[4/5] relative overflow-hidden group"
            >
              <img
                src={creatorPortrait}
                alt="Featured creator portrait"
                width={800}
                height={1000}
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-7">
                <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: EMBER }}>
                  Case Study
                </p>
                <h3 style={display} className="text-2xl font-bold leading-tight text-pretty">
                  How a Nairobi agency settled 2,000+ creators in 48 hours
                </h3>
              </div>
            </div>
          </div>
        </section>

        {/* LIVE KPI STRIP */}
        <section
          aria-label="Live platform metrics"
          style={{ background: MUTED, borderColor: MUTED }}
          className="grid grid-cols-2 md:grid-cols-4 gap-px border"
        >
          <KPI label="Campaigns run" value={1482} format={(n) => Math.round(n).toLocaleString()} />
          <KPI label="Creators paid (KES)" value={84.2} format={(n) => `${n.toFixed(1)}M`} />
          <KPI label="Posts tracked" value={120} format={(n) => `${Math.round(n)}K+`} />
          <KPI label="Active agencies" value={38} format={(n) => Math.round(n).toLocaleString()} />
        </section>

        {/* PRODUCT MODULES — magazine sub-grid */}
        <section id="product" className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* M-Pesa Payouts — ember tile */}
          <div
            style={{ background: EMBER }}
            className="p-10 flex flex-col justify-between md:aspect-auto group transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1"
          >
            <div>
              <h4 style={{ ...display, color: INK }} className="text-4xl font-bold leading-none mb-4">
                M-Pesa<br />Disburse
              </h4>
              <p style={{ color: "rgba(26,26,26,0.8)" }} className="font-medium text-pretty">
                Instant bulk payouts to creators. No manual reconciliations — just API-driven settlement and WHT-ready records.
              </p>
            </div>
            <div style={{ background: INK, color: PAPER }} className="p-4 flex flex-col gap-2 mt-8">
              <div className="flex justify-between text-xs font-bold">
                <span>Status: Ready</span>
                <span style={{ color: EMBER }} className="inline-flex items-center gap-1.5">
                  <span style={{ background: EMBER }} className="w-1.5 h-1.5 rounded-full animate-pulse-counter" />
                  LIVE
                </span>
              </div>
              <div style={{ background: MUTED }} className="h-1 w-full overflow-hidden">
                <div style={{ background: EMBER }} className="h-full w-2/3" />
              </div>
            </div>
          </div>

          {/* Omnichannel Tracking — wide */}
          <div
            id="proof"
            style={{ background: SURFACE, borderColor: MUTED }}
            className="md:col-span-2 border p-10 relative overflow-hidden group"
          >
            <div className="flex justify-between items-start mb-10">
              <div className="max-w-xs">
                <h4 style={display} className="text-4xl font-bold leading-none mb-4" >Omnichannel tracking</h4>
                <p style={{ color: MUTED }} className="text-pretty">
                  Real-time engagement across Instagram, TikTok, Facebook, YouTube and X — with fraud detection on every post.
                </p>
              </div>
              <div
                style={{ borderColor: MUTED, color: EMBER }}
                className="w-16 h-16 border flex items-center justify-center transition-[background-color,color] duration-200 ease-out group-hover:bg-[#e85d3a] group-hover:text-[#1a1a1a]"
              >
                <TrendingUp className="w-7 h-7" />
              </div>
            </div>
            {/* Mini chart */}
            <div style={{ background: INK, borderColor: MUTED }} className="border h-48 p-5 flex items-end gap-2">
              {[20, 32, 28, 44, 38, 56, 50, 68, 62, 80, 74, 92, 86, 100].map((h, i) => (
                <div
                  key={i}
                  style={{ background: i === 13 ? EMBER : `rgba(232,93,58,${0.25 + (h / 100) * 0.5})`, height: `${h}%` }}
                  className="flex-1 transition-[height] duration-300"
                />
              ))}
            </div>
          </div>

          {/* Public Reports — paper tile */}
          <div
            style={{ background: PAPER, color: INK }}
            className="md:col-span-1 p-10 flex flex-col justify-between aspect-square transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1"
          >
            <div>
              <h4 style={display} className="text-4xl font-bold leading-none mb-4">Public<br />reports</h4>
              <p style={{ color: "rgba(26,26,26,0.65)" }} className="text-pretty">
                White-labeled client dashboards. Share live ROI with a URL — no spreadsheets, no screenshots.
              </p>
            </div>
            <div style={{ borderColor: "rgba(26,26,26,0.12)" }} className="border-t pt-6">
              <Link
                to="/landing"
                style={{ color: EMBER }}
                className="font-bold text-sm tracking-[0.2em] uppercase inline-flex items-center gap-2 transition-[gap] duration-150 hover:gap-3"
              >
                View demo report <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Live Contests — wide */}
          <div
            style={{ background: SURFACE, borderColor: MUTED }}
            className="md:col-span-2 border p-10"
          >
            <div className="flex flex-col md:flex-row gap-12">
              <div className="flex-1">
                <h4 style={display} className="text-4xl font-bold leading-none mb-4">Live<br />contests</h4>
                <p style={{ color: MUTED }} className="mb-6 text-pretty">
                  Gamify creator performance with automated leaderboards, reward tiers, and round locking.
                </p>
                <Link
                  to="/landing"
                  style={{ borderColor: EMBER, color: EMBER }}
                  className="text-xs font-bold uppercase tracking-[0.2em] border-b pb-1 transition-[opacity] duration-150 hover:opacity-80"
                >
                  Explore contests
                </Link>
              </div>
              <div style={{ background: INK, borderColor: MUTED }} className="flex-1 border p-6 space-y-4">
                {[
                  { rank: 1, handle: "@yung_milly", score: 12_400, hi: true },
                  { rank: 2, handle: "@sharon_w", score: 9_410 },
                  { rank: 3, handle: "@kenyanvibes", score: 7_820 },
                ].map((row) => (
                  <div key={row.rank} className="flex items-center gap-4">
                    <div
                      style={{ background: SURFACE, color: row.hi ? EMBER : MUTED }}
                      className="w-8 h-8 flex items-center justify-center font-bold tabular-nums"
                    >
                      {row.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: PAPER }} className="text-xs font-medium truncate mb-1.5">{row.handle}</div>
                      <div style={{ background: SURFACE }} className="h-2 w-full overflow-hidden">
                        <div
                          style={{ background: row.hi ? EMBER : MUTED, width: `${(row.score / 12_400) * 100}%` }}
                          className="h-full"
                        />
                      </div>
                    </div>
                    <span
                      style={{ color: row.hi ? PAPER : MUTED }}
                      className="text-xs font-bold tabular-nums w-16 text-right"
                    >
                      {row.score.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* AGENCY LOGOS */}
        <section className="pt-16 border-t flex flex-col gap-10" style={{ borderColor: MUTED }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-center" style={{ color: MUTED }}>
            Infrastructure for the operators behind the brands
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-50">
            {["SCANGROUP", "OGILVY AFRICA", "DENTSU", "VMLY&R", "PUBLICIS", "WPP"].map((name) => (
              <div
                key={name}
                style={display}
                className="text-2xl font-bold tracking-tighter transition-[opacity] duration-150 hover:opacity-100"
              >
                {name}
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER CTA */}
        <section
          style={{ background: SURFACE, borderColor: MUTED }}
          className="border p-12 md:p-16 text-center flex flex-col items-center gap-8"
        >
          <h2 style={display} className="text-4xl md:text-5xl font-bold leading-tight max-w-2xl text-balance">
            Ready to professionalize your influencer operations?
          </h2>
          <Link
            to="/auth"
            style={{ background: PAPER, color: INK }}
            className="px-12 py-6 font-bold text-xl transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:bg-[#e85d3a] hover:text-[#1a1a1a]"
          >
            Get started
          </Link>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default LandingDashboard;
