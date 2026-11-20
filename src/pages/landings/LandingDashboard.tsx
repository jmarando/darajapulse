import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PublicFooter from "@/components/PublicFooter";
import DemoRequestDialog from "@/components/DemoRequestDialog";
import { ArrowRight, ArrowUpRight, BarChart3, Check, LayoutTemplate, Play, Store, Trophy } from "lucide-react";
import creatorImg from "@/assets/landing-creator.webp";

/* ---------------------------------------------------------------- */
/* Daraja Pulse — Every creator. Every post. Every shilling.         */
/* A white page with cool greys and the brand red: the `daylight`    */
/* theme in index.css. No dark sections.                             */
/* ---------------------------------------------------------------- */

// Production totals on 17 Oct 2026, rounded down. Update as they grow.
const STATS = [
  { value: 195, suffix: "M+", label: "views measured" },
  { value: 3200, suffix: "+", label: "creators in Discovery" },
  { value: 1800, suffix: "+", label: "posts tracked live" },
  { value: 1100, suffix: "+", label: "contest entries scored" },
];

const CAPABILITIES = [
  {
    icon: Trophy,
    title: "UGC contests that run themselves",
    desc: "Public entry pages, auto-scored leaderboards and transparent draws.",
  },
  {
    icon: BarChart3,
    title: "Reports clients actually open",
    desc: "A live link, a weekly email, and Excel, PowerPoint or PDF in one click.",
  },
  {
    icon: LayoutTemplate,
    title: "Your brand, your workspace",
    desc: "Run on your own subdomain with your logo and colours. Clients get their own portal.",
  },
  {
    icon: Store,
    title: "A storefront for media houses",
    desc: "Shows, presenters and rate cards on one public page. Brands plan, book and pay there.",
  },
];

/** The text column, and the wider one the product stage and the closing panel sit in. */
const WRAP = "mx-auto w-full max-w-[1240px] px-5 md:px-8 lg:px-16";
const WIDE = "mx-auto w-full max-w-[1400px] px-3 md:px-6 lg:px-8";

/** Faint graph paper behind the product stage and the closing panel. */
const GRAPH_PAPER =
  "bg-secondary [background-image:linear-gradient(hsl(var(--border)/0.65)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.65)_1px,transparent_1px)] [background-size:32px_32px] [background-position:-1px_-1px]";

const BUTTON =
  "group inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-7 text-[15px] transition-[filter,background-color,transform] active:scale-[0.96]";
const BUTTON_PRIMARY = `${BUTTON} bg-accent-strong font-semibold text-white hover:brightness-110`;
const BUTTON_QUIET = `${BUTTON} border border-input bg-background font-medium hover:bg-secondary`;

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

/** The browser bar on a phone follows this page (white) and goes back to the app's colour on leaving. */
function useThemeColor(color: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = color;
    return () => {
      meta.content = previous;
    };
  }, [color]);
}

/* ---------------------------------------------------------------- */
/* Brand marks                                                        */
/* ---------------------------------------------------------------- */

/** The heartbeat from the logo, as crisp vector. */
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

