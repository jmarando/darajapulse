import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type Finding = {
  value: string;
  caption: string;
  headline: string;
  body: string;
  /** Where to act on the finding. */
  action?: { label: string; to: string };
};

/** The one loud surface on a dashboard: the finding worth leading with, one at a time. */
export function PatternCard({ findings, label = "Pattern found", className }: {
  findings: Finding[];
  label?: string;
  className?: string;
}) {
  const [i, setI] = useState(0);
  if (findings.length === 0) return null;
  const n = findings.length;
  const at = Math.min(i, n - 1);
  const it = findings[at];
  return (
    <section className={cn("bg-pattern-card relative flex min-h-[320px] flex-col overflow-hidden rounded-[20px] p-6 text-white", className)}>
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[12px] backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> {label}
        </span>
        {n > 1 && (
          <div className="flex items-center gap-0.5 text-[12px] text-white/70">
            <button type="button" aria-label="Previous finding" onClick={() => setI((at - 1 + n) % n)} className="rounded-full p-1 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums">{at + 1} of {n}</span>
            <button type="button" aria-label="Next finding" onClick={() => setI((at + 1) % n)} className="rounded-full p-1 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div aria-live="polite" className="relative z-10 mt-auto pt-10">
        <div className="flex items-baseline gap-3">
          <span className="text-[48px] font-light leading-none tracking-[-0.035em]">{it.value}</span>
          <span className="max-w-[11rem] text-[12.5px] leading-snug text-white/70">{it.caption}</span>
        </div>
        <h3 className="mt-5 font-sans text-[22px] font-medium leading-tight tracking-[-0.01em]">{it.headline}</h3>
        <p className="mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-white/75">{it.body}</p>
        {it.action && (
          <Link
            to={it.action.to}
            className="mt-5 inline-flex items-center gap-1.5 rounded-[10px] bg-white px-3.5 py-2 text-[13px] font-medium text-neutral-900 shadow-sm transition-colors hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {it.action.label} <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
