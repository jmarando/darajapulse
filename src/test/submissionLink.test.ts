import { describe, expect, it } from "vitest";
import { submissionContestRow } from "@/lib/submissionLink";

const campaign = {
  id: "camp-1",
  name: "Uber Safety",
  hashtag: "UberKenya",
  start_date: null,
  end_date: null,
  agency_id: "agency-yellow",
  client_id: "client-uber",
};
const today = new Date("2026-11-05T09:00:00Z");

describe("the contest row behind a campaign's submission link", () => {
  it("is filed under the campaign's own agency, so a super admin's click can't hide it from that agency's staff", () => {
    const row = submissionContestRow(campaign, today);
    expect(row.agency_id).toBe("agency-yellow");
    expect(row.campaign_id).toBe("camp-1");
    expect(row.client_id).toBe("client-uber");
  });

  it.each([
    ["UberKenya", "#UberKenya"],
    ["#UberKenya", "#UberKenya"],
    ["  #UberKenya ", "#UberKenya"],
    ["", ""],
    [null, ""],
  ])("turns the campaign hashtag %j into %j", (hashtag, want) => {
    expect(submissionContestRow({ ...campaign, hashtag }, today).hashtag).toBe(want);
  });

  it("uses the campaign's dates when it has them", () => {
    const row = submissionContestRow({ ...campaign, start_date: "2026-12-01", end_date: "2027-01-15" }, today);
    expect(row.start_date).toBe("2026-12-01");
    expect(row.end_date).toBe("2027-01-15");
  });

  it("runs 90 days from today when the campaign has no dates, because both columns are required", () => {
    const row = submissionContestRow(campaign, today);
    expect(row.start_date).toBe("2026-11-05");
    expect(row.end_date).toBe("2027-02-03");
  });

  it("runs 90 days from the campaign's start when only the end date is missing", () => {
    expect(submissionContestRow({ ...campaign, start_date: "2026-12-01" }, today).end_date).toBe("2027-03-01");
  });

  it("has no prize, because the public pages read a prize as a contest and no prize as a collaboration", () => {
    expect(submissionContestRow(campaign, today).prize).toBeNull();
  });

  it("is named after the campaign, so it can be told apart in the Contests list", () => {
    expect(submissionContestRow(campaign, today).name).toContain("Uber Safety");
  });
});
