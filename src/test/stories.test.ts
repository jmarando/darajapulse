import { describe, expect, it } from "vitest";
import { STORY_FRAME_KEY, campaignsRunningOn, type CampaignWindow } from "../../supabase/functions/_shared/stories";

describe("stories shared key", () => {
  it("keys a frame by campaign, platform and id, so the same frame can count on two campaigns", () => {
    // Must match stories_campaign_frame_uniq exactly, or Postgres cannot use the index for ON CONFLICT.
    expect(STORY_FRAME_KEY).toBe("campaign_id,platform,external_id");
  });
});

describe("campaignsRunningOn", () => {
  const running: CampaignWindow = { campaign_id: "c1", status: "live", start_date: "2026-11-01", end_date: "2026-11-30" };

  it("counts a frame on the campaign running on its East Africa day", () => {
    expect(campaignsRunningOn("2026-11-15T10:00:00Z", [running])).toEqual(["c1"]);
  });

  it("counts a 01:00 East Africa frame on the campaign's first day", () => {
    // 22:00 UTC is 01:00 EAT the next day.
    expect(campaignsRunningOn("2026-10-31T22:00:00Z", [running])).toEqual(["c1"]);
    // 20:59 UTC is still 23:59 the day before in EAT.
    expect(campaignsRunningOn("2026-10-31T20:59:00Z", [running])).toEqual([]);
  });

  it("excludes drafts", () => {
    expect(campaignsRunningOn("2026-11-15T10:00:00Z", [{ ...running, status: "draft" }])).toEqual([]);
  });

  it("puts a frame on the one campaign that's running, not both months apart", () => {
    const june = { campaign_id: "june", status: "live", start_date: "2026-06-01", end_date: "2026-06-30" };
    const november = { campaign_id: "nov", status: "live", start_date: "2026-11-01", end_date: "2026-11-30" };
    expect(campaignsRunningOn("2026-11-15T10:00:00Z", [june, november])).toEqual(["nov"]);
    expect(campaignsRunningOn("2026-06-15T10:00:00Z", [june, november])).toEqual(["june"]);
  });

  it("includes the start and end days", () => {
    expect(campaignsRunningOn("2026-11-01T09:00:00Z", [running])).toEqual(["c1"]);
    expect(campaignsRunningOn("2026-11-30T09:00:00Z", [running])).toEqual(["c1"]);
    expect(campaignsRunningOn("2026-10-31T09:00:00Z", [running])).toEqual([]);
    expect(campaignsRunningOn("2026-12-01T09:00:00Z", [running])).toEqual([]);
  });

  it("runs a campaign with no dates", () => {
    expect(campaignsRunningOn("2026-11-15T10:00:00Z", [{ campaign_id: "c2", status: "live" }])).toEqual(["c2"]);
    expect(campaignsRunningOn("2026-11-15T10:00:00Z", [{ campaign_id: "c3" }])).toEqual(["c3"]);
  });

  it("keeps a frame on two overlapping live campaigns", () => {
    const a = { campaign_id: "a", status: "live", start_date: "2026-11-01", end_date: "2026-11-30" };
    const b = { campaign_id: "b", status: "live", start_date: "2026-11-10", end_date: "2026-12-10" };
    expect(campaignsRunningOn("2026-11-15T10:00:00Z", [a, b]).sort()).toEqual(["a", "b"]);
  });

  it("falls back to now for an unreadable timestamp", () => {
    const nowDate = new Date().toISOString();
    const today = nowDate.slice(0, 10);
    const c = { campaign_id: "c", status: "live", start_date: today, end_date: today };
    expect(campaignsRunningOn("not-a-date", [c])).toEqual(["c"]);
  });
});
