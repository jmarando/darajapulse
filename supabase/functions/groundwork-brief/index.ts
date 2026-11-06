// Groundwork sends a campaign's brief; Pulse files it as a draft campaign under its own client and keeps
// the link. The first send makes the client, the campaign and the link; every send after that updates
// the campaign's brief. Called server to server with the groundwork job key (see _shared/groundwork-call.ts).
// What it checks and writes: _shared/groundwork-link.ts.
import { admin, json, linkedCampaign, openGroundworkCall } from "../_shared/groundwork-call.ts";
import {
  type BriefRequest,
  campaignColumns,
  checkBriefRequest,
  clientColumns,
  newCampaignRow,
} from "../_shared/groundwork-link.ts";

const UNIQUE_VIOLATION = "23505";

/** The client this brief is filed under: the agency's own of that name, or a new one. */
async function clientFor(brief: BriefRequest, agencyId: string): Promise<string> {
  const plain = clientColumns(brief, agencyId);
  const { data: found, error } = await admin
    .from("clients")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("slug", plain.slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (found) return found.id as string;
  let made = await admin.from("clients").insert(plain).select("id").single();
  // Client slugs are unique across agencies, so another agency's client of this name makes us try once more.
  if (made.error?.code === UNIQUE_VIOLATION) {
    made = await admin.from("clients").insert(clientColumns(brief, agencyId, true)).select("id").single();
  }
  if (made.error) throw new Error(made.error.message);
  return made.data.id as string;
}

async function update(campaignId: string, brief: BriefRequest, agencyId: string) {
  const { data, error } = await admin
    .from("campaigns")
    .update(campaignColumns(brief))
    .eq("id", campaignId)
    .eq("agency_id", agencyId)
    .select("id, status")
    .single();
  if (error) throw new Error(error.message);
  return { pulse_campaign_id: data.id as string, status: data.status as string, created: false };
}

async function create(brief: BriefRequest, agencyId: string) {
  const clientId = await clientFor(brief, agencyId);
  const ids = { id: crypto.randomUUID(), agencyId, clientId };
  let made = await admin.from("campaigns").insert(newCampaignRow(brief, ids)).select("id, status").single();
  // A client's campaign slugs are unique too: a second campaign of the same name gets the Groundwork id on it.
  if (made.error?.code === UNIQUE_VIOLATION) {
    made = await admin.from("campaigns").insert(newCampaignRow(brief, ids, true)).select("id, status").single();
  }
  if (made.error) throw new Error(made.error.message);
  const linked = await admin.from("groundwork_links").insert({
    groundwork_campaign_id: brief.groundwork_campaign_id,
    campaign_id: made.data.id,
    client_id: clientId,
    agency_id: agencyId,
  });
  if (!linked.error) return { pulse_campaign_id: made.data.id as string, status: made.data.status as string, created: true };
  // Two first sends can race. The one that lost removes the campaign it just made (nothing else knows it) and updates the winner's.
  await admin.from("campaigns").delete().eq("id", made.data.id);
  if (linked.error.code !== UNIQUE_VIOLATION) throw new Error(linked.error.message);
  const winner = await linkedCampaign(brief.groundwork_campaign_id, agencyId);
  return winner ? update(winner, brief, agencyId) : null;
}

Deno.serve(async (req) => {
  const call = await openGroundworkCall(req);
  if (call instanceof Response) return call;
  const checked = checkBriefRequest(call.body);
  if (!checked.ok) return json({ error: checked.error }, 400);
  try {
    const brief = checked.value;
    const campaignId = await linkedCampaign(brief.groundwork_campaign_id, call.agencyId);
    const answer = campaignId ? await update(campaignId, brief, call.agencyId) : await create(brief, call.agencyId);
    // No answer means the link exists, but in another agency: not ours to touch.
    return answer ? json(answer) : json({ error: "This Groundwork campaign is linked in another agency." }, 409);
  } catch (e) {
    console.error("groundwork-brief failed:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "Pulse could not save the brief." }, 500);
  }
});
