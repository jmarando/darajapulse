export type ContestView = "contests" | "submissions";
export type CampaignTabState = { tab: string; view: ContestView };

const TABS = ["overview", "creators", "drafts", "payments", "contests", "rsvps", "emails", "share"];

/**
 * Which tab a campaign link opens, and which view inside Contests. Submissions used to be a tab of its
 * own, so an old link to it opens Contests on its Submissions view. A tab the campaign doesn't have
 * (Creators on a contests-only campaign, RSVPs with none) opens the default instead of a blank page.
 */
export function resolveCampaignTab(params: URLSearchParams, { isContestOnly, hasRsvps }: { isContestOnly: boolean; hasRsvps: boolean }): CampaignTabState {
  const fallback = isContestOnly ? "contests" : "overview";
  let tab = params.get("tab") || fallback;
  let view: ContestView = params.get("view") === "submissions" ? "submissions" : "contests";
  if (tab === "submissions") {
    tab = "contests";
    view = "submissions";
  }
  const available = TABS.filter((t) => !(t === "creators" && isContestOnly) && !(t === "rsvps" && !hasRsvps));
  return { tab: available.includes(tab) ? tab : fallback, view };
}
