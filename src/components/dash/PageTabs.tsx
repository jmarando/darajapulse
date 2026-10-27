import * as React from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * A page's section bar: a white strip with dark labels, so it reads against the grey page, and the
 * current section in the same ink pill the sidebar uses. It scrolls sideways rather than wrapping,
 * and `active` (the current tab's value) brings the current tab into view when the bar overflows.
 */
export function PageTabList({ className, active, ...props }: React.ComponentPropsWithoutRef<typeof TabsList> & { active?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const list = ref.current;
    const tab = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo?.({ left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);
  return (
    <TabsList
      ref={ref}
      className={cn(
        "relative flex h-auto w-full items-center justify-start gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card p-1.5 text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function PageTab({ count, className, children, ...props }: React.ComponentPropsWithoutRef<typeof TabsTrigger> & { count?: number }) {
  return (
    <TabsTrigger
      className={cn(
        "group shrink-0 gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-medium text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=active]:hover:bg-primary",
        className,
      )}
      {...props}
    >
      {children}
      {count != null && (
        <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold leading-5 tabular-nums text-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

/** A hairline between groups of tabs. */
export function PageTabDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

/** A row of views inside one tab: chips, one of them chosen. */
export function ViewSwitch<T extends string>({ label, items, value, onChange, className }: {
  label: string;
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card text-foreground/80 hover:bg-secondary/60",
            )}
          >
            {it.label}
            {it.count != null && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-semibold leading-5 tabular-nums", on ? "bg-primary-foreground/20" : "bg-secondary")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
