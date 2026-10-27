import type { MetricSnapshot } from "@/lib/metrics";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 0 is "12am", 12 is "12pm". */
export const slotLabel = (hour: number) => `${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`;

export type CadenceCell = {
  /** 0 is Monday. */
  day: number;
  hour: number;
  posts: number;
  views: number;
  /** How strongly to shade the slot, from a faint 0.08 up to 1 for the busiest. */
  level: number;
};

export type Cadence = { cells: CadenceCell[]; /** The slot with the most views. Null while nothing has views. */ best: CadenceCell | null };

type CadencePost = { id: string; posted_at?: string | null; created_at?: string | null };

/**
 * Posts and views by the weekday and hour each post went live, in the viewer's own time. A post
 * with no publish date counts on the day it was added; one with neither is left out.
 */
export function buildCadence(posts: CadencePost[], metrics: Map<string, MetricSnapshot>): Cadence {
  const slots = new Map<string, { day: number; hour: number; posts: number; views: number }>();
  for (const p of posts) {
    const when = p.posted_at || p.created_at;
    if (!when) continue;
    const d = new Date(when);
    if (isNaN(+d)) continue;
    const day = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    const cur = slots.get(key) ?? { day, hour, posts: 0, views: 0 };
    cur.posts += 1;
    cur.views += Number(metrics.get(p.id)?.views || 0);
    slots.set(key, cur);
  }
  const max = Math.max(1, ...[...slots.values()].map((c) => c.views));
  const cells = [...slots.values()].map((c) => ({ ...c, level: Math.max(0.08, c.views / max) }));
  let best: CadenceCell | null = null;
  for (const c of cells) if (c.views > (best?.views ?? 0)) best = c;
  return { cells, best };
}
