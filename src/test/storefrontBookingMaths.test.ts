import { describe, expect, it } from "vitest";
import {
  addWorkingDays, adDue, bookingTotals, cpmViews, datesBetween, earliestStart, effectiveCpm, materialsFor, newRef, newToken,
  payMethods, pesapalPaid, priceLine, safeFileName, scheduleKind, shortDate, spreadSpots,
} from "@/lib/storefrontBooking";
import { kissSpots, leaderboard, sponsorship, starPrint } from "./fixtures/bookingItems";

const today = "2026-11-17"; // a Tuesday

describe("how each line is scheduled", () => {
  it("follows what one price buys", () => {
    expect(scheduleKind("spot", "unit")).toBe("spread");
    expect(scheduleKind("mention", "unit")).toBe("spread");
    expect(scheduleKind("insertion", "unit")).toBe("dates");
    expect(scheduleKind("day", "unit")).toBe("dates");
    expect(scheduleKind("post", "unit")).toBe("dates");
    expect(scheduleKind("week", "unit")).toBe("start");
    expect(scheduleKind("4 weeks", "unit")).toBe("start");
    expect(scheduleKind(null, "unit")).toBe("start");
    expect(scheduleKind("1,000 views", "cpm")).toBe("flight");
  });
});

describe("working days and dates", () => {
  it("skips weekends both ways", () => {
    expect(addWorkingDays("2026-11-17", 3)).toBe("2026-11-20");
    expect(addWorkingDays("2026-11-20", 3)).toBe("2026-11-25");
    expect(addWorkingDays("2026-11-21", 1)).toBe("2026-11-23");
    expect(addWorkingDays("2026-11-25", -2)).toBe("2026-11-23");
  });
  it("gives the earliest start and the ad deadline", () => {
    expect(earliestStart(today)).toBe("2026-11-20");
    expect(adDue("2026-11-24")).toBe("2026-11-20");
  });
  it("lists the days of a run and writes dates short", () => {
    expect(datesBetween("2026-11-20", "2026-11-24")).toHaveLength(5);
    expect(shortDate("2026-11-24")).toBe("24 Nov");
  });
});

describe("spreading spots over the days", () => {
  const five = datesBetween("2026-11-20", "2026-11-24");
  it("shares them evenly", () => {
    expect(spreadSpots(10, five).map((d) => d.count)).toEqual([2, 2, 2, 2, 2]);
    expect(spreadSpots(7, five.slice(0, 3)).map((d) => d.count)).toEqual([3, 2, 2]);
  });
  it("spaces out fewer spots than days", () => {
    expect(spreadSpots(3, datesBetween("2026-11-20", "2026-11-26")).map((d) => d.date)).toEqual(["2026-11-20", "2026-11-22", "2026-11-24"]);
  });
});

describe("cost per 1,000 views", () => {
  it("adds 20% when the audience is narrowed", () => {
    expect(effectiveCpm(300, "kenya")).toBe(300);
    expect(effectiveCpm(300, "nairobi")).toBe(360);
  });
  it("turns a budget into views", () => {
    expect(cpmViews(15000, 300)).toBe(50000);
    expect(cpmViews(15000, 360)).toBe(41666);
  });
});

describe("what material a format needs", () => {
  it("knows each format", () => {
    expect(materialsFor("radio_promotion", null)).toEqual(["audio", "script"]);
    expect(materialsFor("audio_preroll", "60-second mid-roll read by the host")).toEqual(["script"]);
    expect(materialsFor("audio_preroll", "15-second pre-roll")).toEqual(["audio"]);
    expect(materialsFor(null, null)).toEqual([]);
  });
});

