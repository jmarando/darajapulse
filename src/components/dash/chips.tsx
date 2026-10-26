import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

const DOT: Record<Tone, string> = {
  good: "bg-status-good",
  warn: "bg-status-warn",
  bad: "bg-status-bad",
  info: "bg-status-info",
  neutral: "bg-muted-foreground/50",
};

/** A white pill with a coloured dot. The label always names the state, so colour is never alone. */
export function StatusChip({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/80 bg-raised px-2 py-0.5 text-[12px] font-medium leading-5", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

/**
 * A signed change in a white pill: a small triangle coloured by whether the
 * move is good, with the value in ink. `goodWhenUp` flips the colouring for
 * metrics where falling is good.
 */
export function DeltaChip({ delta, children, goodWhenUp = true, className }: {
  delta: number;
  children: ReactNode;
  goodWhenUp?: boolean;
  className?: string;
}) {
  const up = delta > 0;
  const flat = delta === 0;
  const good = flat ? null : up === goodWhenUp;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border/80 bg-raised px-2 py-0.5 text-[12px] font-medium leading-5 tabular-nums", className)}>
      {!flat && (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className={good ? "text-status-good" : "text-status-bad"}>
          <path d={up ? "M4 1 7 6H1z" : "M4 7 1 2h6z"} fill="currentColor" />
        </svg>
      )}
      <span className="sr-only">{flat ? "No change" : up ? "Up" : "Down"}</span>
      {children}
    </span>
  );
}
