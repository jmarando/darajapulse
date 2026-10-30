import { describe, expect, it } from "vitest";
import { KRA_BATCH_HEADERS, buildKraBatchCsv, formatKraDate, kraLocalPhone, type KraBatchInput } from "@/lib/payouts/kraBatch";

const row: KraBatchInput = {
  payoutId: "p1", legalName: "Jane Wanjiku", idNumber: "12345678", phone: "254712345678", grossKes: 5000,
  itemName: "Content creation: Royco Q3 Nano campaign",
};
const when = new Date("2026-10-30T22:30:00Z"); // 31 Oct, 01:30 in Nairobi

describe("KRA batch invoice file", () => {
  it("writes the header, then one quoted line per creator", () => {
    const out = buildKraBatchCsv([row], when);
    const lines = out.csv.split("\r\n");
    expect(lines[0]).toBe(KRA_BATCH_HEADERS.map((h) => `"${h}"`).join(","));
    expect(lines[1]).toBe('"Jane Wanjiku","12345678","0712345678","31/10/2026","Content creation: Royco Q3 Nano campaign","1","5000","0","5000"');
    expect(lines).toHaveLength(2);
    expect(out.included).toEqual(["p1"]);
    expect(out.skipped).toEqual([]);
  });

  it("dates the invoice in Nairobi time", () => {
    expect(formatKraDate(new Date("2026-10-30T22:30:00Z"))).toBe("31/10/2026");
    expect(formatKraDate(new Date("2026-10-30T20:59:00Z"))).toBe("30/10/2026");
  });

  it("gives the phone the way KRA's file expects it", () => {
    expect(kraLocalPhone("254712345678")).toBe("0712345678");
    expect(kraLocalPhone("254112345678")).toBe("0112345678");
  });

  it("leaves out a creator with nothing to invoice, and says why", () => {
    const out = buildKraBatchCsv([{ ...row, grossKes: 0 }], when);
    expect(out.skipped).toEqual([{ payoutId: "p1", reason: "Nothing to invoice (KES 0)" }]);
    expect(out.included).toEqual([]);
    expect(out.csv.split("\r\n")).toHaveLength(1); // the header alone
  });

  it("leaves out incomplete details", () => {
    expect(buildKraBatchCsv([{ ...row, idNumber: "123" }], when).skipped[0].reason).toBe("Details incomplete");
    expect(buildKraBatchCsv([{ ...row, phone: "0712345678" }], when).skipped[0].reason).toBe("Details incomplete");
    expect(buildKraBatchCsv([{ ...row, legalName: "  " }], when).skipped[0].reason).toBe("Details incomplete");
  });

  it("keeps commas, quotes and accents in a name intact", () => {
    expect(buildKraBatchCsv([{ ...row, legalName: `Njeri "NJ", O'Brien Wanjiru` }], when).csv).toContain(`"Njeri ""NJ"", O'Brien Wanjiru"`);
    expect(buildKraBatchCsv([{ ...row, legalName: "Zoë Mwangi" }], when).csv).toContain('"Zoë Mwangi"');
  });

  it("won't let a name turn into a spreadsheet formula", () => {
    for (const legalName of ['=HYPERLINK("http://x") Evil', "+1 Evil", "-1 Evil", "@SUM Evil"]) {
      expect(buildKraBatchCsv([{ ...row, legalName }], when).skipped[0].reason).toBe("Details incomplete");
    }
  });

  it("prints whole amounts plainly and others to two decimals", () => {
    expect(buildKraBatchCsv([{ ...row, grossKes: 4999.5 }], when).csv).toContain('"4999.50","0","4999.50"');
  });

  it("includes some creators and skips others in one file", () => {
    const out = buildKraBatchCsv([row, { ...row, payoutId: "p2", grossKes: 0 }, { ...row, payoutId: "p3", legalName: "Peter Otieno" }], when);
    expect(out.included).toEqual(["p1", "p3"]);
    expect(out.skipped).toEqual([{ payoutId: "p2", reason: "Nothing to invoice (KES 0)" }]);
    expect(out.csv.split("\r\n")).toHaveLength(3);
  });
});
