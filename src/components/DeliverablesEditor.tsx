import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export const DELIVERABLE_TYPES = [
  "post", "reel", "video", "story", "carousel", "live", "short", "thread",
] as const;

export type Breakdown = Record<string, number>;

export const breakdownTotal = (b?: Breakdown | null) =>
  Object.values(b ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

export const breakdownSummary = (b?: Breakdown | null) => {
  const entries = Object.entries(b ?? {}).filter(([, n]) => Number(n) > 0);
  if (!entries.length) return "";
  return entries.map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`).join(" · ");
};

export const DeliverablesEditor = ({ value, onChange }: { value: Breakdown; onChange: (b: Breakdown) => void }) => {
  const entries = Object.entries(value);
  if (entries.length === 0) entries.push(["post", 1]);

  const update = (idx: number, type: string, count: number) => {
    const next: Breakdown = {};
    entries.forEach(([t, c], i) => {
      const key = i === idx ? type : t;
      const val = i === idx ? count : (c as number);
      if (key) next[key] = (next[key] || 0) + val;
    });
    onChange(next);
  };
  const removeRow = (idx: number) => {
    const next: Breakdown = {};
    entries.forEach(([t, c], i) => { if (i !== idx) next[t] = c as number; });
    onChange(next);
  };
  const addRow = () => {
    const used = new Set(entries.map(([t]) => t));
    const nextType = DELIVERABLE_TYPES.find(t => !used.has(t)) || "post";
    onChange({ ...value, [nextType]: 1 });
  };

  return (
    <div className="space-y-2">
      {entries.map(([t, c], i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            type="number"
            min="0"
            value={c as number}
            onChange={e => update(i, t, Number(e.target.value) || 0)}
            className="w-20"
          />
          <Select value={t} onValueChange={v => update(i, v, c as number)}>
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DELIVERABLE_TYPES.map(d => (
                <SelectItem key={d} value={d}>{d}{(c as number) === 1 ? "" : "s"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {entries.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(i)}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
        <Plus className="w-3 h-3 mr-1" /> Add type
      </Button>
      <p className="text-[10px] text-muted-foreground">Total: {breakdownTotal(Object.fromEntries(entries))} pieces</p>
    </div>
  );
};
