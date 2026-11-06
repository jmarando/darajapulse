export type CampaignForLink = {
  id: string;
  name: string;
  hashtag: string | null;
  start_date: string | null;
  end_date: string | null;
  agency_id: string | null;
  client_id: string | null;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * A campaign's submission link is a row in `contests`: the brief, the personal /c/<token>?k=<brief> page and the
 * brief email all read its token, and a final post link is saved against it. This is the row for a campaign that
 * only needs the link, named and shaped like the ones made by hand for OMO and Royco.
 */
export const submissionContestRow = (c: CampaignForLink, today = new Date()) => {
  const start = c.start_date ?? isoDay(today.getTime());
  const tag = (c.hashtag ?? "").trim().replace(/^#+/, "");
  return {
    campaign_id: c.id,
    client_id: c.client_id,
    // Set here because the database otherwise files it under the agency of whoever clicked, and a super admin's
    // click would hide it from the campaign's own staff.
    agency_id: c.agency_id,
    name: `${c.name} — Post Submissions`,
    hashtag: tag ? `#${tag}` : "",
    platforms: ["instagram", "tiktok", "facebook"],
    // The table requires both dates. Nothing stops a submission after the end date.
    start_date: start,
    end_date: c.end_date ?? isoDay(Date.parse(start) + 90 * 86_400_000),
    // The public pages read no prize as a collaboration.
    prize: null,
  };
};
