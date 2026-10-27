import { describe, expect, it } from "vitest";
import { resolveCampaignTab } from "@/lib/campaignTabs";

const at = (query: string, opts: Partial<{ isContestOnly: boolean; hasRsvps: boolean }> = {}) =>
  resolveCampaignTab(new URLSearchParams(query), { isContestOnly: false, hasRsvps: false, ...opts });

describe("resolveCampaignTab", () => {
  it("opens the Overview, or the contests when the campaign is only contests", () => {
    expect(at("")).toEqual({ tab: "overview", view: "contests" });
    expect(at("", { isContestOnly: true })).toEqual({ tab: "contests", view: "contests" });
  });

  it("opens the tab the link names", () => {
    for (const tab of ["overview", "creators", "drafts", "payments", "contests", "emails", "share"]) {
      expect(at(`tab=${tab}`).tab).toBe(tab);
    }
  });

  it("opens the Submissions view for an old link to the Submissions tab", () => {
    expect(at("tab=submissions")).toEqual({ tab: "contests", view: "submissions" });
  });

  it("opens the contests view the link names", () => {
    expect(at("tab=contests&view=submissions")).toEqual({ tab: "contests", view: "submissions" });
    expect(at("tab=contests&view=contests")).toEqual({ tab: "contests", view: "contests" });
  });

  it("falls back to the linked contests for a view it doesn't know", () => {
    expect(at("tab=contests&view=nonsense").view).toBe("contests");
  });

  it("falls back to the default for a tab it doesn't know", () => {
    expect(at("tab=nonsense")).toEqual({ tab: "overview", view: "contests" });
    expect(at("tab=nonsense", { isContestOnly: true }).tab).toBe("contests");
  });

  it("skips tabs the campaign doesn't have", () => {
    expect(at("tab=creators", { isContestOnly: true }).tab).toBe("contests");
    expect(at("tab=rsvps").tab).toBe("overview");
    expect(at("tab=rsvps", { hasRsvps: true }).tab).toBe("rsvps");
  });
});
