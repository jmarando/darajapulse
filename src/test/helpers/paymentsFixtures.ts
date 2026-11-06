// Builders for tests of the Payments tab. No mocks here: each test file stands in for the database itself.
import type { ComponentProps } from "react";
import type CampaignPayments from "@/components/CampaignPayments";

type Props = ComponentProps<typeof CampaignPayments>;

const creator = (influencerId: string, name: string) => ({
  id: `ci-${influencerId}`, influencer_id: influencerId, fee_kes: 0, deliverables_count: 1, influencers: { full_name: name },
});

/** Props for three signed creators on a Royco-style (view-tier) campaign of agency a1. */
export const props = (over: Partial<Props> = {}): Props => ({
  campaignId: "c1",
  agencyId: "a1",
  campaignName: "Royco KE Q3 Nano Influencer Campaign",
  clientName: "Royco",
  roster: [creator("i1", "Jane Wanjiku"), creator("i2", "Peter Otieno"), creator("i3", "Wanjiru Kamau")],
  signatures: [{ campaign_influencer_id: "ci-i1" }, { campaign_influencer_id: "ci-i2" }, { campaign_influencer_id: "ci-i3" }],
  posts: [],
  metrics: [],
  whtPercent: 5,
  paymentTermsDays: null,
  onRefreshMetrics: async () => {},
  ...over,
});

/** A creator_payout_details row as the database returns it. */
export const detailsRow = (influencerId: string, over: Record<string, unknown> = {}) => ({
  id: `d-${influencerId}`, agency_id: "a1", influencer_id: influencerId,
  mpesa_number: "254712345678", mpesa_name: "Jane Kamau", kra_pin: "A123456789Z", legal_name: "Jane Wanjiku Kamau", id_number: "12345678",
  vat_registered: false, bii_consent_at: "2026-10-31T08:00:00Z", confirmed_at: "2026-10-31T08:00:00Z",
  last_changed_by_kind: "creator", mpesa_changed_at: null, mpesa_changed_by_kind: null, updated_at: "2026-10-31T08:00:00Z",
  ...over,
});
