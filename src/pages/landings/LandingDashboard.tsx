import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import PublicFooter from "@/components/PublicFooter";
import {
  ArrowRight,
  Play,
  Shield,
  Wallet,
  Globe,
  Search as SearchIcon,
  TrendingUp,
  Zap,
} from "lucide-react";
import creatorPortrait from "@/assets/landing-creator.jpg";
import logo from "@/assets/logo-pulse-mark.png";

// ─── live wire feed (cycles every 3.2s) ────────────────────────────────────
const HEADLINES = [
  ["TikTok view captured", "@wanjiruke", "+12,408 in 4 min"],
  ["Brief signed", "Royco · Mama Mboga Q1", "six creators booked"],
  ["M-Pesa B2C disbursed", "@brendamaina", "KES 18,400 · 9m 14s"],
  ["Report viewed", "Safaricom · Hustler Fund", "14× this hour"],
  ["#BoltKE contest", "38 new entries", "since lunch"],
  ["NCBA Loop brief opened", "six creators reading", "now"],
  ["YT Short tracked", "@kenyanvibes", "+4,210 views"],
  ["X post tracked", "@kevin_otieno", "+1,820 likes"],
];

function useCycle<T>(items: T[], ms = 3200) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % items.length), ms);
    return () => clearInterval(id);
  }, [items.length, ms]);
  return [items[idx], idx] as const;
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

function useTickingNumber(base: number, jitter = 30, ms = 1500) {
  const [n, setN] = useState(base);
  useEffect(() => {
    const id = window.setInterval(() => {
      setN((v) => v + Math.floor(Math.random() * jitter) + 1);
    }, ms);
    return () => clearInterval(id);
  }, [jitter, ms]);
  return n;
}

const dpEyebrow =
  "text-[11px] tracking-[0.3em] uppercase font-medium text-muted-foreground";
const dpEyebrowAccent =
  "text-[11px] tracking-[0.3em] uppercase font-medium text-accent";
const serif = "font-serif italic";

// ─── Masthead ──────────────────────────────────────────────────────────────
const Masthead = () => {
  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    [],
  );
  return (
    <header className="border-b border-border bg-background">
      {/* Top bar */}
      <div className="border-b border-border/70">
        <div className="max-w-[1320px] mx-auto px-6 h-9 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{today}</span>
            <span>·</span>
            <span>Nairobi · 19°C · light cloud</span>
          </div>
          <nav className="hidden md:flex items-center gap-5">
            <a href="#" aria-label="Search" className="transition-[color] duration-150 hover:text-foreground">
              <SearchIcon className="w-3 h-3" />
            </a>
            <a href="#newsletter" className="transition-[color] duration-150 hover:text-foreground">Newsletter</a>
            <Link to="/auth" className="transition-[color] duration-150 hover:text-foreground">Sign in</Link>
            <Link to="/auth" className="text-foreground font-medium transition-[color] duration-150 hover:text-accent">Open the console →</Link>
          </nav>
        </div>
      </div>

      {/* Title row */}
      <div className="max-w-[1320px] mx-auto px-6 py-7 grid grid-cols-12 items-end gap-6 animate-enter" style={{ animationDelay: "0ms" }}>
        <div className="col-span-12 md:col-span-3 text-xs text-muted-foreground tracking-widest uppercase">
          Vol. II · Issue 02
        </div>
        <div className="col-span-12 md:col-span-6 text-center flex items-center justify-center gap-3">
          <img src={logo} alt="" data-no-outline className="h-9 w-auto" width={36} height={36} />
          <div className="font-display text-[44px] md:text-[56px] leading-none tracking-[-0.03em] font-semibold">
            Daraja<span className="text-accent mx-1">·</span>Pulse
          </div>
        </div>
        <div className={`col-span-12 md:col-span-3 text-right text-sm text-muted-foreground ${serif} text-lg md:text-xl`}>
          Influence, <span className="text-foreground">measured.</span>
        </div>
      </div>

      {/* Section nav */}
      <nav className="border-t border-border">
        <div className="max-w-[1320px] mx-auto px-6 h-11 flex items-center gap-6 overflow-x-auto text-[13px] font-medium">
          {["The Desk","Discovery","Brief Composer","Campaigns","Payouts","Public Reports","KRA & e-TIMS","Pricing"].map((s) => (
            <a key={s} href="#" className="text-foreground/80 whitespace-nowrap transition-[color] duration-150 hover:text-accent">{s}</a>
          ))}
        </div>
      </nav>
    </header>
  );
};

