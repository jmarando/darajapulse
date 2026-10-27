export type WindowRange = { from?: Date; to?: Date };
export type WindowPreset = { label: string; range: { from: Date; to: Date } };

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Weeks start on Monday. */
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/** The one-click windows next to "All time", worked out from today. */
export function reportingPresets(today: Date): WindowPreset[] {
  const lastMonth = addDays(startOfMonth(today), -1);
  return [
    { label: "This week", range: { from: startOfWeek(today), to: endOfDay(today) } },
    { label: "Last 7 days", range: { from: startOfDay(addDays(today, -6)), to: endOfDay(today) } },
    { label: "Last 14 days", range: { from: startOfDay(addDays(today, -13)), to: endOfDay(today) } },
    { label: "This month", range: { from: startOfMonth(today), to: endOfDay(today) } },
    { label: "Last month", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
  ];
}

const sameDay = (a?: Date, b?: Date) => !!a && !!b && +startOfDay(a) === +startOfDay(b);

/** The preset whose first and last days match the range, if any. */
export function activePreset(presets: WindowPreset[], range: WindowRange | undefined) {
  return presets.find((p) => sameDay(p.range.from, range?.from) && sameDay(p.range.to, range?.to));
}

const day = (d: Date, withYear = false) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

export function windowLabel(range: WindowRange | undefined): string {
  if (!range?.from) return "All time";
  if (!range.to) return `From ${day(range.from, true)}`;
  return `${day(range.from)} – ${day(range.to, true)}`;
}
