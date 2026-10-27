import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; to?: string };

/** Large page title with optional breadcrumb, supporting line and actions on the right. */
export function PageHeader({ title, subtitle, crumbs, actions, className }: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8", className)}>
      <div className="min-w-0 max-w-full">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
                {c.to ? (
                  <Link to={c.to} className="truncate hover:text-foreground">{c.label}</Link>
                ) : (
                  <span className="truncate text-foreground/80" aria-current="page">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="break-words font-sans text-[32px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 text-[14px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
