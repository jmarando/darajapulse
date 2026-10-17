import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PublicFooter from "@/components/PublicFooter";
import DemoRequestDialog from "@/components/DemoRequestDialog";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Clapperboard,
  FileSignature,
  LayoutTemplate,
  LineChart,
  Play,
  Store,
  Trophy,
  Wallet,
} from "lucide-react";
import dashboardImg from "@/assets/landing-dashboard.jpg";
import creatorImg from "@/assets/landing-creator.jpg";

/* ---------------------------------------------------------------- */
/* Daraja Pulse — Every creator. Every post. Every shilling.         */
/* ---------------------------------------------------------------- */

// Production totals on 17 Oct 2026, rounded down. Update as they grow.
const STATS = [
  { value: 195, suffix: "M+", label: "views measured" },
  { value: 3200, suffix: "+", label: "creators in Discovery" },
  { value: 1800, suffix: "+", label: "posts tracked live" },
  { value: 1100, suffix: "+", label: "contest entries scored" },
];

const PLATFORMS = ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook", "X", "Stories", "UGC contests"];

const STAGE_MS = 6000; // keep in step with .animate-progress in index.css

const STAGES = [
  {
    key: "brief",
    n: "01",
    title: "Brief & sign",
    icon: FileSignature,
    blurb: "One link per creator. They read the brief, sign the agreement and upload drafts. No PDFs over WhatsApp.",
  },
  {
    key: "approve",
    n: "02",
    title: "Approve drafts",
    icon: Clapperboard,
    blurb: "Videos play fast on any phone. Clients approve or ask for changes on a private review link.",
  },
  {
    key: "measure",
    n: "03",
    title: "Measure every post",
    icon: LineChart,
    blurb: "Views and engagement refresh on their own across TikTok, Instagram, YouTube, Facebook and X, with cross-posts grouped as one video.",
  },
  {
    key: "pay",
    n: "04",
    title: "Pay to the shilling",
    icon: Wallet,
    blurb: "Payment tiers and withholding tax worked out for every creator, with a CSV your finance team can use as is.",
  },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

const CAPABILITIES = [
  {
    icon: Trophy,
    title: "UGC contests that run themselves",
    desc: "Public entry pages, auto-scored leaderboards and transparent draws.",
  },
  {
    icon: BarChart3,
    title: "Reports clients actually open",
    desc: "Live report links, weekly email digests and one-click Excel, PowerPoint and PDF exports.",
  },
  {
    icon: LayoutTemplate,
    title: "Your brand, your workspace",
    desc: "Run on your own subdomain with your logo and colours. Clients get their own portal.",
  },
  {
    icon: Store,
    title: "A storefront for media houses",
    desc: "Package shows, presenters and creators into a public storefront brands can book from.",
  },
];

/* ---------------------------------------------------------------- */
/* Motion helpers                                                     */
/* ---------------------------------------------------------------- */

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return { ref, inView };
}

function CountUp({ to, start, duration = 1600 }: { to: number; start: boolean; duration?: number }) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setValue(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration, reduced]);
  return <>{value.toLocaleString("en-KE")}</>;
}

/* ---------------------------------------------------------------- */
/* Brand marks                                                        */
/* ---------------------------------------------------------------- */

/** The heartbeat from the logo, as crisp vector for dark and light backgrounds. */
function PulseMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" className={className} aria-hidden fill="none">
      <path
        d="M1 12 H24 L27 8.5 L29.5 15 L32.5 1.5 L37 22.5 L39.5 12 H63"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PULSE_PATH =
  "M0 100 h260 l20 -30 l15 55 l25 -107 l30 164 l20 -82 h430 l20 -30 l15 55 l25 -107 l30 164 l20 -82 h290";

