// Groundwork asks what a linked campaign has: its creators, their posts at peak, what they were paid and
// the voices approached. Answers 404 when the Groundwork campaign has no Pulse campaign. Called server to
// server with the groundwork job key (see _shared/groundwork-call.ts). The answer's shape and Groundwork's
// drop rules: _shared/groundwork-link.ts.
import { admin, allRows, json, linkedCampaign, NOT_LINKED, openGroundworkCall } from "../_shared/groundwork-call.ts";
import {
  checkReportRequest,
  type PayoutRow,
  type PeakRow,
  type PostRow,
  type ProspectRow,
  type RosterRow,
  shapeReport,
} from "../_shared/groundwork-link.ts";

Deno.serve(async (req) => {
  const call = await openGroundworkCall(req);
  if (call instanceof Response) return call;
  const asked = checkReportRequest(call.body);
  if (!asked.ok) return json({ error: asked.error }, 400);
  try {
    const campaignId = await linkedCampaign(asked.value, call.agencyId);
    if (!campaignId) return json({ error: NOT_LINKED }, 404);
    const [campaign, roster, posts, peaks, payouts, prospects] = await Promise.all([
      admin.from("campaigns").select("id, status").eq("id", campaignId).eq("agency_id", call.agencyId).single(),
      allRows<RosterRow>((a, b) =>
        admin
          .from("campaign_influencers")
          .select("fee_kes, status, influencers(id, full_name, handle, primary_platform, follower_count)")
          .eq("campaign_id", campaignId)
          .order("created_at")
          .range(a, b),
      ),
      allRows<PostRow>((a, b) =>
        admin
          .from("posts")
          .select("id, influencer_id, platform, post_url, posted_at, status")
          .eq("campaign_id", campaignId)
          .order("created_at")
          .range(a, b),
      ),
      // Each post's peak, the way the dashboards read it. A post with no snapshot comes back with no timestamp.
      allRows<PeakRow>((a, b) =>
        admin.rpc("campaign_post_peak_metrics", { target_campaign_id: campaignId }).order("post_id").range(a, b),
      ),
      allRows<PayoutRow>((a, b) =>
        admin
          .from("payouts")
          .select("id, influencer_id, gross_kes, wht_kes, net_kes, status, paid_at, mpesa_ref")
          .eq("campaign_id", campaignId)
          .order("created_at")
          .range(a, b),
      ),
      allRows<ProspectRow>((a, b) =>
        admin.from("groundwork_prospects").select("id, status").eq("campaign_id", campaignId).order("created_at").range(a, b),
      ),
    ]);
    if (campaign.error) throw new Error(campaign.error.message);
    return json(shapeReport({ campaign: campaign.data, roster, posts, peaks, payouts, prospects }));
  } catch (e) {
    console.error("groundwork-report failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Pulse could not read the campaign." }, 500);
  }
});
