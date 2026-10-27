import { describe, expect, it } from "vitest";
import { activePreset, reportingPresets, windowLabel } from "@/lib/reportingWindow";

const d = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute);
const ymd = (x?: Date) => (x ? `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}` : undefined);
const byLabel = (today: Date) => Object.fromEntries(reportingPresets(today).map((p) => [p.label, p.range]));

describe("reportingPresets", () => {
  it("builds the windows from today, with weeks starting on Monday", () => {
    const p = byLabel(d(2026, 7, 15, 15, 30)); // a Wednesday
    expect(ymd(p["This week"].from)).toBe("2026-7-13");
    expect(ymd(p["Last 7 days"].from)).toBe("2026-7-9");
    expect(ymd(p["Last 14 days"].from)).toBe("2026-7-2");
    expect(ymd(p["This month"].from)).toBe("2026-7-1");
    expect(ymd(p["Last month"].from)).toBe("2026-6-1");
    expect(ymd(p["Last month"].to)).toBe("2026-6-30");
    for (const label of ["This week", "Last 7 days", "Last 14 days", "This month"]) {
      expect(ymd(p[label].to)).toBe("2026-7-15");
      expect(p[label].to.getHours()).toBe(23);
    }
    expect(p["Last 7 days"].from.getHours()).toBe(0);
  });

  it("keeps Sunday in the week that began the Monday before", () => {
    expect(ymd(byLabel(d(2026, 7, 19))["This week"].from)).toBe("2026-7-13");
  });

  it("makes last month December of the year before when it is January", () => {
    const p = byLabel(d(2026, 1, 15));
    expect(ymd(p["Last month"].from)).toBe("2025-12-1");
    expect(ymd(p["Last month"].to)).toBe("2025-12-31");
  });
});

describe("activePreset", () => {
  const presets = reportingPresets(d(2026, 7, 15, 15, 30));

  it("finds the preset whose first and last days match", () => {
    const range = { from: d(2026, 7, 9, 8), to: d(2026, 7, 15, 9) };
    expect(activePreset(presets, range)?.label).toBe("Last 7 days");
  });

  it("finds nothing for a custom range or for all time", () => {
    expect(activePreset(presets, { from: d(2026, 7, 10), to: d(2026, 7, 15) })).toBeUndefined();
    expect(activePreset(presets, undefined)).toBeUndefined();
  });
});

describe("windowLabel", () => {
  it("names the window", () => {
    expect(windowLabel(undefined)).toBe("All time");
    expect(windowLabel({ from: d(2026, 7, 9), to: d(2026, 7, 15) })).toBe("9 Jul – 15 Jul 2026");
    expect(windowLabel({ from: d(2026, 7, 9) })).toBe("From 9 Jul 2026");
  });
});