/** A monitor line with a beat travelling along it. */
function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden fill="none" className={`pointer-events-none ${className}`}>
      <path d={PULSE_PATH} pathLength={1000} className="stroke-accent/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path
        d={PULSE_PATH}
        pathLength={1000}
        className="stroke-accent animate-pulse-trace"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="160 1000"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function LiveDot() {
  return (
    <span className="relative flex size-1.5" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-success animate-ping-soft" />
      <span className="relative size-1.5 rounded-full bg-success" />
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
      className={`sticky top-0 z-50 w-full bg-background/90 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "shadow-[0_1px_0_hsl(var(--border))]" : ""
      }`}
    >
      <div className={`${WRAP} flex h-16 items-center justify-between gap-3 md:h-[72px]`}>
        <Link to="/" className="flex min-w-0 items-center gap-2 md:gap-2.5" aria-label="Daraja Pulse home">
          <PulseMark className="h-5 w-auto shrink-0 text-accent md:h-[21px]" />
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em] whitespace-nowrap md:text-[17px] md:tracking-[0.06em]">Daraja Pulse</span>
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#how" className="inline-flex h-11 items-center transition-colors hover:text-foreground">How it works</a>
          <a href="#listening" className="inline-flex h-11 items-center transition-colors hover:text-foreground">Listening</a>
          <a href="#platform" className="inline-flex h-11 items-center transition-colors hover:text-foreground">Platform</a>
          <Link to="/discovery" className="inline-flex h-11 items-center transition-colors hover:text-foreground">Discovery</Link>
        </div>
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <Link
            to="/auth"
            className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium transition-[background-color,transform] hover:bg-secondary active:scale-[0.96]"
          >
            Sign in
          </Link>
          <button
            onClick={onDemo}
            className="inline-flex h-11 items-center rounded-full bg-accent-strong px-4 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] md:px-[18px]"
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

function Hero({ onDemo }: { onDemo: () => void }) {
  return (
    <section className={`${WRAP} pt-11 text-center md:pt-16 lg:pt-[88px]`}>
      {/* The headline and intro paint immediately (no fade-in): they are the page's
          largest content, and hiding them delays Largest Contentful Paint. */}
      <h1 className="font-display text-[clamp(2.625rem,5.9vw,5.375rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
        {/* Two phrases that share a line when there is room, and break between them when there is not. */}
        <span className="inline-block">Every creator.</span> <span className="inline-block">Every post.</span>{" "}
        <span className="block text-accent">Every shilling.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-[1.55] text-muted-foreground md:text-xl md:leading-[1.55]">
        Run creator campaigns from brief to payout. Track every post without a single screenshot. Hear what people are
        saying about your brand, every hour. Built for how marketing runs here.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 animate-enter sm:flex-row" style={{ animationDelay: "120ms" }}>
        <button onClick={onDemo} className={BUTTON_PRIMARY}>
          Book a demo
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <Link to="/discovery" className={BUTTON_QUIET}>
          Browse 3,200+ creators
          <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

/* The four steps, each with a small picture of the product at that step. The
   pictures are illustrations with made-up figures, so screen readers skip them. */

function StepCard({ n, title, blurb, children }: { n: string; title: string; blurb: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col rounded-[18px] border border-border bg-card p-[18px] shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_12px_24px_-18px_hsl(var(--foreground)/0.18)]">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] border-accent-strong font-mono text-[11px] font-medium text-accent-strong">
          {n}
        </span>
        <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em]">{title}</h3>
      </div>
      {/* Four across, the blurbs get the same room so the pictures line up. */}
      <p className="mt-2.5 text-[13.5px] leading-normal text-muted-foreground xl:min-h-[82px]">{blurb}</p>
      <div aria-hidden className="mt-3.5 flex flex-1 flex-col rounded-xl border border-border/70 bg-secondary/60 p-3.5">
        {children}
      </div>
    </li>
  );
}

function BriefVisual() {
  return (
    <>
      <span className="self-start rounded-full bg-accent/[0.07] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.08em] text-accent-strong">Campaign brief</span>
      <p className="mt-2.5 font-display text-base font-semibold tracking-[-0.01em]">Festive season launch</p>
      <p className="mt-0.5 text-xs text-muted-foreground">1 Nov – 15 Dec · #ShareTheFeast</p>
      <div className="mt-4 flex items-center justify-between gap-2 text-[12.5px]">
        <span className="font-medium">Creator agreement</span>
        <span className="inline-flex items-center gap-1 font-medium text-success">
          <Check className="size-3.5" strokeWidth={2.5} /> Signed
        </span>
      </div>
      <svg viewBox="0 0 160 40" className="mt-1 h-8 w-32 text-foreground" fill="none">
        <path d="M4 30 C 18 6, 30 38, 42 20 S 64 6, 74 24 S 98 36, 112 14 S 140 22, 156 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <div className="mt-3.5 flex justify-between gap-2 text-[12.5px]">
        <span className="text-muted-foreground">Signed on the roster</span>
        <span className="font-semibold tabular-nums">128 / 135</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full w-[95%] rounded-full bg-accent" />
      </div>
    </>
  );
}

function ApproveVisual() {
  return (
    <>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[10px] bg-border">
        <img src={creatorImg} alt="" decoding="async" className="h-full w-full object-cover object-[50%_24%]" />
        <span className="absolute inset-0 m-auto grid size-10 place-items-center rounded-full bg-white/90 text-foreground">
          <Play className="size-4 translate-x-px" fill="currentColor" />
        </span>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">0:42</span>
      </div>
      <p className="mt-2.5 text-[12.5px]">
        <span className="font-semibold">Draft 2</span>
        <span className="text-muted-foreground"> · TikTok · uploaded 9 min ago</span>
      </p>
      <p className="mt-2 rounded-[10px] bg-secondary px-3 py-2.5 text-[12.5px] leading-[1.45]">
        “Love the energy. Can we see the pack in the first three seconds?”
      </p>
      <div className="mt-2.5 flex gap-2 text-xs">
        <span className="flex-[1.3] whitespace-nowrap rounded-lg border border-input bg-card px-1.5 py-2 text-center font-medium">Request changes</span>
        <span className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-success px-1.5 py-2 font-semibold text-white">
          <Check className="size-3.5" strokeWidth={2.5} /> Approve
        </span>
      </div>
    </>
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
    <>
      <p className="text-xs text-muted-foreground">1 video · 3 platforms</p>
      <p className="mt-1.5 font-display text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
        {total.toLocaleString("en-KE")} <span className="text-[13px] font-medium tracking-normal text-muted-foreground">views</span>
      </p>
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="mt-3 h-[60px] w-full">
        <polygon points={`${line} 300,80 0,80`} className="fill-accent/10" />
        <polyline points={line} fill="none" className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <ul className="mt-3 space-y-[9px]">
        {PLATFORM_ROWS.map((p) => (
          <li key={p.name} className="grid grid-cols-[66px_1fr_40px] items-center gap-2 text-[12.5px]">
            <span className="font-medium">{p.name}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-border">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(p.views / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{(p.views / 1000).toFixed(1)}K</span>
          </li>
        ))}
      </ul>
      <p className="mt-3.5 flex items-center gap-1.5 text-xs font-medium text-success">
        <LiveDot /> Refreshed 12 min ago
      </p>
    </>
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
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Creator payout</span>
        <span className="rounded-full bg-success/10 px-2 py-[3px] text-[11.5px] font-medium text-success">Finalised</span>
      </div>
      <dl className="mt-3 space-y-[9px] text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1 border-t border-border pt-3">
        <span className="text-[13px] font-semibold">Net payable</span>
        <span className="whitespace-nowrap font-display text-xl font-semibold tracking-[-0.02em] tabular-nums">KES 28,500</span>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <span className="text-xs text-muted-foreground">135 creators · ready for finance</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-[7px] text-xs font-medium text-background">
          Export CSV <ArrowRight className="size-3" />
        </span>
      </div>
    </>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Brief & sign",
    blurb: "One link per creator. They read the brief, sign and upload their drafts. No PDFs over WhatsApp.",
    Visual: BriefVisual,
  },
  {
    n: "02",
    title: "Approve drafts",
    blurb: "Drafts play fast on any phone. Your client approves or asks for changes on a private link.",
    Visual: ApproveVisual,
  },
  {
    n: "03",
    title: "Measure every post",
    blurb: "Views and engagement update on their own across TikTok, Instagram, YouTube, Facebook and X. Cross-posts count as one video.",
    Visual: MeasureVisual,
  },
  {
    n: "04",
    title: "Pay to the shilling",
    blurb: "Tiers and withholding tax worked out for every creator. Finance gets a CSV it can use as is.",
    Visual: PayVisual,
  },
];

function Steps() {
  return (
    <section id="how" aria-labelledby="how-title" className={`${WIDE} scroll-mt-20 pt-9 md:pt-14 lg:pt-[72px]`}>
      <div className={`rounded-[20px] border border-border p-3.5 md:rounded-[32px] md:p-6 lg:p-8 ${GRAPH_PAPER}`}>
        <h2 id="how-title" className="flex items-center gap-4 px-1 pb-4 font-mono text-[11px] font-normal uppercase tracking-[0.18em] md:pb-[18px]">
          <span className="sr-only whitespace-nowrap text-muted-foreground sm:not-sr-only">From brief to payout</span>
          <PulseLine className="h-[34px] min-w-0 flex-1" />
          <span className="whitespace-nowrap text-accent-strong">One pulse</span>
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4 xl:gap-5">
          {STEPS.map(({ Visual, ...step }) => (
            <StepCard key={step.n} {...step}>
              <Visual />
            </StepCard>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Stats() {
  const { ref, inView } = useInView<HTMLUListElement>();
  return (
    <section aria-label="Daraja Pulse in numbers" className={`${WRAP} pt-10 text-center md:pt-16`}>
      <ul ref={ref} className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
        {STATS.map((s) => (
          <li key={s.label}>
            <span className="sr-only">
              {s.value.toLocaleString("en-KE")}
              {s.suffix} {s.label}
            </span>
            <span aria-hidden className="block font-display text-[clamp(2.5rem,4.4vw,4rem)] font-semibold leading-none tracking-[-0.045em] tabular-nums">
              <CountUp to={s.value} start={inView} />
              <span className="text-accent">{s.suffix}</span>
            </span>
            <span aria-hidden className="mt-2.5 block text-[15px] text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Measured on Daraja Pulse · October 2026</p>
    </section>
  );
}

/* Beyond the campaign: what people say about the brand, and how its own pages do.
   The pictures are illustrations with made-up figures, as in the steps above. */

function FeatureCard({ label, title, body, children }: { label: string; title: string; body: string; children: ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-6 md:p-8">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent-strong">{label}</span>
      <h3 className="mt-3.5 font-display text-2xl font-semibold leading-tight tracking-[-0.03em] md:text-[28px]">{title}</h3>
      <p className="mt-2.5 max-w-[520px] text-[15px] leading-[1.55] text-muted-foreground md:text-base md:leading-[1.55]">{body}</p>
      <div aria-hidden className="mt-6 flex flex-1 flex-col rounded-2xl border border-border/70 bg-secondary/60 p-4 md:p-5">
        {children}
      </div>
    </article>
  );
}

function ListeningVisual() {
  const voices = [
    { name: "Your brand", share: 46 },
    { name: "Competitor A", share: 31 },
    { name: "Competitor B", share: 23 },
  ];
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-accent-strong">
          <span className="size-1.5 rounded-full bg-accent" /> Alert email
        </p>
        <p className="mt-2 font-display text-[15px] font-semibold leading-snug tracking-[-0.01em]">
          A negative post about your brand is picking up: 12k views.
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">TikTok · posted 2 hours ago</p>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Share of voice · last 7 days</p>
      <ul className="mt-2.5 space-y-[9px]">
        {voices.map((v, i) => (
          <li key={v.name} className="grid grid-cols-[104px_1fr_36px] items-center gap-2 text-[12.5px]">
            <span className="font-medium">{v.name}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-border">
              <span className={`block h-full rounded-full ${i === 0 ? "bg-accent" : "bg-foreground/35"}`} style={{ width: `${(v.share / voices[0].share) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{v.share}%</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        <div className="flex h-1.5 overflow-hidden rounded-full">
          <span className="bg-success" style={{ width: "58%" }} />
          <span className="bg-foreground/20" style={{ width: "30%" }} />
          <span className="bg-accent" style={{ width: "12%" }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Mood: 58% positive · 30% neutral · 12% negative</p>
      </div>
    </>
  );
}

function ChannelsVisual() {
  const accounts = [
    { name: "Facebook", followers: "48.1K", posts: 14, views: "182K" },
    { name: "Instagram", followers: "36.4K", posts: 22, views: "96K" },
    { name: "TikTok", followers: "21.9K", posts: 9, views: "241K" },
  ];
  const columns = "grid grid-cols-[1fr_62px_38px_48px] items-center gap-2";
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Organic report · October</span>
        <span className="whitespace-nowrap rounded-full bg-success/10 px-2 py-[3px] text-[11.5px] font-medium text-success">Emailed monthly</span>
      </div>
      <div className={`${columns} mt-4 border-b border-border pb-2 text-[11px] text-muted-foreground`}>
        <span>By account</span>
        <span className="text-right">Followers</span>
        <span className="text-right">Posts</span>
        <span className="text-right">Views</span>
      </div>
      <ul className="divide-y divide-border/70 text-[12.5px]">
        {accounts.map((a) => (
          <li key={a.name} className={`${columns} py-2.5`}>
            <span className="font-medium">{a.name}</span>
            <span className="text-right tabular-nums text-muted-foreground">{a.followers}</span>
            <span className="text-right tabular-nums text-muted-foreground">{a.posts}</span>
            <span className="text-right font-medium tabular-nums">{a.views}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1 border-t border-border pt-3">
        <span className="text-[13px] font-semibold">What worked</span>
        <span className="text-[12.5px] text-muted-foreground">Reels, 11.2K views a post</span>
      </div>
    </>
  );
}

function Listening() {
  return (
    <section id="listening" className={`${WRAP} scroll-mt-20 pt-[72px] md:pt-24 lg:pt-[120px]`}>
      <div className="max-w-[960px]">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent-strong">Beyond the campaign</span>
        <h2 className="mt-3.5 font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
          Hear what people are saying. <span className="text-muted-foreground/80 lg:block">See how your own pages are doing.</span>
        </h2>
      </div>
      <div className="mt-8 grid gap-4 md:mt-12 lg:mt-14 lg:grid-cols-2">
        <FeatureCard
          label="Social listening"
          title="Catch it while it’s still small."
          body="Pulse checks TikTok, Instagram and YouTube every hour for your brand, your competitors and your category, and reads the mood of each post. When a negative post starts picking up, the people you choose get an email."
        >
          <ListeningVisual />
        </FeatureCard>
        <FeatureCard
          label="Brand channels"
          title="Your own pages, in one report."
          body="Add your Facebook, Instagram and TikTok pages. Pulse pulls the numbers every night and sends the organic report every month, as a link, an email or a deck."
        >
          <ChannelsVisual />
        </FeatureCard>
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
    <article className="flex flex-col justify-between gap-8 rounded-3xl bg-accent/[0.06] p-6 md:col-span-2 md:p-10 lg:col-span-6 lg:row-span-2">
      <div>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent-strong">Creator Discovery</span>
        <h3 className="mt-3.5 font-display text-[clamp(3.5rem,7vw,6.5rem)] font-semibold leading-[0.95] tracking-[-0.05em] tabular-nums">
          3,200<span className="text-accent">+</span>
        </h3>
        <p className="mt-3.5 max-w-[440px] text-[17px] leading-[1.55] text-muted-foreground">
          East African creators, searchable by platform, niche, city and engagement. Shortlist in minutes, not weeks of DMs.
        </p>
      </div>
      <ul className="space-y-3">
        {split.map((r) => (
          <li key={r.country} className="grid grid-cols-[84px_1fr_64px] items-center gap-3 text-sm">
            <span className="font-medium">{r.country}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-accent/[0.18]">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${r.share}%` }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{r.count}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/discovery"
        className="group inline-flex h-12 w-fit items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-[background-color,transform] hover:bg-foreground/90 active:scale-[0.96]"
      >
        Browse Discovery
        <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
    </article>
  );
}

function Platform() {
  return (
    <section id="platform" className={`${WRAP} scroll-mt-20 pt-[72px] md:pt-24 lg:pt-[120px]`}>
      <div className="max-w-[820px]">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent-strong">The influencer marketing platform</span>
        <h2 className="mt-3.5 font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
          Everything a creator campaign needs. <span className="text-muted-foreground/80">Nothing it doesn’t.</span>
        </h2>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-2 lg:mt-14 lg:grid-cols-12">
        <DiscoveryCard />
        {CAPABILITIES.map((c) => {
          const Icon = c.icon;
          return (
            <article
              key={c.title}
              className="rounded-3xl border border-border bg-card p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-elegant lg:col-span-3"
            >
              <div className="grid size-11 place-items-center rounded-xl bg-secondary text-accent-strong">
                <Icon className="size-[22px]" strokeWidth={1.75} />
              </div>
              <h3 className="mt-[18px] font-display text-lg font-semibold leading-tight tracking-[-0.01em]">{c.title}</h3>
              <p className="mt-2 text-sm leading-normal text-muted-foreground">{c.desc}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTA({ onDemo }: { onDemo: () => void }) {
  return (
    <section className={`${WIDE} pb-7 pt-14 md:pb-12 md:pt-20 lg:pt-[104px]`}>
      {/* The extra room at the bottom keeps the buttons clear of the pulse line. */}
      <div className={`relative overflow-hidden rounded-[20px] border border-border px-5 pb-[104px] pt-14 text-center md:rounded-[32px] md:px-16 md:pb-40 md:pt-[104px] ${GRAPH_PAPER}`}>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Influence, measured.</span>
        <h2 className="mx-auto mt-[18px] max-w-[900px] font-display text-[clamp(2.25rem,5.4vw,5rem)] font-semibold leading-none tracking-[-0.05em]">
          Feel the <span className="text-accent">pulse</span> of every campaign.
        </h2>
        <p className="mx-auto mt-[22px] max-w-[520px] text-lg leading-[1.55] text-muted-foreground">
          See your next campaign run from brief to payout, live.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={onDemo} className={BUTTON_PRIMARY}>
            Book a demo
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link to="/auth" className={BUTTON_QUIET}>
            Sign in
          </Link>
        </div>
        <PulseLine className="absolute inset-x-0 bottom-0 h-16 w-full md:h-[92px]" />
      </div>
    </section>
  );
}

export default function LandingDashboard() {
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);
  useThemeColor("#ffffff");
  return (
    <div className="daylight min-h-screen bg-background text-foreground antialiased">
      <TopNav onDemo={openDemo} />
      <main>
        <Hero onDemo={openDemo} />
        <Steps />
        <Stats />
        <Listening />
        <Platform />
        <FinalCTA onDemo={openDemo} />
      </main>
      <PublicFooter />
      <DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
