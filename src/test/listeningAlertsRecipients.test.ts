import { describe, expect, it } from "vitest";
import { MAX_RECIPIENTS, parseRecipients } from "@/lib/listeningAlerts";

const list = (n: number) => Array.from({ length: n }, (_, i) => `person${i}@agency.test`).join("\n");

describe("parseRecipients", () => {
  it("splits on commas, semicolons, spaces and new lines", () => {
    expect(parseRecipients("a@agency.test, b@agency.test;c@agency.test d@agency.test\ne@agency.test").emails).toEqual([
      "a@agency.test", "b@agency.test", "c@agency.test", "d@agency.test", "e@agency.test",
    ]);
  });

  it("lowercases, and keeps each address once in the order it was first typed", () => {
    expect(parseRecipients("Ann@Agency.test b@agency.test ANN@agency.test").emails).toEqual(["ann@agency.test", "b@agency.test"]);
  });

  it("hands back what is not an address, as typed, and keeps it out of the list", () => {
    const out = parseRecipients("ann@agency.test, nope, bob@, @agency.test, a@b");
    expect(out.emails).toEqual(["ann@agency.test"]);
    expect(out.invalid).toEqual(["nope", "bob@", "@agency.test", "a@b"]);
  });

  it("does not take a pasted \"Name <address>\" for an address", () => {
    const out = parseRecipients("Ann <ann@agency.test>");
    expect(out.emails).toEqual([]);
    expect(out.invalid).toEqual(["Ann", "<ann@agency.test>"]);
  });

  it("finds nothing in empty text or stray separators", () => {
    expect(parseRecipients(" ,; \n ")).toEqual({ emails: [], invalid: [], tooMany: false });
  });

  it("says when there are more than 10 addresses, and not at 10", () => {
    expect(MAX_RECIPIENTS).toBe(10);
    expect(parseRecipients(list(MAX_RECIPIENTS)).tooMany).toBe(false);
    expect(parseRecipients(list(MAX_RECIPIENTS + 1)).tooMany).toBe(true);
  });
});