describe("pricing a line", () => {
  it("prices spots by the chosen time band", () => {
    const a = priceLine(kissSpots, { id: kissSpots.id, option: "6–9 AM", qty: 10, start: "2026-11-20", end: "2026-11-24" }, today);
    expect(a).toMatchObject({ ok: true, line: { unitPrice: 35000, total: 350000, kind: "spread", materials: ["audio"] } });
  });
  it("holds a CPM budget to its minimum", () => {
    expect(priceLine(leaderboard, { id: leaderboard.id, option: null, qty: 1, budget: 10000, start: "2026-11-20", end: "2026-11-30" }, today))
      .toEqual({ ok: false, error: "The minimum for The Star online: Leaderboard is KES 15,000." });
  });
  it("estimates views at the narrowed price", () => {
    expect(priceLine(leaderboard, { id: leaderboard.id, option: null, qty: 1, budget: 15000, target: "nairobi", start: "2026-11-20", end: "2026-11-30" }, today))
      .toMatchObject({ ok: true, line: { cpm: 360, views: 41666, total: 15000, kind: "flight" } });
  });
  it("refuses a start before the earliest date", () => {
    expect(priceLine(leaderboard, { id: leaderboard.id, option: null, qty: 1, budget: 15000, start: "2026-11-19", end: "2026-11-30" }, today))
      .toEqual({ ok: false, error: "The Star online: Leaderboard can start on 20 Nov at the earliest." });
  });
  it("refuses an end before the start", () => {
    expect(priceLine(leaderboard, { id: leaderboard.id, option: null, qty: 1, budget: 15000, start: "2026-11-25", end: "2026-11-24" }, today))
      .toEqual({ ok: false, error: "The Star online: Leaderboard ends before it starts." });
  });
  it("refuses a listing that can't be booked online", () => {
    expect(priceLine(sponsorship, { id: sponsorship.id, option: "Breakfast show", qty: 1, start: "2026-11-23" }, today))
      .toEqual({ ok: false, error: "Kiss 100: Show sponsorship can't be booked online." });
  });
  it("counts picked dates as the quantity", () => {
    const p = priceLine(starPrint, { id: starPrint.id, option: "Half page", qty: 5, dates: ["2026-11-24", "2026-11-20", "2026-11-24"] }, today);
    expect(p).toMatchObject({ ok: true, line: { qty: 2, dates: ["2026-11-20", "2026-11-24"], total: 260000, start: "2026-11-20", end: "2026-11-24" } });
  });
});

describe("totals", () => {
  it("adds production once and VAT on everything", () => {
    expect(bookingTotals([350000, 15000], ["audio"], { audio: 50000, banner: 15000, print: 12000 }))
      .toEqual({ media: 365000, production: 50000, vat: 66400, total: 481400 });
    expect(bookingTotals([350000], ["script"], { audio: 50000 }).production).toBe(0);
  });
});

describe("ways to pay", () => {
  it("warns about M-Pesa's limit", () => {
    expect(payMethods(300000, { pesapal: true, bank: true })).toEqual([
      { method: "pesapal", note: "M-Pesa takes up to KES 250,000 a payment: use a card for this amount." },
      { method: "bank", note: null },
    ]);
  });
  it("warns about PesaLink's limit", () => {
    expect(payMethods(1_200_000, { pesapal: false, bank: true })).toEqual([
      { method: "bank", note: "PesaLink takes up to KES 999,999 a transfer: send it in parts, or by RTGS." },
    ]);
  });
  it("offers nothing above the online limit", () => {
    expect(payMethods(6_000_000, { pesapal: true, bank: true })).toEqual([]);
  });
});

describe("Pesapal's answer", () => {
  it("counts only a completed payment of the full amount in KES", () => {
    expect(pesapalPaid({ status_code: 1, amount: 481400, currency: "KES", confirmation_code: "QK12", payment_method: "MpesaKE" }, 481400))
      .toEqual({ paid: true, ref: "QK12", method: "MpesaKE" });
    expect(pesapalPaid({ status_code: 1, amount: 1000, currency: "KES" }, 481400).paid).toBe(false);
    expect(pesapalPaid({ status_code: 2, amount: 481400, currency: "KES" }, 481400).paid).toBe(false);
  });
});

describe("references, tokens and file names", () => {
  it("makes readable references and long tokens", () => {
    expect(newRef()).toMatch(/^BK-[2-9A-HJ-NP-Z]{6}$/);
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it("tidies file names", () => {
    expect(safeFileName("My Logo (final).PNG")).toBe("my-logo-final.png");
  });
});
