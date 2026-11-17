import { describe, expect, it } from "vitest";
import { editFrom, rowPatch, settingsPatch, type PriceEdit } from "@/lib/storefrontPrices";

const blank: PriceEdit = { bookable: true, price_model: "unit", price: "", price_unit: "", min_spend: "", options: [] };

describe("saving a listing's price", () => {
  it("sells by 1,000 views with a minimum", () => {
    expect(rowPatch({ ...blank, price_model: "cpm", price: "300", min_spend: "15000" })).toEqual({
      ok: true,
      patch: { bookable: true, price_model: "cpm", base_rate_kes: 300, price_unit: "1,000 views", min_spend_kes: 15000, options: null },
    });
  });

  it("keeps the lowest choice as the listing's price and drops empty rows", () => {
    const r = rowPatch({ ...blank, price_unit: "insertion", options: [
      { label: "18 × 6", price: "60000", unit: "" }, { label: "Quarter page", price: "75000", unit: "" }, { label: "", price: "", unit: "" },
    ] });
    expect(r).toMatchObject({ ok: true, patch: { base_rate_kes: 60000, options: [{ label: "18 × 6", price_kes: 60000 }, { label: "Quarter page", price_kes: 75000 }] } });
  });

  it("keeps a named choice without a price, as on request", () => {
    const r = rowPatch({ ...blank, bookable: false, options: [{ label: "Kiss Nights", price: "", unit: "" }] });
    expect(r).toMatchObject({ ok: true, patch: { base_rate_kes: 0, options: [{ label: "Kiss Nights" }] } });
  });

  it("refuses two choices with one name", () => {
    expect(rowPatch({ ...blank, options: [{ label: "Half page", price: "1", unit: "" }, { label: "half page", price: "2", unit: "" }] }))
      .toEqual({ ok: false, error: "Each choice needs its own name." });
  });

  it("won't book online what has no price", () => {
    expect(rowPatch({ ...blank, price: "" })).toEqual({ ok: false, error: "Give it a price before booking it online." });
  });

  it("reads a saved listing back into the form", () => {
    expect(editFrom({ bookable: true, price_model: "cpm", base_rate_kes: 300, price_unit: "1,000 views", min_spend_kes: 15000, options: null }))
      .toEqual({ bookable: true, price_model: "cpm", price: "300", price_unit: "1,000 views", min_spend: "15000", options: [] });
  });
});

describe("saving the storefront's settings", () => {
  it("keeps fees as numbers and empty details as nothing", () => {
    const { agency, payment } = settingsPatch({
      show_prices: true, booking: "test", support_email: " ads@example.com ", audio: "50000", banner: "", print: "12000",
      account_name: "Example Account Ltd", bank_name: "", bank_branch: "", account_number: "0011", paybill: "", paybill_account: "",
    });
    expect(agency).toEqual({
      storefront_show_prices: true, storefront_booking: "test", support_email: "ads@example.com",
      storefront_production: { audio: 50000, print: 12000 },
    });
    expect(payment).toEqual({ account_name: "Example Account Ltd", bank_name: null, bank_branch: null, account_number: "0011", paybill: null, paybill_account: null });
  });
});
