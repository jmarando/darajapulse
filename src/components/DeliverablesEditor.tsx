import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Instagram, Youtube, Twitter, Facebook, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const DELIVERABLE_TYPES = [
  "post", "reel", "video", "story", "carousel", "live", "short", "thread",
] as const;

export const PLATFORMS = ["tiktok", "instagram", "youtube", "twitter", "facebook"] as const;
export type Platform = typeof PLATFORMS[number];

/** House default: every creator posts on TikTok + Instagram + Facebook unless changed. */
export const DEFAULT_PLATFORMS: string[] = ["tiktok", "instagram", "facebook"];

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", twitter: "X", facebook: "Facebook",
};
const PLATFORM_ICON: Record<string, any> = {
  tiktok: Music2, instagram: Instagram, youtube: Youtube, twitter: Twitter, facebook: Facebook,
};

/** New canonical shape: an array of items, each with one or more platforms (cross-post). */
export type DeliverableItem = { type: string; count: number; platforms: string[] };
export type ItemsBreakdown = { items: DeliverableItem[] };

/** Legacy flat: { video: 3 }. Legacy nested: { tiktok: { video: 3 } }. */
export type FlatBreakdown = Record<string, number>;
export type PlatformBreakdown = Record<string, FlatBreakdown>;
export type Breakdown = ItemsBreakdown | PlatformBreakdown | FlatBreakdown;

const isItems = (b: any): b is ItemsBreakdown =>
  !!b && typeof b === "object" && Array.isArray((b as any).items);
const isNested = (b: any): b is PlatformBreakdown =>
  !!b && typeof b === "object" && !Array.isArray(b) && Object.values(b).some(v => v && typeof v === "object" && !Array.isArray(v));

/** Always returns the items shape, converting legacy formats. */
export const normalizeBreakdown = (b: any, fallbackPlatform: string | string[] = DEFAULT_PLATFORMS): ItemsBreakdown => {
  const fallback = Array.isArray(fallbackPlatform) ? fallbackPlatform : [fallbackPlatform];
  if (!b || typeof b !== "object") return { items: [] };
  if (isItems(b)) {
    const items = (b.items || [])
      .map((it: any): DeliverableItem => ({
        type: String(it?.type || ""),
        count: Number(it?.count) || 0,
        platforms: Array.isArray(it?.platforms) && it.platforms.length
          ? it.platforms.map((p: any) => String(p)).filter(Boolean)
          : [...fallback],
      }))
      .filter(it => it.type && it.count > 0 && it.platforms.length > 0);
    return { items };
  }
  if (isNested(b)) {
    const items: DeliverableItem[] = [];
    for (const [plat, types] of Object.entries(b as PlatformBreakdown)) {
      for (const [t, n] of Object.entries(types || {})) {
        if (Number(n) > 0) items.push({ type: t, count: Number(n), platforms: [plat] });
      }
    }
    return { items };
  }
  // Flat legacy
  const items: DeliverableItem[] = [];
  for (const [t, n] of Object.entries(b as FlatBreakdown)) {
    if (Number(n) > 0) items.push({ type: t, count: Number(n), platforms: [...fallback] });
  }
  return { items };
};

/** Total counts each item once (a cross-posted creative = 1 piece, even if it ships to 2 platforms). */
export const breakdownTotal = (b?: Breakdown | null): number => {
  const n = normalizeBreakdown(b);
  return n.items.reduce((acc, it) => acc + (Number(it.count) || 0), 0);
};

const labelFor = (type: string, count: number) => `${count} ${type}${count === 1 ? "" : "s"}`;
const platformList = (ps: string[]) => ps.map(p => PLATFORM_LABEL[p] || p).join(" + ");

export const breakdownSummary = (b?: Breakdown | null): string => {
  const n = normalizeBreakdown(b);
  return n.items
    .filter(it => it.count > 0 && it.type)
    .map(it => `${labelFor(it.type, it.count)} on ${platformList(it.platforms)}${it.platforms.length > 1 ? " (cross-post)" : ""}`)
    .join(" · ");
};

export const breakdownPlatforms = (b?: Breakdown | null): string[] => {
  const n = normalizeBreakdown(b);
  const set = new Set<string>();
  for (const it of n.items) for (const p of it.platforms) set.add(p);
  return [...set];
};

const PlatformChips = ({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) => {
  const toggle = (p: string) => {
    const has = value.includes(p);
    if (has) {
      if (value.length === 1) return; // keep at least one
      onChange(value.filter(x => x !== p));
    } else {
      onChange([...value, p]);
    }
  };
  return (
    <div className="flex flex-wrap gap-1">
      {PLATFORMS.map(p => {
        const Icon = PLATFORM_ICON[p];
        const active = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            title={PLATFORM_LABEL[p]}
            className={cn(
              "h-8 px-2 rounded-md border text-xs flex items-center gap-1 transition-colors",
              active ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{PLATFORM_LABEL[p]}</span>
          </button>
        );
      })}
    </div>
  );
};

export const DeliverablesEditor = ({ value, onChange }: { value: Breakdown; onChange: (b: ItemsBreakdown) => void }) => {
  const items = useMemo(() => {
    const n = normalizeBreakdown(value);
    return n.items.length ? n.items : [{ type: "video", count: 1, platforms: [...DEFAULT_PLATFORMS] }];
  }, [value]);

  const commit = (next: DeliverableItem[]) => {
    const cleaned = next
      .map(it => ({ ...it, count: Number(it.count) || 0, platforms: it.platforms.length ? it.platforms : [...DEFAULT_PLATFORMS] }))
      .filter(it => it.type && it.count > 0);
    onChange({ items: cleaned });
  };
  const setRow = (idx: number, patch: Partial<DeliverableItem>) => commit(items.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const removeRow = (idx: number) => commit(items.filter((_, i) => i !== idx));
  const addRow = () => commit([...items, { type: "post", count: 1, platforms: [...(items[items.length - 1]?.platforms?.length ? items[items.length - 1].platforms : DEFAULT_PLATFORMS)] }]);

  return (
    <div className="space-y-3">
      {items.map((r, i) => (
        <div key={i} className="rounded-md border bg-background p-2 space-y-2">
          <div className="flex gap-2 items-center">
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
            {items.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeRow(i)}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <PlatformChips value={r.platforms} onChange={ps => setRow(i, { platforms: ps })} />
          {r.platforms.length > 1 && (
            <div className="text-[10px] text-muted-foreground pl-0.5">
              Cross-posted to {platformList(r.platforms)} — same creative, shipped to each.
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
        <Plus className="w-3 h-3 mr-1" /> Add deliverable
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Total: {breakdownTotal({ items })} pieces — tap multiple platforms on a row to mark it as cross-posted.
      </p>
    </div>
  );
};
