// Groundwork's office has approached a voice for a campaign and sends Pulse who it is and what was said.
// Pulse files the voice against the linked campaign, apart from the shared creator roster, and answers
// its id and where it stands. Answers 404 when the Groundwork campaign has no Pulse campaign. Called
// server to server with the groundwork job key (see _shared/groundwork-call.ts). What it checks and
// writes: _shared/groundwork-link.ts.
import { admin, json, linkedCampaign, NOT_LINKED, openGroundworkCall } from "../_shared/groundwork-call.ts";
import { checkProspectRequest, prospectRow } from "../_shared/groundwork-link.ts";

Deno.serve(async (req) => {
  const call = await openGroundworkCall(req);
  if (call instanceof Response) return call;
  const checked = checkProspectRequest(call.body);
  if (!checked.ok) return json({ error: checked.error }, 400);
  try {
    const prospect = checked.value;
    const campaignId = await linkedCampaign(prospect.groundwork_campaign_id, call.agencyId);
    if (!campaignId) return json({ error: NOT_LINKED }, 404);
    // One row per campaign, platform and handle: a repeat send updates the details and leaves the status where it is.
    const { data, error } = await admin
      .from("groundwork_prospects")
      .upsert(prospectRow(prospect, { agencyId: call.agencyId, campaignId }), { onConflict: "campaign_id,platform,handle" })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return json({ prospect_id: data.id as string, status: data.status as string });
  } catch (e) {
    console.error("groundwork-prospect failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Pulse could not save the voice." }, 500);
  }
});
