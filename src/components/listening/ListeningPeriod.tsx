import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dayPeriod, lastDays, periodLabel, shiftPeriod, type Period } from "@/lib/listening";

export type Preset = "7d" | "30d" | "90d" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Pick dates" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** A period's first day as a date input reads it, in the browser's own time zone. */
const toInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fromInput = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Which stretch of time the Listening page shows: a preset window, the same window
 * stepped back or forward, or two picked dates — and whether to compare it with the
 * window before it.
 */
export default function ListeningPeriod({ period, preset, compare, onPreset, onPeriod, onCompare }: {
  period: Period;
  preset: Preset;
  compare: boolean;
  onPreset: (preset: Preset) => void;
  onPeriod: (period: Period) => void;
  onCompare: (compare: boolean) => void;
}) {
  const todayEnd = lastDays(1).end;
  const canForward = period.end < todayEnd;

  // Picking one day keeps the other where it was; the two are put in order for us.
  const setDay = (end: "start" | "end", value: string) => {
    if (!value) return;
    const picked = fromInput(value);
    if (!Number.isFinite(picked.getTime())) return;
    onPeriod(end === "start" ? dayPeriod(picked, new Date(period.end)) : dayPeriod(new Date(period.start), picked));
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex items-center">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-r-none"
          aria-label="Earlier period"
          onClick={() => onPeriod(shiftPeriod(period, -1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-l-none border-l-0"
          aria-label="Later period"
          disabled={!canForward}
          onClick={() => onPeriod(shiftPeriod(period, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <Select value={preset} onValueChange={(v) => onPreset(v as Preset)}>
        <SelectTrigger className="h-9 w-[145px]" aria-label="Period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2" aria-label={`Period: ${periodLabel(period)}`}>
            <CalendarDays className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{periodLabel(period)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="listening-from" className="text-[12px]">From</Label>
              <Input
                id="listening-from"
                type="date"
                className="h-9 w-[145px]"
                value={toInput(period.start)}
                max={toInput(todayEnd)}
                onChange={(e) => setDay("start", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="listening-to" className="text-[12px]">To</Label>
              <Input
                id="listening-to"
                type="date"
                className="h-9 w-[145px]"
                value={toInput(period.end)}
                max={toInput(todayEnd)}
                onChange={(e) => setDay("end", e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 max-w-[19rem] text-[12px] leading-relaxed text-muted-foreground">
            Listening starts from the day a keyword was added, so earlier periods can be empty.
          </p>
        </PopoverContent>
      </Popover>

      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
        <Checkbox
          checked={compare}
          onCheckedChange={(v) => onCompare(v === true)}
          aria-label="Compare with the period before"
        />
        Compare with the period before
      </label>
    </div>
  );
}