// ─── Live wire ribbon (under masthead) ─────────────────────────────────────
const LiveWire = () => {
  const items = [...HEADLINES, ...HEADLINES];
  return (
    <div className="bg-primary text-primary-foreground overflow-hidden border-y border-border">
      <div className="max-w-[1320px] mx-auto px-6 h-10 flex items-center gap-4">
        <span className="shrink-0 flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-semibold text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-counter" />
          Live wire
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex gap-10 whitespace-nowrap animate-[marquee_50s_linear_infinite]">
            {items.map((row, i) => (
              <span key={i} className="text-[12px] tabular-nums text-primary-foreground/80">
                <span className="text-primary-foreground font-medium">{row[0]}</span>
                <span className="text-primary-foreground/50"> · </span>
                <span className={serif + " text-primary-foreground"}>{row[1]}</span>
                <span className="text-primary-foreground/50"> · </span>
                <span className="text-accent font-mono">{row[2]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Hero ──────────────────────────────────────────────────────────────────
const Hero = () => {
  const [line] = useCycle(HEADLINES, 3200);
  const views = useTickingNumber(2_413_902, 90, 1400);

  return (
    <section className="max-w-[1320px] mx-auto px-6 pt-14 pb-16 grid grid-cols-12 gap-10">
      {/* Left rail — editor notes */}
      <aside className="col-span-12 lg:col-span-3 space-y-8 animate-enter" style={{ animationDelay: "80ms" }}>
        <div>
          <h6 className={dpEyebrow + " mb-3"}>From the editor</h6>
          <p className={`${serif} text-2xl leading-snug text-foreground text-balance`}>
            The PDF report is dead. The brand opens a link. The link <span className="text-accent">is</span> the campaign. It refreshes on its own. It pays the creators while it does.
          </p>
        </div>
        <div>
          <h6 className={dpEyebrow + " mb-3"}>What's inside</h6>
          <p className="text-[15px] leading-relaxed text-foreground/90">
            <span className="float-left font-display font-semibold text-[56px] leading-[0.85] pr-2 pt-1 text-accent">A</span>
            live console for East African agencies. Briefs, approvals, cross-network metrics, and M-Pesa B2C — in one self-refreshing document the brand can bookmark.
          </p>
        </div>
        <div>
          <h6 className={dpEyebrow + " mb-3"}>Compliance, on the page</h6>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            KRA-aware. Withholding tax computed at line level. Every payout writes an e-TIMS-ready record. The brand never sees a tax form — and never has to ask.
          </p>
        </div>
      </aside>

      {/* Center — lead story */}
      <div className="col-span-12 lg:col-span-6 text-center flex flex-col items-center gap-7 animate-enter" style={{ animationDelay: "160ms" }}>
        <div className={dpEyebrowAccent + " inline-flex items-center gap-2"}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-counter" />
          Lead Story · Issue 02
        </div>

        <h1 className="font-display font-semibold text-[64px] md:text-[96px] lg:text-[112px] leading-[0.9] tracking-[-0.03em] text-balance">
          Influence,
          <br />
          <span className={`${serif} text-accent`}>orchestrated.</span>
        </h1>

        <p className="text-[18px] md:text-[20px] leading-snug max-w-xl text-muted-foreground text-pretty">
          Brief, approve, publish, measure and pay creators across{" "}
          <span className="underline decoration-wavy decoration-accent underline-offset-[6px] text-foreground">five networks</span>{" "}
          — in one live document the brand can refresh at 2am.
        </p>

        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-7 py-4 text-base font-medium rounded-md transition-[background-color,scale,box-shadow] duration-150 ease-out active:scale-[0.96] hover:shadow-elegant hover:bg-primary/90"
          >
            Open the console <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#tour"
            className="inline-flex items-center gap-2 border border-input bg-background px-7 py-4 text-base font-medium rounded-md transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:bg-accent hover:text-accent-foreground hover:border-accent"
          >
            <Play className="w-4 h-4" /> Watch the 60-second tour
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 text-[12px] text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1.5"><Shield className="w-3 h-3" /> KRA & e-TIMS</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5"><Wallet className="w-3 h-3" /> M-Pesa Daraja B2C</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5"><Globe className="w-3 h-3" /> KE · TZ · UG · RW</span>
        </div>
      </div>

      {/* Right rail — live signals */}
      <aside className="col-span-12 lg:col-span-3 space-y-8 animate-enter" style={{ animationDelay: "240ms" }}>
        <div>
          <h6 className={dpEyebrow + " mb-3"}>Live wire · this hour</h6>
          <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3 shadow-card">
            <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 animate-pulse-counter shrink-0" />
            <div key={line[1]} className="text-[13px] leading-snug animate-[enter_400ms_ease-out]">
              <div className="font-medium text-foreground">{line[0]}</div>
              <div className={serif + " text-foreground/80"}>{line[1]}</div>
              <div className="font-mono text-[11px] text-accent mt-1">{line[2]}</div>
            </div>
          </div>
        </div>

        <div>
          <h6 className={dpEyebrow + " mb-3"}>Performance · last 30 days</h6>
          <ul className="divide-y divide-border border-y border-border">
            {[
              { l: "Views tracked", v: "2.41M" },
              { l: "Creators paid", v: "1,402" },
              { l: "Avg payout time", v: "9m 14s" },
              { l: "Active campaigns", v: "14" },
            ].map((s) => (
              <li key={s.l} className="flex items-baseline justify-between py-3">
                <span className="text-[13px] text-muted-foreground">{s.l}</span>
                <span className="font-display font-semibold tabular-nums text-[20px]">{s.v}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h6 className={dpEyebrow + " mb-3"}>Views tracked · live</h6>
          <div className="bg-primary text-primary-foreground rounded-lg p-5">
            <div className="font-display font-semibold tabular-nums text-[40px] leading-none">
              {views.toLocaleString()}
            </div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-primary-foreground/60 mt-2 inline-flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-accent" /> Updating every 1.4s
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
};

// ─── KPI strip ─────────────────────────────────────────────────────────────
const KPI = ({ label, target, format }: { label: string; target: number; format: (n: number) => string }) => {
  const { ref, value } = useCountUp(target);
  return (
    <div className="px-6 py-7">
      <div className={dpEyebrow + " mb-3"}>{label}</div>
      <div className="font-display font-semibold tabular-nums text-[44px] leading-none">
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

// ─── Feature story (image-led) ─────────────────────────────────────────────
const FeatureStory = () => (
  <section className="max-w-[1320px] mx-auto px-6 py-20 grid grid-cols-12 gap-10 items-start">
    <div className="col-span-12 md:col-span-7 group">
      <div className="overflow-hidden rounded-xl border border-border shadow-elegant">
        <img
          src={creatorPortrait}
          alt="Nairobi creator portrait"
          width={1200}
          height={1400}
          className="w-full h-auto transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <p className={dpEyebrow + " mt-4"}>Photograph · Nairobi · April 2026</p>
    </div>
    <div className="col-span-12 md:col-span-5 space-y-6">
      <div className={dpEyebrowAccent}>Feature · Case study</div>
      <h2 className="font-display font-semibold text-[40px] md:text-[56px] leading-[1.05] tracking-[-0.025em] text-balance">
        How a Nairobi agency settled <span className={`${serif} text-accent`}>2,000+ creators</span> in 48 hours.
      </h2>
      <p className="text-[17px] leading-relaxed text-muted-foreground text-pretty">
        Before Daraja Pulse, the finance team reconciled M-Pesa payouts from spreadsheets for three working days every Friday. After: the brief signs, the post goes live, the metric arrives, the payout sends. The brand watches the same page.
      </p>
      <Link
        to="/landing"
        className="inline-flex items-center gap-2 text-accent font-medium transition-[gap] duration-150 hover:gap-3"
      >
        Read the case study <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  </section>
);

// ─── Three-column dispatches ───────────────────────────────────────────────
const Dispatches = () => {
  const items = [
    { eyebrow: "Dispatch · Product", title: "Brief Composer goes multi-network", body: "One brief, five surfaces. Composer now auto-fits deliverables to TikTok, IG, FB, YT and X — with platform-specific examples inline.", icon: TrendingUp },
    { eyebrow: "Dispatch · Payouts", title: "Average payout time falls to 9m 14s", body: "Direct M-Pesa B2C with retry queue and WHT line-items. Creators see the SMS before the brand sees the report.", icon: Wallet },
    { eyebrow: "Dispatch · Compliance", title: "e-TIMS records on every line item", body: "Every payout writes a KRA-aware record. Exports map cleanly to your accounting export with no manual re-keying.", icon: Shield },
  ];
  return (
    <section className="max-w-[1320px] mx-auto px-6 pb-20 grid md:grid-cols-3 gap-8">
      {items.map((d) => (
        <article
          key={d.title}
          className="border-t-2 border-foreground pt-5 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-accent group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className={dpEyebrow}>{d.eyebrow}</span>
            <d.icon className="w-4 h-4 text-muted-foreground transition-[color] duration-150 group-hover:text-accent" />
          </div>
          <h3 className="font-display font-semibold text-[22px] leading-tight tracking-[-0.015em] mb-3 text-balance">
            {d.title}
          </h3>
          <p className="text-[14.5px] leading-relaxed text-muted-foreground text-pretty">{d.body}</p>
          <Link to="/landing" className="inline-block mt-4 text-[12px] tracking-[0.2em] uppercase font-medium text-accent transition-[gap] duration-150 hover:underline">
            Read →
          </Link>
        </article>
      ))}
    </section>
  );
};

// ─── Op-ed / closing CTA ───────────────────────────────────────────────────
const Closing = () => (
  <section className="bg-primary text-primary-foreground border-y border-border">
    <div className="max-w-[1320px] mx-auto px-6 py-24 grid grid-cols-12 gap-8 items-center">
      <div className="col-span-12 md:col-span-2 text-[11px] tracking-[0.3em] uppercase text-primary-foreground/60">
        Op-ed · The Editor
      </div>
      <div className="col-span-12 md:col-span-8 text-center">
        <p className={`${serif} text-[34px] md:text-[52px] leading-[1.1] tracking-[-0.02em] text-balance`}>
          "The most under-priced asset in African marketing is the <span className="text-accent">link the brand opens at 2am</span>. Make it live, and you've won the account."
        </p>
        <div className="mt-7 flex flex-wrap gap-3 justify-center">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-7 py-4 text-base font-medium rounded-md transition-[filter,scale] duration-150 ease-out active:scale-[0.96] hover:brightness-110"
          >
            Open the console <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#tour"
            className="inline-flex items-center gap-2 border border-primary-foreground/30 px-7 py-4 text-base font-medium rounded-md transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] hover:bg-primary-foreground hover:text-primary"
          >
            <Play className="w-4 h-4" /> Watch the tour
          </a>
        </div>
      </div>
      <div className="col-span-12 md:col-span-2 text-right text-[11px] tracking-[0.3em] uppercase text-primary-foreground/60">
        — DP Editorial
      </div>
    </div>
  </section>
);

// ─── Trusted by row ────────────────────────────────────────────────────────
const TrustedBy = () => (
  <section className="max-w-[1320px] mx-auto px-6 py-16">
    <p className={dpEyebrow + " text-center mb-8"}>Infrastructure for the operators behind the brands</p>
    <div className="flex flex-wrap justify-center items-center gap-x-14 gap-y-6 opacity-60">
      {["SCANGROUP", "OGILVY AFRICA", "DENTSU", "VMLY&R", "PUBLICIS", "WPP"].map((n) => (
        <div key={n} className="font-display text-[22px] font-semibold tracking-tight transition-[opacity] duration-150 hover:opacity-100">{n}</div>
      ))}
    </div>
  </section>
);

const LandingDashboard = () => (
  <div className="min-h-screen bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
    <Masthead />
    <LiveWire />
    <Hero />
    <KpiStrip />
    <FeatureStory />
    <Dispatches />
    <Closing />
    <TrustedBy />
    <PublicFooter />
  </div>
);

export default LandingDashboard;
