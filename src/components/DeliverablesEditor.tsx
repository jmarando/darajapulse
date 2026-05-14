import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export const DELIVERABLE_TYPES = [
  "post", "reel", "video", "story", "carousel", "live", "short", "thread",
] as const;

export const PLATFORMS = ["tiktok", "instagram", "youtube", "twitter", "facebook"] as const;
export type Platform = typeof PLATFORMS[number];

export type FlatBreakdown = Record<string, number>;
export type PlatformBreakdown = Record<string, FlatBreakdown>;
export type Breakdown = PlatformBreakdown | FlatBreakdown;

const isNested = (b: any): b is PlatformBreakdown =>
  !!b && typeof b === "object" && Object.values(b).some(v => v && typeof v === "object" && !Array.isArray(v));

/** Normalize legacy flat breakdown to per-platform shape using fallback platform. */
export const normalizeBreakdown = (b: any, fallbackPlatform: string = "tiktok"): PlatformBreakdown => {
  if (!b || typeof b !== "object") return {};
  if (isNested(b)) {
    const out: PlatformBreakdown = {};
    for (const [plat, types] of Object.entries(b as PlatformBreakdown)) {
      const clean: FlatBreakdown = {};
      for (const [t, n] of Object.entries(types || {})) if (Number(n) > 0) clean[t] = Number(n);
      if (Object.keys(clean).length) out[plat] = clean;
    }
    return out;
  }
  const flat = b as FlatBreakdown;
  const clean: FlatBreakdown = {};
  for (const [t, n] of Object.entries(flat)) if (Number(n) > 0) clean[t] = Number(n);
  return Object.keys(clean).length ? { [fallbackPlatform]: clean } : {};
};

export const breakdownTotal = (b?: Breakdown | null): number => {
  if (!b) return 0;
  if (isNested(b)) {
    let t = 0;
    for (const plat of Object.values(b)) for (const n of Object.values(plat || {})) t += Number(n) || 0;
    return t;
  }
  return Object.values(b as FlatBreakdown).reduce((a, n) => a + (Number(n) || 0), 0);
};

export const breakdownSummary = (b?: Breakdown | null): string => {
  if (!b) return "";
  if (isNested(b)) {
    return Object.entries(b)
      .map(([plat, types]) => {
        const inside = Object.entries(types || {})
          .filter(([, n]) => Number(n) > 0)
          .map(([t, n]) => `${n} ${t}${Number(n) === 1 ? "" : "s"}`)
          .join(" + ");
        return inside ? `${plat}: ${inside}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return Object.entries(b as FlatBreakdown)
    .filter(([, n]) => Number(n) > 0)
    .map(([t, n]) => `${n} ${t}${Number(n) === 1 ? "" : "s"}`)
    .join(" · ");
};

export const breakdownPlatforms = (b?: Breakdown | null): string[] => {
  const n = normalizeBreakdown(b);
  return Object.keys(n);
};

type Row = { platform: string; type: string; count: number };

const toRows = (b: Breakdown | null | undefined): Row[] => {
  const n = normalizeBreakdown(b);
  const rows: Row[] = [];
  for (const [platform, types] of Object.entries(n)) {
    for (const [type, count] of Object.entries(types)) {
      rows.push({ platform, type, count: Number(count) || 0 });
    }
  }
  return rows;
};

const toBreakdown = (rows: Row[]): PlatformBreakdown => {
  const out: PlatformBreakdown = {};
  for (const r of rows) {
    if (!r.platform || !r.type) continue;
    out[r.platform] = out[r.platform] || {};
    out[r.platform][r.type] = (out[r.platform][r.type] || 0) + (Number(r.count) || 0);
  }
  // strip zeros
  for (const plat of Object.keys(out)) {
    for (const t of Object.keys(out[plat])) if (out[plat][t] <= 0) delete out[plat][t];
    if (Object.keys(out[plat]).length === 0) delete out[plat];
  }
  return out;
};

export const DeliverablesEditor = ({ value, onChange }: { value: Breakdown; onChange: (b: PlatformBreakdown) => void }) => {
  const rows = useMemo(() => {
    const r = toRows(value);
    return r.length ? r : [{ platform: "tiktok", type: "video", count: 1 }];
  }, [value]);

  const setRow = (idx: number, patch: Partial<Row>) => {
    const next = rows.map((r, i) => i === idx ? { ...r, ...patch } : r);
    onChange(toBreakdown(next));
  };
  const removeRow = (idx: number) => {
    onChange(toBreakdown(rows.filter((_, i) => i !== idx)));
  };
  const addRow = () => {
    // pick a sensible platform/type combo not already used
    const used = new Set(rows.map(r => `${r.platform}:${r.type}`));
    let platform: string = rows[rows.length - 1]?.platform || "tiktok";
    let type = DELIVERABLE_TYPES.find(t => !used.has(`${platform}:${t}`)) || "post";
    onChange(toBreakdown([...rows, { platform, type, count: 1 }]));
  };

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            type="number"
            min="0"
            value={r.count}
            onChange={e => setRow(i, { count: Number(e.target.value) || 0 })}
            className="w-16"
          />
          <Select value={r.type} onValueChange={v => setRow(i, { type: v })}>
            <SelectTrigger className="flex-1 min-w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DELIVERABLE_TYPES.map(d => (
                <SelectItem key={d} value={d}>{d}{r.count === 1 ? "" : "s"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">on</span>
          <Select value={r.platform} onValueChange={v => setRow(i, { platform: v })}>
            <SelectTrigger className="w-[110px] capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLATFORMS.map(p => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rows.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeRow(i)}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
        <Plus className="w-3 h-3 mr-1" /> Add deliverable
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Total: {breakdownTotal(toBreakdown(rows))} pieces — one brief covers every platform this creator is booked for.
      </p>
    </div>
  );
};
