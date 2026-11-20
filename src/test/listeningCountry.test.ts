import { describe, expect, it } from "vitest";
import { COUNTRY_NAMES, LISTENING_COUNTRIES, countryOf, defaultCountry } from "../../supabase/functions/_shared/listening-country";

// Which country a brand listens in. Every brand so far says "Kenya", so anything unclear must stay Kenya.

describe("countryOf", () => {
  it("reads Uganda by name or code, in any case", () => {
    for (const v of ["Uganda", "uganda", " UGANDA ", "UG", "ug"]) expect(countryOf(v).code).toBe("UG");
  });

  it("keeps Kenya for Kenya and for anything it can't read, so no brand changes by accident", () => {
    for (const v of ["Kenya", "KE", "", "   ", null, undefined, "Tanzania", "Ugandaa"]) expect(countryOf(v).code).toBe("KE");
  });
});

describe("the profiles", () => {
  it("leaves Kenya's searches as they always were", () => {
    expect(LISTENING_COUNTRIES.KE).toMatchObject({ name: "Kenya", adjective: "Kenyan", searchRegion: null, serperGl: "ke", countryWord: "kenya" });
    expect(LISTENING_COUNTRIES.KE.promptIntro).toBe("You monitor Kenyan social media for consumer brands. Text may mix English, Kiswahili and Sheng.");
  });

  it("searches from Uganda, for Uganda, for a Ugandan brand", () => {
    expect(LISTENING_COUNTRIES.UG).toMatchObject({ name: "Uganda", adjective: "Ugandan", searchRegion: "UG", serperGl: "ug", countryWord: "uganda" });
    expect(LISTENING_COUNTRIES.UG.promptIntro).toMatch(/^You monitor Ugandan social media for consumer brands\./);
    expect(LISTENING_COUNTRIES.UG.promptIntro).toContain("Luganda");
  });

  it("offers Kenya, then Uganda, in the client form", () => {
    expect(COUNTRY_NAMES).toEqual(["Kenya", "Uganda"]);
  });
});

describe("defaultCountry", () => {
  it("starts a new brand on the country most of the workspace's brands use", () => {
    expect(defaultCountry([{ country: "Kenya" }, { country: "Kenya" }, { country: "Uganda" }])).toBe("Kenya");
    expect(defaultCountry([{ country: "Uganda" }])).toBe("Uganda");
    expect(defaultCountry([{ country: null }, { country: "Uganda" }, { country: "uganda" }])).toBe("Uganda");
  });

  it("asks when the workspace has no brands yet, or its brands are split evenly", () => {
    expect(defaultCountry([])).toBe("");
    expect(defaultCountry([{ country: "Kenya" }, { country: "Uganda" }])).toBe("");
  });
});
