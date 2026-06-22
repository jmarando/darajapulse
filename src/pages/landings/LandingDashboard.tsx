import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import PublicFooter from "@/components/PublicFooter";
import {
  ArrowRight,
  Play,
  Zap,
  TrendingUp,
  Check,
  Send,
  User as UserIcon,
} from "lucide-react";
import creatorPortrait from "@/assets/landing-creator.jpg";
import logo from "@/assets/logo-pulse-mark.png";

// ─── live data hooks ───────────────────────────────────────────────────────
function useCycle<T>(items: T[], ms = 2400) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % items.length), ms);
    return () => clearInterval(id);
  }, [items.length, ms]);
  return [items[idx], idx] as const;
}

function useTickingNumber(base: number, jitter = 90, ms = 1500) {
  const [n, setN] = useState(base);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => v + Math.floor(Math.random() * jitter) + 1), ms);
    return () => clearInterval(id);
  }, [jitter, ms]);
  return n;
}

function useCountUp(target: number, duration = 1400) {
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

// Generate a smooth-ish line chart path. Deterministic seed so SSR-safe.
function makeChartPath(points = 28, seed = 2, amplitude = 22, freq = 1.9) {
  let pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 100;
    const t = (i / (points - 1)) * Math.PI * freq + seed;
    const noise = (Math.sin(t * 5.1 + seed * 2) + Math.cos(t * 2.3)) * 4;
    const y = 50 - Math.sin(t) * amplitude - noise;
    pts.push([x, Math.max(8, Math.min(92, y))]);
  }
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;
  return { line, area };
}

const TICKER = [
  ["@wanjiruke", "+12,408 views", "TikTok"],
  ["@sauticreates", "Reel live", "FB"],
  ["@kenyanvibes", "+4,210 views", "YT"],
  ["@brendamaina", "KES 18,400 sent", "M-Pesa"],
  ["@kevin_otieno", "+1,820 likes", "X"],
  ["@nairobi.eats", "Approved", "IG"],
  ["@msanii_kk", "Brief signed", "BRF-0427"],
];

const eyebrow = "text-[10px] tracking-[0.22em] uppercase font-medium text-muted-foreground";
const eyebrowAccent = "text-[10px] tracking-[0.22em] uppercase font-medium text-accent";
const tile =
  "rounded-2xl border border-border bg-card shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft";