/** Full-width monitor line with a bright beat travelling along it. */
function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden fill="none" className={`pointer-events-none ${className}`}>
      <path d={PULSE_PATH} pathLength={1000} className="stroke-accent/25" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path
        d={PULSE_PATH}
        pathLength={1000}
        className="stroke-accent animate-pulse-trace [filter:drop-shadow(0_0_6px_hsl(var(--accent)))]"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="160 1000"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function LiveDot({ tone = "accent" }: { tone?: "accent" | "success" }) {
  const bg = tone === "accent" ? "bg-accent" : "bg-success";
  return (
    <span className="relative flex size-2" aria-hidden>
      <span className={`absolute inset-0 rounded-full ${bg} animate-ping-soft`} />
      <span className={`relative size-2 rounded-full ${bg}`} />
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Sections                                                           */
/* ---------------------------------------------------------------- */

function TopNav({ onDemo }: { onDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={`sticky top-0 z-50 w-full text-background transition-[background-color,box-shadow] duration-300 ${
        scrolled ? "bg-foreground/90 backdrop-blur-md shadow-[0_1px_0_hsl(var(--background)/0.08)]" : "bg-foreground"
      }`}
    >
      <div className="flex h-16 md:h-20 items-center justify-between gap-3 px-5 md:px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <Link to="/" className="flex items-center gap-2 md:gap-2.5 min-w-0" aria-label="Daraja Pulse home">
          <PulseMark className="h-5 md:h-6 w-auto shrink-0 text-accent" />
          <span className="font-display text-[15px] md:text-lg font-bold uppercase tracking-[0.04em] md:tracking-[0.06em] whitespace-nowrap">Daraja Pulse</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-background/70">
          <a href="#how" className="hover:text-background transition-colors">How it works</a>
          <a href="#platform" className="hover:text-background transition-colors">Platform</a>
          <Link to="/discovery" className="hover:text-background transition-colors">Discovery</Link>
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <Link
            to="/auth"
            className="inline-flex h-10 items-center rounded-lg px-2.5 md:px-3 text-sm font-medium text-background/80 hover:text-background hover:bg-background/10 transition-[background-color,color,transform] active:scale-[0.96]"
          >
            Sign in
          </Link>
          <button
            onClick={onDemo}
            className="inline-flex h-10 items-center rounded-lg bg-accent px-3.5 md:px-4 text-sm font-semibold text-accent-foreground hover:brightness-110 transition-[filter,transform] active:scale-[0.96]"
          >
            {/* The hero repeats the full call to action right below on phones. */}
            <span className="sm:hidden">Demo</span>
            <span className="hidden sm:inline">Book a demo</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function FloatingChip({ className, delay, children }: { className: string; delay: string; children: ReactNode }) {
  return (
    <div
      className={`absolute hidden sm:flex items-center gap-2.5 rounded-xl bg-background px-3.5 py-2.5 text-xs font-medium text-foreground shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.06)] animate-float ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative [perspective:1800px]">
      <div aria-hidden className="absolute -inset-6 md:-inset-10 rounded-[3rem] bg-accent/25 blur-3xl" />
      <div className="relative rounded-2xl bg-background/10 p-2 ring-1 ring-background/15 shadow-[0_50px_100px_-30px_rgba(0,0,0,0.75)] [transform:rotateY(-8deg)_rotateX(4deg)] lg:[transform:rotateY(-16deg)_rotateX(8deg)_rotateZ(1deg)] transition-transform duration-700 ease-out hover:[transform:rotateY(0deg)_rotateX(0deg)_rotateZ(0deg)]">
        <img src={dashboardImg} alt="Daraja Pulse campaign dashboard" width={1536} height={1024} className="w-full rounded-lg" />
      </div>
      <FloatingChip className="-left-4 top-[10%]" delay="0s">
        <span className="grid size-6 place-items-center rounded-full bg-success/15 text-success">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        Draft approved by client
      </FloatingChip>
      <FloatingChip className="-right-3 top-[42%]" delay="1.4s">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">TikTok</span>
        <span className="font-semibold tabular-nums">48.2K views</span>
        <span className="text-success tabular-nums">+12%</span>
      </FloatingChip>
      <FloatingChip className="left-[10%] -bottom-5" delay="2.6s">
        <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-accent">
          <Wallet className="size-3.5" />
        </span>
        Payout ready
        <span className="font-semibold tabular-nums">KES 28,500</span>
      </FloatingChip>
    </div>
  );
}

function StatsBand() {
  const { ref, inView } = useInView<HTMLUListElement>();
  return (
    <div className="px-5 md:px-6 lg:px-16 max-w-screen-2xl mx-auto pb-16 md:pb-20">
      <ul
        ref={ref}
        className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl bg-background/10 ring-1 ring-background/10"
      >
        {STATS.map((s) => (
          <li key={s.label} className="bg-foreground px-5 py-7 md:px-8 md:py-9">
            <span className="sr-only">
              {s.value.toLocaleString("en-KE")}
              {s.suffix} {s.label}
            </span>
            <span aria-hidden className="block font-display text-4xl md:text-6xl font-semibold tracking-[-0.045em] tabular-nums">
              <CountUp to={s.value} start={inView} />
              <span className="text-accent">{s.suffix}</span>
            </span>
            <span aria-hidden className="mt-2 block text-sm text-background/60">{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-background/40">Measured on Daraja Pulse · October 2026</p>
    </div>
  );
}

function Hero({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="relative isolate overflow-hidden bg-foreground text-background">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_85%_8%,hsl(var(--accent)/0.30),transparent_70%),radial-gradient(40%_40%_at_0%_95%,hsl(var(--accent)/0.12),transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(hsl(var(--background))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--background))_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
      />
      <div className="px-5 md:px-6 lg:px-16 max-w-screen-2xl mx-auto pt-14 md:pt-20 lg:pt-24 grid lg:grid-cols-12 gap-14 lg:gap-10 items-center">
        <div className="lg:col-span-7">
          <div className="animate-enter inline-flex items-center gap-2.5 rounded-full bg-background/5 px-3.5 py-1.5 ring-1 ring-background/15">
            <LiveDot />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-background/80">The influence OS for East Africa</span>
          </div>
          <h1 className="mt-7 font-display font-semibold leading-[0.92] tracking-[-0.045em] text-[clamp(3rem,6.6vw,6.25rem)]">
            <span className="block animate-enter" style={{ animationDelay: "80ms" }}>Every creator.</span>
            <span className="block animate-enter" style={{ animationDelay: "200ms" }}>Every post.</span>
            <span className="block animate-enter font-serif italic font-normal tracking-[-0.02em] text-accent" style={{ animationDelay: "320ms" }}>
              Every shilling.
            </span>
          </h1>
          <p className="mt-7 max-w-xl text-lg md:text-xl leading-relaxed text-background/70 animate-enter" style={{ animationDelay: "440ms" }}>
            Brief and sign creators, approve their drafts, track every post across TikTok, Instagram, YouTube, Facebook and X,
            and work out every payout. One platform, built for how campaigns run here.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 animate-enter" style={{ animationDelay: "560ms" }}>
            <button
              onClick={onDemo}
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 text-[15px] font-semibold text-accent-foreground shadow-[0_18px_40px_-14px_hsl(var(--accent)/0.75)] hover:brightness-110 transition-[filter,transform] active:scale-[0.96]"
            >
              Book a demo
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <Link
              to="/discovery"
              className="group inline-flex items-center justify-center gap-2 rounded-xl px-7 py-4 text-[15px] font-medium ring-1 ring-background/25 hover:bg-background/10 transition-[background-color,transform] active:scale-[0.96]"
            >
              Browse 3,200+ creators
              <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.18em] text-background/45 text-balance animate-enter" style={{ animationDelay: "680ms" }}>
            {/* Non-breaking spaces keep each dot at the end of a line, never the start. */}
            Built in Nairobi{" "}· Kenya{" "}· Uganda{" "}· Tanzania
          </p>
        </div>
        <div className="lg:col-span-5 animate-enter" style={{ animationDelay: "300ms" }}>
          <HeroVisual />
        </div>
      </div>
      <PulseLine className="block h-24 md:h-36 w-full mt-6 md:mt-2" />
      <StatsBand />
    </section>
  );
}

function PlatformMarquee() {
  return (
    <section aria-label="Platforms covered" className="group relative overflow-hidden border-b border-border bg-background py-8 md:py-10">
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
            {PLATFORMS.map((p, i) => (
              <li key={p} className="flex items-center">
                <span
                  className={`px-7 md:px-10 font-display text-4xl md:text-6xl font-semibold tracking-[-0.04em] whitespace-nowrap ${
                    i % 2 ? "text-transparent [-webkit-text-stroke:1.5px_hsl(var(--foreground))]" : "text-foreground"
                  }`}
                >
                  {p}
                </span>
                <PulseMark className="h-5 md:h-7 w-auto text-accent" />
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 md:w-32 bg-gradient-to-r from-background to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 md:w-32 bg-gradient-to-l from-background to-transparent" />
    </section>
  );
}

/** Product vignette frame. Outer radius 24px = inner 12px + 12px padding. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-secondary/70 p-3 ring-1 ring-border">
      <div className="overflow-hidden rounded-xl bg-card shadow-elegant ring-1 ring-border">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-2.5 rounded-full bg-accent/70" />
          <span className="size-2.5 rounded-full bg-highlight/70" />
          <span className="size-2.5 rounded-full bg-success/60" />
          <span className="ml-3 truncate font-mono text-[11px] text-muted-foreground">{label}</span>
        </div>
        <div className="p-5 md:p-7">{children}</div>
      </div>
    </div>
  );
}

function BriefVisual() {
  return (
    <Frame label="darajapulse.com/brief/…">
      <span className="inline-flex rounded-full bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">Campaign brief</span>
      <h3 className="mt-3 font-display text-2xl md:text-3xl font-semibold tracking-tight">Festive season launch</h3>
      <p className="mt-1 text-sm text-muted-foreground">1 Nov – 15 Dec · #ShareTheFeast</p>
      <ul className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
        {["2 × TikTok video", "1 × Instagram Reel", "3 × Stories"].map((d) => (
          <li key={d} className="rounded-lg bg-secondary px-3 py-1.5">{d}</li>
        ))}
      </ul>
      <div className="mt-6 rounded-xl p-4 ring-1 ring-border">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Creator agreement</span>
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <Check className="size-4" strokeWidth={2.5} /> Signed
          </span>
        </div>
        <svg viewBox="0 0 160 40" className="mt-2 h-10 w-40 text-foreground" aria-hidden fill="none">
          <path d="M4 30 C 18 6, 30 38, 42 20 S 64 6, 74 24 S 98 36, 112 14 S 140 22, 156 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      <div className="mt-6">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Signed on the roster</span>
          <span className="font-semibold tabular-nums">128 / 135</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[95%] rounded-full bg-accent" />
        </div>
      </div>
    </Frame>
  );
}

function ApproveVisual() {
  return (
    <Frame label="Client review link">
      <div className="grid gap-5 sm:grid-cols-[170px_1fr]">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-xl bg-foreground">
          <img src={creatorImg} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <span className="absolute inset-0 m-auto grid size-12 place-items-center rounded-full bg-background/90 text-foreground shadow-soft">
            <Play className="size-5 translate-x-px" fill="currentColor" />
          </span>
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">0:42</span>
        </div>
        <div className="flex flex-col">
          <div className="text-sm">
            <span className="font-semibold">Draft 2</span>
            <span className="text-muted-foreground"> · TikTok · uploaded 9 min ago</span>
          </div>
          <div className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm leading-relaxed">
            “Love the energy. Can we see the pack in the first three seconds?”
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Brand manager · 2 min ago</div>
          <div className="mt-auto flex gap-2 pt-6">
            <span className="flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-medium ring-1 ring-border">Request changes</span>
            <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-2.5 text-sm font-semibold text-white">
              <Check className="size-4" strokeWidth={2.5} /> Approve
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

const PLATFORM_ROWS = [
  { name: "TikTok", views: 48200 },
  { name: "Instagram", views: 21700 },
  { name: "Facebook", views: 6100 },
];

function MeasureVisual() {
  const total = PLATFORM_ROWS.reduce((sum, p) => sum + p.views, 0);
  const max = PLATFORM_ROWS[0].views;
  const line = "0,70 30,64 60,58 90,61 120,46 150,41 180,31 210,27 240,18 270,13 300,8";
  return (
    <Frame label="Campaign › Creative #14">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">1 video · 3 platforms</span>
          <div className="mt-1 font-display text-4xl font-semibold tracking-[-0.04em] tabular-nums">
            {total.toLocaleString("en-KE")} <span className="text-base font-medium text-muted-foreground">views</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
          <LiveDot tone="success" /> Refreshed 12 min ago
        </span>
      </div>
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="mt-5 h-20 w-full" aria-hidden>
        <defs>
          <linearGradient id="measure-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`${line} 300,80 0,80`} fill="url(#measure-fill)" />
        <polyline points={line} fill="none" stroke="hsl(var(--accent))" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <ul className="mt-5 space-y-3">
        {PLATFORM_ROWS.map((p) => (
          <li key={p.name} className="grid grid-cols-[84px_1fr_64px] items-center gap-3 text-sm">
            <span className="font-medium">{p.name}</span>
            <span className="h-2 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(p.views / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{(p.views / 1000).toFixed(1)}K</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function PayVisual() {
  const rows: [string, string][] = [
    ["Best reel", "52,300 views"],
    ["Tier", "50,000 – 69,999 views"],
    ["Gross", "KES 30,000"],
    ["Withholding tax (5%)", "– KES 1,500"],
  ];
  return (
    <Frame label="Payments › Finalise">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Creator payout</span>
          <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">Festive season launch</h3>
        </div>
        <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">Finalised</span>
      </div>
      <dl className="mt-5 divide-y divide-border overflow-hidden rounded-xl ring-1 ring-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 bg-secondary/60 px-4 py-4">
          <dt className="font-semibold">Net payable</dt>
          <dd className="font-display text-2xl font-semibold tracking-tight tabular-nums">KES 28,500</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">135 creators · ready for finance</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 font-medium text-background">
          Export CSV <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Frame>
  );
}

const STAGE_VISUALS: Record<StageKey, () => JSX.Element> = {
  brief: BriefVisual,
  approve: ApproveVisual,
  measure: MeasureVisual,
  pay: PayVisual,
};

function Lifecycle() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Auto-advance through the stages until someone hovers or focuses the section.
  useEffect(() => {
    if (paused || reduced) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STAGES.length), STAGE_MS);
    return () => window.clearTimeout(t);
  }, [active, paused, reduced]);

  const select = (i: number) => {
    setActive(i);
    tabs.current[i]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      select((active + 1) % STAGES.length);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      select((active + STAGES.length - 1) % STAGES.length);
    }
  };

  return (
    <section
      id="how"
      className="scroll-mt-20 bg-background py-24 md:py-32"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="px-5 md:px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="mb-12 md:mb-16 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">How it works</span>
          <h2 className="mt-3 font-display text-4xl md:text-6xl font-semibold tracking-[-0.04em] text-balance">
            From brief to payout. <span className="font-serif italic font-normal text-accent">One pulse.</span>
          </h2>
        </div>
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div role="tablist" aria-orientation="vertical" aria-label="Campaign stages" onKeyDown={onKeyDown} className="flex flex-col gap-2 lg:col-span-5">
            {STAGES.map((s, i) => {
              const on = i === active;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  role="tab"
                  id={`stage-tab-${s.key}`}
                  aria-selected={on}
                  aria-controls={`stage-panel-${s.key}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={`relative overflow-hidden rounded-2xl p-5 text-left transition-[background-color,box-shadow] md:p-6 ${
                    on ? "bg-card shadow-elegant ring-1 ring-border" : "hover:bg-secondary/60"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className={`pt-1.5 font-mono text-xs tracking-wider ${on ? "text-accent" : "text-muted-foreground"}`}>{s.n}</span>
                    <div className="min-w-0">
                      <span className="flex items-center gap-2.5">
                        <Icon className={`size-5 shrink-0 ${on ? "text-accent" : "text-muted-foreground"}`} strokeWidth={1.75} />
                        <span className="font-display text-xl md:text-2xl font-semibold tracking-tight">{s.title}</span>
                      </span>
                      <span
                        className={`grid transition-[grid-template-rows,opacity,margin] duration-500 ${
                          on ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <span className="overflow-hidden text-sm md:text-base leading-relaxed text-muted-foreground">{s.blurb}</span>
                      </span>
                    </div>
                  </div>
                  {on && !reduced && (
                    <span
                      key={active}
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-accent animate-progress"
                      style={{ animationPlayState: paused ? "paused" : "running" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="lg:col-span-7">
            {STAGES.map((s, i) => {
              const Visual = STAGE_VISUALS[s.key];
              return (
                <div key={s.key} role="tabpanel" id={`stage-panel-${s.key}`} aria-labelledby={`stage-tab-${s.key}`} hidden={i !== active} className="animate-enter">
                  <Visual />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function DiscoveryCard() {
  const split = [
    { country: "Kenya", count: "2,400+", share: 100 },
    { country: "Uganda", count: "700+", share: 29 },
    { country: "Tanzania", count: "40+", share: 4 },
  ];
  return (
    <article className="relative isolate flex flex-col justify-between overflow-hidden rounded-3xl bg-foreground p-8 text-background md:p-10 lg:col-span-6 lg:row-span-2">
      <div aria-hidden className="absolute -right-24 -top-24 -z-10 size-80 rounded-full bg-accent/30 blur-3xl" />
      <div>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Creator Discovery</span>
        <h3 className="mt-4 font-display text-5xl md:text-7xl font-semibold tracking-[-0.045em] tabular-nums">3,200+</h3>
        <p className="mt-3 max-w-md text-lg leading-relaxed text-background/70">
          East African creators, searchable by platform, niche, city and engagement. Shortlist in minutes, not weeks of DMs.
        </p>
      </div>
      <ul className="mt-10 space-y-3">
        {split.map((r) => (
          <li key={r.country} className="grid grid-cols-[84px_1fr_64px] items-center gap-3 text-sm">
            <span className="text-background/80">{r.country}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-background/10">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${r.share}%` }} />
            </span>
            <span className="text-right tabular-nums text-background/60">{r.count}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/discovery"
        className="group mt-10 inline-flex w-fit items-center gap-2 rounded-xl bg-background px-5 py-3 text-sm font-semibold text-foreground hover:bg-background/90 transition-[background-color,transform] active:scale-[0.96]"
      >
        Browse Discovery
        <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
    </article>
  );
}

function Platform() {
  return (
    <section id="platform" className="scroll-mt-20 border-y border-border bg-secondary/40 py-24 md:py-32">
      <div className="px-5 md:px-6 lg:px-16 max-w-screen-2xl mx-auto">
        <div className="mb-12 md:mb-16 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">The platform</span>
          <h2 className="mt-3 font-display text-4xl md:text-6xl font-semibold tracking-[-0.04em] text-balance">
            Everything a creator campaign needs. <span className="font-serif italic font-normal text-accent">Nothing it doesn’t.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-12">
          <DiscoveryCard />
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <article
                key={c.title}
                className="group rounded-3xl bg-card p-7 shadow-soft ring-1 ring-border transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-elegant md:p-8 lg:col-span-3"
              >
                <div className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110">
                  <Icon className="size-6" strokeWidth={1.5} />
                </div>
                <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTA({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="relative isolate overflow-hidden bg-foreground text-background">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_100%,hsl(var(--accent)/0.28),transparent_70%)]"
      />
      <PulseLine className="absolute inset-x-0 bottom-0 -z-10 h-28 md:h-36 w-full opacity-70" />
      <div className="px-5 md:px-6 lg:px-16 max-w-screen-2xl mx-auto py-28 text-center md:py-40">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-background/50">Influence, measured.</span>
        <h2 className="mx-auto mt-5 max-w-5xl font-display text-5xl md:text-8xl font-semibold tracking-[-0.045em] text-balance">
          Feel the <span className="font-serif italic font-normal text-accent">pulse</span> of every campaign.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-background/70">
          See your next campaign run end to end, from brief to payout, in a live walkthrough.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={onDemo}
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-4 text-[15px] font-semibold text-accent-foreground shadow-[0_18px_40px_-14px_hsl(var(--accent)/0.75)] hover:brightness-110 transition-[filter,transform] active:scale-[0.96]"
          >
            Book a demo
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-xl px-8 py-4 text-[15px] font-medium ring-1 ring-background/25 hover:bg-background/10 transition-[background-color,transform] active:scale-[0.96]"
          >
            Sign in
          </Link>
        </div>
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
        <PlatformMarquee />
        <Lifecycle />
        <Platform />
        <FinalCTA onDemo={openDemo} />
      </main>
      <PublicFooter />
      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
