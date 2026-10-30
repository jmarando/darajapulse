import { describe, expect, it } from "vitest";
import {
  isValidIdNumber,
  isValidKraPin,
  normaliseKenyanMobile,
  normaliseKraPin,
  validateDetailsInput,
} from "@/lib/payouts/details";

describe("creator payout detail validators", () => {
  it.each([
    ["0712 345 678", "254712345678"],
    ["+254 712-345-678", "254712345678"],
    ["254712345678", "254712345678"],
    ["0112345678", "254112345678"],
    ["712345678", "254712345678"],
  ])("normalises %s", (raw, want) => expect(normaliseKenyanMobile(raw)).toBe(want));

  it.each(["0812345678", "07123456", "2547123456789", "", "abc"])("rejects %s", (raw) =>
    expect(normaliseKenyanMobile(raw)).toBeNull());

  it("checks KRA PINs", () => {
    expect(normaliseKraPin(" a123456789z ")).toBe("A123456789Z");
    expect([isValidKraPin("A123456789Z"), isValidKraPin("B123456789Z"), isValidKraPin("A12345678Z")]).toEqual([true, false, false]);
  });

  it("checks ID numbers", () =>
    expect(["12345678", "1234567", "123456", "1234567a"].map(isValidIdNumber)).toEqual([true, true, false, false]));

  it("validates a whole form", () => {
    const ok = {
      mpesaNumber: "0712345678", mpesaNumberConfirm: "0712 345 678", mpesaName: "Jane W Kamau", kraPin: "a123456789z",
      legalName: "  Jane  Wanjiku Kamau ", idNumber: "12345678", vatRegistered: false, biiConsent: true,
    };
    expect(validateDetailsInput(ok)).toEqual({
      ok: true,
      value: {
        mpesaNumber: "254712345678", mpesaName: "Jane W Kamau", kraPin: "A123456789Z", legalName: "Jane Wanjiku Kamau",
        idNumber: "12345678", vatRegistered: false, biiConsent: true,
      },
    });
    expect(validateDetailsInput({ ...ok, mpesaNumberConfirm: "0722000000" }))
      .toMatchObject({ ok: false, errors: { mpesaNumberConfirm: "The two numbers don't match" } });
    expect(validateDetailsInput({ ...ok, biiConsent: false })).toMatchObject({ ok: false, errors: { biiConsent: expect.any(String) } });
    expect(validateDetailsInput({ ...ok, biiConsent: false, vatRegistered: true }).ok).toBe(true);
    expect(validateDetailsInput({ ...ok, legalName: "Jane" }))
      .toMatchObject({ ok: false, errors: { legalName: "Enter your full name as it appears on your ID" } });
  });
});
