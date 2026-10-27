import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { activePreset, reportingPresets, windowLabel } from "@/lib/reportingWindow";

const chip = (on: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    on ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card text-foreground/80 hover:bg-secondary/60",
  );

/** The period every figure below it covers: all time, a one-click window, or a range picked on the calendar. */
export function ReportingWindow({ value, onChange, now, className }: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  /** Today, for the one-click windows. */
  now?: Date;
  className?: string;
}) {
  const presets = reportingPresets(now ?? new Date());
  const active = activePreset(presets, value);
  const allTime = !value?.from;
  const custom = !active && !allTime;
  return (
    <div role="group" aria-label="Reporting window" className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="mr-1 text-[13px] text-muted-foreground">Reporting window</span>
      <button type="button" aria-pressed={allTime} onClick={() => onChange(undefined)} className={chip(allTime)}>All time</button>
      {presets.map((p) => (
        <button key={p.label} type="button" aria-pressed={active?.label === p.label} onClick={() => onChange(p.range)} className={chip(active?.label === p.label)}>
          {p.label}
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-pressed={custom} className={cn(chip(custom), "ml-auto")}>
            <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
            {allTime ? "Custom range" : windowLabel(value)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={2} initialFocus className="pointer-events-auto p-3" />
        </PopoverContent>
      </Popover>
    </div>
  );
}
