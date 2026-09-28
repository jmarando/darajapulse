import { describe, expect, it } from "vitest";
import { resolveCampaignBrand } from "../../supabase/functions/_shared/campaign-brand";

describe("campaign email brand resolution", () => {
  it("routes OMO separately from its Unilever sister brand", () => {
    const omo = resolveCampaignBrand("OMO Q4 Nano Influencer Campaign", "Unilever - OMO");
    expect(omo.briefTemplate).toBe("omo-brief-live");
    expect(omo.from).toContain("omo@notify.darajapulse.com");
    expect(omo.replyTo).toBe("omo@reply.darajapulse.com");
    expect(omo.accent).toBe("#0033A0");
  });
  it("keeps Royco-specific email copy on Royco", () => {
    const royco = resolveCampaignBrand("Royco KE Q3 Nano", "Unilever");
    expect(royco.briefTemplate).toBe("royco-brief-live");
    expect(royco.decisionTemplate).toBe("royco-draft-decision");
  });
  it("uses neutral templates and address for another client", () => {
    const brand = resolveCampaignBrand("Finance Q4", "PesaLink");
    expect(brand.briefTemplate).toBe("campaign-brief-live");
    expect(brand.decisionTemplate).toBe("campaign-draft-decision");
    expect(brand.from).toContain("campaigns@notify.darajapulse.com");
    expect(brand.name).toBe("PesaLink");
  });
});