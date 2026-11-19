import { useEffect, useState, type KeyboardEvent } from "react";
import { Check, Plus } from "lucide-react";
import type { ShowcaseSlide } from "@/lib/storefrontShowcase";

/** How long each slide stays before the next one. */
export const DWELL_MS = 6000;

/** Faint graph paper behind the slides, as on the Daraja Pulse homepage. */
const GRAPH_PAPER =
  "bg-secondary [background-image:linear-gradient(hsl(var(--border)/0.65)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.65)_1px,transparent_1px)] [background-size:32px_32px] [background-position:-1px_-1px]";
const PULSE_PATH = "M0 100 h260 l20 -30 l15 55 l25 -107 l30 164 l20 -82 h430 l20 -30 l15 55 l25 -107 l30 164 l20 -82 h290";

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/**
 * What the house sells, one property at a time: its picture, who it reaches, a price, and buttons to add it to the plan
 * or see the rest. Moves on every few seconds; holds while the buyer points at it or works in it, on Pause, and for
 * people who ask for less motion. Named tabs below show every slide and jump to it.
 */
export default function Showcase({ slides, accent, strong, picked, onAdd, onMore }: {
  slides: ShowcaseSlide[]; accent: string;
  /** The house colour darkened for white text. */
  strong: string;
  picked: (slide: ShowcaseSlide) => boolean;
  onAdd: (slide: ShowcaseSlide) => void;
  onMore: (slide: ShowcaseSlide) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const running = !reduced && !paused && !held && slides.length > 1;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setAt((n) => (n + 1) % slides.length), DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [running, at, slides.length]);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + slides.length) % slides.length;
    setAt(next);
    document.getElementById(`showcase-tab-${next}`)?.focus();
  };

  if (!slides.length) return null;
  return (
    <section
      aria-roledescription="carousel" aria-label="What you can book"
      className={`rounded-[20px] border border-border p-3.5 md:rounded-[32px] md:p-6 lg:p-8 ${GRAPH_PAPER}`}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
    >
      <div className="flex items-center gap-4 px-1 pb-4 font-mono text-[11px] uppercase tracking-[0.18em] md:pb-[18px]">
        <span className="whitespace-nowrap text-muted-foreground">On air and online</span>
        <svg viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden fill="none" className="pointer-events-none h-[34px] min-w-0 flex-1">
          <path d={PULSE_PATH} pathLength={1000} stroke={accent} strokeOpacity={0.5} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {running && (
            <path d={PULSE_PATH} pathLength={1000} stroke={accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="160 1000" vectorEffect="non-scaling-stroke" className="animate-pulse-trace" />
          )}
        </svg>
        {slides.length > 1 && !reduced && (
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
            className="inline-flex h-8 items-center whitespace-nowrap rounded-full px-1 uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ color: strong }}>
            {paused ? "Play" : "Pause"}
          </button>
        )}
      </div>

      {/* Every slide shares one grid cell, so the stage keeps the tallest one's height; only the current one shows. */}
      <div className="grid">
        {slides.map((s, i) => {
          const on = i === at;
          const added = picked(s);
          return (
            <article
              key={s.name} id={`showcase-slide-${i}`} role="tabpanel" aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}: ${s.name}`} aria-hidden={!on}
              className={`grid gap-4 rounded-[18px] border border-border bg-card p-3 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_12px_24px_-18px_hsl(var(--foreground)/0.18)] transition-[opacity,visibility] duration-500 [grid-area:1/1] motion-reduce:transition-none md:grid-cols-[1.4fr_1fr] md:items-center md:gap-8 md:p-4 ${on ? "visible opacity-100" : "invisible opacity-0"}`}
            >
              <img src={s.photo} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" className="aspect-[16/10] w-full rounded-xl object-cover object-[50%_20%]" />
              <div className="px-2 pb-2 md:px-0 md:pr-4">
                <span className="inline-block rounded-full px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ color: strong, background: `color-mix(in srgb, ${accent} 8%, transparent)` }}>
                  {s.wayTitle}
                </span>
                <h3 className="mt-3 font-display text-[clamp(1.75rem,2.8vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{s.name}</h3>
                {(s.reachText || s.about) && (
                  <p className="mt-2 text-[15px] leading-[1.55] text-muted-foreground">{[s.reachText, s.about].filter(Boolean).join(" · ")}</p>
                )}
                {s.price && <p className="mt-4 text-[17px] font-semibold tabular-nums tracking-[-0.01em]">{s.price}</p>}
                {s.choice && <p className="mt-0.5 text-[13px] text-muted-foreground">Adds {s.choice}</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onAdd(s)} aria-pressed={added}
                    aria-label={added ? `${s.name}: in your plan. Take it out` : `Add ${s.name}${s.option ? `, ${s.option}` : ""} to your plan`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    {added ? <><Check className="h-4 w-4" aria-hidden /> In your plan</> : <><Plus className="h-4 w-4" aria-hidden /> Add to plan</>}
                  </button>
                  <button type="button" onClick={() => onMore(s)}
                    className="inline-flex h-11 items-center rounded-full border border-input bg-background px-5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {s.way === "radio" ? "See the rate card" : `See all ${s.wayTitle.toLowerCase()}`}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div role="tablist" aria-label="Choose what to see" onKeyDown={onTabKey}
          className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mt-4 md:gap-3">
          {slides.map((s, i) => {
            const on = i === at;
            return (
              <button
                key={s.name} id={`showcase-tab-${i}`} type="button" role="tab" aria-selected={on} aria-controls={`showcase-slide-${i}`}
                tabIndex={on ? 0 : -1} onClick={() => setAt(i)}
                className={`min-w-[8.5rem] flex-1 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-border bg-card" : "border-transparent bg-card/60 hover:bg-card"}`}
              >
                <span className="block truncate text-[13px] font-semibold">{s.name}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{s.reachText ?? s.wayTitle}</span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-border" aria-hidden>
                  <span
                    key={on && running ? `run-${at}` : "still"}
                    className="block h-full origin-left rounded-full"
                    style={{
                      background: accent,
                      transform: on ? (running ? "scaleX(0)" : "scaleX(1)") : "scaleX(0)",
                      animation: on && running ? `showcase-fill ${DWELL_MS}ms linear forwards` : undefined,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
