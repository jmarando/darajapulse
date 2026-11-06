// Story frames from connected accounts: which campaigns a frame counts for, and the key it's saved under.

/** The columns stories-sync upserts on. They must match the unique index stories_campaign_frame_uniq exactly. */
export const STORY_FRAME_KEY = "campaign_id,platform,external_id";

/** A campaign the creator is on, as campaign_influencers returns it with its campaign. */
export type CampaignWindow = {
  campaign_id: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** East Africa Time, where the campaigns run: a story posted at 01:00 on a campaign's first day counts on that day. */
const EAT_OFFSET_MS = 3 * 3600_000;

/**
 * The campaigns a frame posted at `postedAt` counts for: not drafts, and its day (East Africa Time) within the campaign's
 * dates, where the campaign has them. A creator on two campaigns that ended months apart then gets each frame on the one
 * that's running, not on both.
 */
export function campaignsRunningOn(postedAt: string, campaigns: CampaignWindow[]): string[] {
  const when = Date.parse(postedAt);
  const day = new Date((Number.isFinite(when) ? when : Date.now()) + EAT_OFFSET_MS).toISOString().slice(0, 10);
  return campaigns
    .filter((c) => c.status !== "draft")
    .filter((c) => (!c.start_date || day >= c.start_date.slice(0, 10)) && (!c.end_date || day <= c.end_date.slice(0, 10)))
    .map((c) => c.campaign_id);
}