// ─── Header ────────────────────────────────────────────────────────────────
const Header = () => (
  <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
    <div className="max-w-[1320px] mx-auto px-6 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2.5 transition-[opacity] duration-150 hover:opacity-80">
        <img src={logo} alt="" data-no-outline className="h-7 w-auto" width={28} height={28} />
        <span className="font-display font-semibold text-[17px] tracking-[-0.01em]">Daraja Pulse</span>
      </Link>
      <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-foreground/80">
        {["Product","Workflow","Customers","Pricing","Docs"].map((s) => (
          <a key={s} href="#" className="transition-[color] duration-150 hover:text-accent">{s}</a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/auth" className="hidden sm:inline-flex items-center px-4 h-9 rounded-md border border-input text-sm font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:bg-accent hover:text-accent-foreground hover:border-accent">
          Sign in
        </Link>
        <Link to="/auth" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium transition-[background-color,scale,box-shadow] duration-150 ease-out active:scale-[0.96] hover:bg-primary/90 hover:shadow-elegant">
          Open the console <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  </header>
);

// ─── Hero block (above bento) ──────────────────────────────────────────────
const HeroIntro = () => (
  <section className="max-w-[1320px] mx-auto px-6 pt-14 pb-8 grid grid-cols-12 gap-8 items-end animate-enter">
    <div className="col-span-12 lg:col-span-7">
      <div className={eyebrowAccent + " inline-flex items-center gap-2 mb-5"}>
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-counter" />
        Issue 02 · Nairobi · live now
      </div>
      <h1 className="font-display font-semibold text-[56px] md:text-[80px] lg:text-[104px] leading-[0.92] tracking-[-0.03em] text-balance">
        Every post.<br />
        Every payout.<br />
        <span className="font-serif italic text-accent">One live document.</span>
      </h1>
    </div>
    <div className="col-span-12 lg:col-span-5 space-y-6">
      <p className="text-[17px] md:text-[18px] leading-relaxed text-muted-foreground text-pretty max-w-md">
        The influence operating system for East African agencies. Brief, publish, measure and <strong className="text-foreground font-medium">pay creators</strong> across five networks — in one document the brand can refresh at 2am.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/auth" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 h-12 rounded-md text-[15px] font-medium transition-[background-color,scale,box-shadow] duration-150 ease-out active:scale-[0.96] hover:shadow-elegant hover:bg-primary/90">
          Open the console <ArrowRight className="w-4 h-4" />
        </Link>
        <a href="#tour" className="inline-flex items-center gap-2 border border-input px-6 h-12 rounded-md text-[15px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:bg-accent hover:text-accent-foreground hover:border-accent">
          <Play className="w-4 h-4" /> 60s tour
        </a>
      </div>
    </div>
  </section>
);

// ─── Bento mosaic ──────────────────────────────────────────────────────────
const Bento = () => {
  const views = useTickingNumber(2_413_902, 90, 1500);
  const chart = useMemo(() => makeChartPath(28, 2, 22, 1.9), []);
  const [, idx] = useCycle(TICKER, 2200);

  return (
    <section className="max-w-[1320px] mx-auto px-6 pb-16">
      <div className="grid grid-cols-12 gap-4 md:gap-5 auto-rows-[minmax(150px,auto)]">
        {/* CTA — wide, ink */}
        <div className={`col-span-12 md:col-span-7 rounded-2xl bg-primary text-primary-foreground p-7 flex items-center justify-between gap-6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elegant`}>
          <div>
            <div className="font-display font-semibold text-[24px] leading-tight tracking-[-0.015em] text-balance">
              Run your next campaign through the console.
            </div>
            <div className="text-[12.5px] text-primary-foreground/60 mt-1.5">No credit card · setup in 7 min · first 3 free</div>
          </div>
          <Link to="/auth" className="shrink-0 inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 h-11 rounded-md text-[14px] font-semibold transition-[filter,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110">
            Open the console <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* KPI · Avg payout */}
        <div className={`${tile} col-span-6 md:col-span-2 p-5 flex flex-col justify-between`}>
          <span className={eyebrow}>Avg payout</span>
          <span className="font-display font-semibold tabular-nums text-[36px] leading-none mt-2">
            9<span className="text-[18px] text-muted-foreground font-medium ml-0.5">m 14s</span>
          </span>
        </div>
        {/* KPI · EMV */}
        <div className={`${tile} col-span-6 md:col-span-3 p-5 flex flex-col justify-between`}>
          <span className={eyebrow}>EMV · KES</span>
          <span className="font-display font-semibold tabular-nums text-[36px] leading-none mt-2">29,372</span>
        </div>

        {/* Live ticker — wide */}
        <div className={`${tile} col-span-12 md:col-span-7 p-6 flex flex-col gap-4`}>
          <div className="flex items-center justify-between">
            <span className={eyebrowAccent + " inline-flex items-center gap-2"}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-counter" /> Live wire · 14 campaigns
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">updates every 2s</span>
          </div>
          <ul className="divide-y divide-border">
            {TICKER.slice(0, 5).map((row, i) => {
              const isHot = i === (idx % 5);
              return (
                <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-[background-color] duration-300 ${isHot ? "bg-accent animate-pulse-counter" : "bg-success/60"}`} />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium text-foreground">{row[0]}</span>
                    <span className="text-muted-foreground"> · {row[2]}</span>
                  </span>
                  <span className={`font-mono text-[12px] tabular-nums ${row[1].startsWith("KES") || isHot ? "text-accent" : "text-foreground/70"}`}>{row[1]}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Views · chart (paper) */}
        <div className={`${tile} col-span-12 md:col-span-5 p-6 flex flex-col gap-3 overflow-hidden`}>
          <div className="flex items-start justify-between">
            <div>
              <div className={eyebrow}>Views · Hustler Fund · day 6/14</div>
              <div className="font-display font-semibold tabular-nums text-[34px] leading-none mt-2 animate-pulse-counter">
                {views.toLocaleString()}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-accent font-medium mt-2">
                <TrendingUp className="w-3 h-3" /> +12.4% this week
              </div>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">self-refresh</span>
          </div>
          <div className="flex-1 min-h-[100px] -mx-1">
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="bentoG1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={chart.area.replace(/100\,100/g, "100,60").replace(/0\,100/g, "0,60")} fill="url(#bentoG1)" />
              <path d={chart.line} stroke="hsl(var(--accent))" strokeWidth="1.8" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>

        {/* Creator portrait card */}
        <div className={`${tile} col-span-12 md:col-span-4 p-0 overflow-hidden flex flex-col group`}>
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={creatorPortrait}
              alt="Wanjiru Kĩeti"
              data-no-outline
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
            />
            <div className="absolute inset-x-3 top-3 flex items-center justify-between text-[10px] font-mono text-primary-foreground/90">
              <span className="inline-flex items-center gap-1 bg-primary/70 backdrop-blur px-2 py-1 rounded">
                <UserIcon className="w-2.5 h-2.5" /> CREATOR · 04 / 14
              </span>
              <span className="inline-flex items-center gap-1 bg-primary/70 backdrop-blur px-2 py-1 rounded text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-counter" /> LIVE
              </span>
            </div>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <div>
              <div className="font-display font-semibold text-[18px] leading-tight">Wanjiru Kĩeti</div>
              <div className="text-[12px] text-muted-foreground">@wanjiruke · lifestyle, comedy</div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
              {[["Reach", "412k"], ["ER", "8.1%"], ["KES/k", "160"]].map(([l, v]) => (
                <div key={l}>
                  <div className={eyebrow}>{l}</div>
                  <div className="font-display font-semibold tabular-nums text-[18px] mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Payout receipt — accent */}
        <div className="col-span-12 md:col-span-4 rounded-2xl bg-accent text-accent-foreground p-6 flex flex-col justify-between gap-5 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elegant">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.22em] uppercase font-medium text-accent-foreground/85">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-foreground animate-pulse-counter" /> Just paid · 9m 14s
              </span>
              <Zap className="w-4 h-4" />
            </div>
            <div className="font-mono text-[11px] text-accent-foreground/85 mt-4">To @wanjiruke · +254 7·· 234 109</div>
            <div className="font-display font-semibold tabular-nums text-[40px] leading-none mt-2">
              <span className="text-[14px] font-medium text-accent-foreground/70 mr-1">KES</span>18,400
            </div>
          </div>
          <div className="space-y-1.5 text-[12px] font-mono pt-3 border-t border-accent-foreground/20">
            {[["WHT @ 5%", "−920"], ["Net to M-Pesa", "17,480"], ["e-TIMS ref", "KE-PLS-2271"]].map(([l, v]) => (
              <div key={l} className="flex justify-between"><span className="text-accent-foreground/75">{l}</span><span>{v}</span></div>
            ))}
          </div>
        </div>

        {/* Brief card */}
        <div className={`${tile} col-span-12 md:col-span-4 p-6 flex flex-col gap-4`}>
          <div className="flex items-center justify-between">
            <div className="font-display font-semibold text-[15px]">Brief · Mama Mboga · Q1</div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> SIGNED · 60s
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            {[["Brand", "Royco"], ["Pool", "KES 120k"], ["Delivery", "Fri · 17:00"]].map(([l, v]) => (
              <div key={l} className="bg-muted rounded-md px-2.5 py-2">
                <div className={eyebrow}>{l}</div>
                <div className="font-display font-semibold tabular-nums text-[13px] mt-0.5">{v}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-1.5 text-[12.5px]">
            {[
              "6 creators · TikTok + IG Reels",
              "Hook in 3 seconds · Swahili optional",
              "WHT computed · e-TIMS on payout",
              "Tokenized public report on publish",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-success/15 text-success grid place-items-center shrink-0">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quote tile */}
        <div className={`${tile} col-span-12 md:col-span-8 p-7 flex flex-col justify-between gap-6`}>
          <p className="font-serif italic text-[26px] md:text-[30px] leading-[1.2] tracking-[-0.01em] text-balance">
            "The brand stopped <span className="text-accent">emailing</span> me for the latest numbers. The <span className="font-display not-italic font-semibold text-foreground">link</span> is the latest numbers."
          </p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-warm" />
            <div className="text-[12.5px] leading-tight">
              <div className="font-medium">Achieng' Omolo</div>
              <div className="text-muted-foreground">Head of Ops · Bridge Collective</div>
            </div>
          </div>
        </div>

        {/* EA map (ink) */}
        <div className="col-span-12 md:col-span-4 rounded-2xl bg-primary text-primary-foreground p-6 flex flex-col justify-between relative overflow-hidden transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elegant">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase font-medium text-primary-foreground/60">Active across</div>
            <div className="font-display font-semibold tabular-nums text-[36px] leading-none mt-2">4 markets</div>
          </div>
          {/* abstract markers */}
          <div className="absolute inset-0 pointer-events-none">
            {[{ t: 28, l: 38 }, { t: 48, l: 52 }, { t: 38, l: 58 }, { t: 60, l: 30 }].map((p, i) => (
              <span key={i} className="absolute block" style={{ top: `${p.t}%`, left: `${p.l}%` }}>
                <span className="block w-2 h-2 rounded-full bg-accent animate-pulse-counter" style={{ animationDelay: `${i * 300}ms` }} />
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-accent/30 animate-ping" />
              </span>
            ))}
          </div>
          <div className="font-mono text-[10px] text-primary-foreground/55 tracking-[0.12em] leading-relaxed relative z-10">
            <div>KE · Nairobi · Mombasa</div>
            <div>TZ · Dar · UG · Kampala</div>
            <div>RW · Kigali</div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Editorial rows — three things this collapses ──────────────────────────
const EditorialRows = () => {
  const r2chart = useMemo(() => makeChartPath(28, 2, 22, 1.6), []);
  const r2dash = useMemo(() => makeChartPath(28, 8, 16, 1.2), []);

  return (
    <section className="max-w-[1320px] mx-auto px-6 py-16 space-y-24">
      {/* One — Briefing */}
      <div className="grid grid-cols-12 gap-10 items-center">
        <div className="col-span-12 lg:col-span-5 space-y-5">
          <span className={eyebrowAccent}>One · Briefing</span>
          <h3 className="font-display font-semibold text-[36px] md:text-[48px] leading-[1.05] tracking-[-0.025em] text-balance">
            Brief → published <span className="font-serif italic text-accent">in sixty seconds.</span>
          </h3>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground text-pretty">
            Turn a Slack message into a signed brief, a creator shortlist, and five tokenized links. The brand approves on phone — between meetings, between matatu stops.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
            {[["60s", "Brief to signed"], ["6 ×", "Creators per click"], ["0", "Email threads"]].map(([v, l]) => (
              <div key={l}>
                <div className="font-display font-semibold tabular-nums text-[26px] leading-none">{v}</div>
                <div className={eyebrow + " mt-2"}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="rounded-2xl border border-border bg-card shadow-soft p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-counter" />
                <span className="font-display font-semibold text-[16px]">Brief composer</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">BRF-0427 · auto-saved 4s ago</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[["Brand", "Royco"], ["Pool", "KES 120k"], ["Delivery", "Fri 17:00"]].map(([l, v]) => (
                <div key={l} className="bg-muted rounded-md px-3 py-2.5">
                  <div className={eyebrow}>{l}</div>
                  <div className="font-display font-semibold tabular-nums text-[14px] mt-1">{v}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-2 text-[13px]">
              {["6 creators in TikTok + IG Reels", "Hook in 3 seconds · Swahili optional", "WHT auto-computed at line level", "Tokenized public report on publish"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-success/15 text-success grid place-items-center"><Check className="w-2.5 h-2.5" strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-3 border-t border-dashed border-border">
              <span className="font-mono text-[11px] text-muted-foreground truncate">→ safaricom.daraja.pulse/b/h7s2k</span>
              <button className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-3 h-8 rounded-md text-[12px] font-semibold transition-[filter,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110">
                Send to brand <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two — Measurement */}
      <div className="grid grid-cols-12 gap-10 items-center">
        <div className="col-span-12 lg:col-span-7 order-2 lg:order-1">
          <div className="rounded-2xl bg-primary text-primary-foreground p-6 flex flex-col gap-4 shadow-elegant">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-primary-foreground/55">Hustler Fund · Q2</div>
                <div className="font-display font-semibold text-[20px] mt-1.5">Performance · live</div>
              </div>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-primary-foreground/60">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-counter" /> day 6 / 14
              </span>
            </div>
            <div className="h-[180px] -mx-1">
              <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="w-full h-full">
                <defs>
                  <linearGradient id="rowG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[15, 30, 45].map((y) => (
                  <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="hsla(36,30%,97%,0.08)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={r2chart.area.replace(/100\,100/g, "100,60").replace(/0\,100/g, "0,60")} fill="url(#rowG)" />
                <path d={r2chart.line} stroke="hsl(var(--accent))" strokeWidth="1.8" fill="none" vectorEffect="non-scaling-stroke" />
                <path d={r2dash.line} stroke="hsl(var(--highlight))" strokeWidth="1.4" fill="none" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="grid grid-cols-5 gap-2 pt-4 border-t border-primary-foreground/10">
              {[["TIK", "980k"], ["IG", "612k"], ["FB", "288k"], ["YT", "412k"], ["X", "118k"]].map(([n, v]) => (
                <div key={n}>
                  <div className="font-mono text-[9px] tracking-[0.18em] text-primary-foreground/55">{n}</div>
                  <div className="font-display font-semibold tabular-nums text-[16px] mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5 order-1 lg:order-2 space-y-5">
          <span className={eyebrowAccent}>Two · Measurement</span>
          <h3 className="font-display font-semibold text-[36px] md:text-[48px] leading-[1.05] tracking-[-0.025em] text-balance">
            Five networks, <span className="font-serif italic text-accent">one timer.</span>
          </h3>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground text-pretty">
            TikTok, Instagram, Facebook, YouTube and X — every view, like, comment and share resolved against a single campaign clock. The brand watches it refresh in their browser. They stop calling. They start booking the next one.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
            {[["2s", "Refresh interval"], ["5", "Networks, native"], ["2.4M", "Views this month"]].map(([v, l]) => (
              <div key={l}>
                <div className="font-display font-semibold tabular-nums text-[26px] leading-none">{v}</div>
                <div className={eyebrow + " mt-2"}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three — Payout */}
      <div className="grid grid-cols-12 gap-10 items-center">
        <div className="col-span-12 lg:col-span-5 space-y-5">
          <span className={eyebrowAccent}>Three · Payout</span>
          <h3 className="font-display font-semibold text-[36px] md:text-[48px] leading-[1.05] tracking-[-0.025em] text-balance">
            M-Pesa in <span className="font-serif italic text-accent">nine minutes.</span>
          </h3>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground text-pretty">
            Approve, batch, send. The Daraja API does what it does. Creators get paid before the trend dies — and KRA gets the e-TIMS-ready record before you log off. No payroll spreadsheet survives contact with this.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
            {[["9m", "Avg payout"], ["5%", "WHT, auto"], ["e-TIMS", "Ready on write"]].map(([v, l]) => (
              <div key={l}>
                <div className="font-display font-semibold tabular-nums text-[26px] leading-none">{v}</div>
                <div className={eyebrow + " mt-2"}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="rounded-2xl border border-border bg-card shadow-soft p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="font-display font-semibold text-[16px]">Payout batch · 0427</div>
              <span className="font-mono text-[11px] text-accent inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" /> SENT · 9m 14s
              </span>
            </div>
            <ul className="space-y-1.5 text-[12.5px] font-mono">
              {[
                ["@wanjiruke", "18,400", "+254 7·· 234 109"],
                ["@sauticreates", "12,000", "+254 7·· 880 122"],
                ["@kenyanvibes", "14,200", "+254 7·· 119 401"],
                ["@brendamaina", " 6,400", "+254 7·· 552 778"],
                ["@kevin_otieno", " 9,600", "+254 7·· 226 084"],
                ["@nairobi.eats", " 5,800", "+254 7·· 909 311"],
              ].map(([who, amt, ph]) => (
                <li key={who} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-1 border-b border-border/60 last:border-0">
                  <span className="text-foreground">{who}</span>
                  <span className="text-muted-foreground hidden sm:inline">{ph}</span>
                  <span className="tabular-nums text-accent font-medium">KES {amt}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-2 border-t border-dashed border-border text-[11px] font-mono text-muted-foreground">
              <span>Batch total · KES 66,400 · WHT 3,320</span>
              <span>e-TIMS · 6 records written</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── KPI strip ─────────────────────────────────────────────────────────────
const KPI = ({ label, target, format }: { label: string; target: number; format: (n: number) => string }) => {
  const { ref, value } = useCountUp(target);
  return (
    <div className="px-6 py-7">
      <div className={eyebrow + " mb-3"}>{label}</div>
      <div className="font-display font-semibold tabular-nums text-[40px] leading-none">
        <span ref={ref}>{format(value)}</span>
      </div>
    </div>
  );
};
const KpiStrip = () => (
  <section className="border-y border-border bg-secondary/40">
    <div className="max-w-[1320px] mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
      <KPI label="Campaigns run" target={1482} format={(n) => Math.round(n).toLocaleString()} />
      <KPI label="Creators paid (KES)" target={84.2} format={(n) => `${n.toFixed(1)}M`} />
      <KPI label="Posts tracked" target={120} format={(n) => `${Math.round(n)}K+`} />
      <KPI label="Active agencies" target={38} format={(n) => Math.round(n).toLocaleString()} />
    </div>
  </section>
);

// ─── Closing CTA ───────────────────────────────────────────────────────────
const Closing = () => (
  <section className="max-w-[1320px] mx-auto px-6 py-20">
    <div className="rounded-2xl bg-gradient-ink text-primary-foreground p-10 md:p-14 flex flex-col items-center text-center gap-6 shadow-elegant">
      <span className="text-[10px] tracking-[0.3em] uppercase text-primary-foreground/60">The console is open</span>
      <h2 className="font-display font-semibold text-[36px] md:text-[56px] leading-[1.05] tracking-[-0.025em] max-w-2xl text-balance">
        Stop emailing PDFs. Start sending a <span className="font-serif italic text-accent">link</span>.
      </h2>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link to="/auth" className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-7 h-12 rounded-md text-[15px] font-semibold transition-[filter,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110">
          Open the console <ArrowRight className="w-4 h-4" />
        </Link>
        <a href="#tour" className="inline-flex items-center gap-2 border border-primary-foreground/30 px-7 h-12 rounded-md text-[15px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:bg-primary-foreground hover:text-primary">
          <Play className="w-4 h-4" /> 60-second tour
        </a>
      </div>
    </div>
  </section>
);

const LandingDashboard = () => (
  <div className="min-h-screen bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
    <Header />
    <HeroIntro />
    <Bento />
    <KpiStrip />
    <EditorialRows />
    <Closing />
    <PublicFooter />
  </div>
);

export default LandingDashboard;
