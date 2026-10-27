import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A dashboard card: soft panel, sentence-case title, optional subtitle and action. */
export function Panel({ title, subtitle, action, className, children }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-[20px] border border-border/70 bg-card p-5 sm:p-6", className)}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-sans text-[15px] font-medium leading-snug tracking-normal">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
