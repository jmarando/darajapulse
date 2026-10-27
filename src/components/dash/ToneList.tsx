import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "./chips";

const TONES: Record<Tone, { icon: LucideIcon; cls: string }> = {
  good: { icon: CheckCircle2, cls: "bg-status-good/10 text-status-good" },
  warn: { icon: AlertTriangle, cls: "bg-status-warn/10 text-status-warn" },
  bad: { icon: AlertCircle, cls: "bg-status-bad/10 text-status-bad" },
  info: { icon: Info, cls: "bg-status-info/10 text-status-info" },
  neutral: { icon: Info, cls: "bg-secondary text-muted-foreground" },
};

export type ToneItem = {
  key: string;
  tone: Tone;
  title: ReactNode;
  detail?: ReactNode;
  /** Overrides the tone's default icon. */
  icon?: LucideIcon;
  /** Makes the row a link with a chevron. */
  to?: string;
};

/** A list of things to know or act on, each with a tinted icon that matches its state. */
export function ToneList({ items, className }: { items: ToneItem[]; className?: string }) {
  return (
    <ul className={cn("-my-1 divide-y divide-border/70", className)}>
      {items.map((n) => {
        const T = TONES[n.tone];
        const Icon = n.icon ?? T.icon;
        const body = (
          <>
            <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", T.cls)}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium leading-snug">{n.title}</div>
              {n.detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{n.detail}</p>}
            </div>
            {n.to && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />}
          </>
        );
        return (
          <li key={n.key}>
            {n.to ? (
              <Link to={n.to} className="group -mx-2 flex gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {body}
              </Link>
            ) : (
              <div className="flex gap-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
