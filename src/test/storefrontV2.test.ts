import { describe, expect, it } from "vitest";
import { combinedReach, fmtCompact, platformLabel, profileUrl, reachLabel, whatYouGet } from "@/lib/storefront";
import { ago, pipelineSummary, whatsappUrl } from "@/lib/storefrontRequests";

describe("storefront listings", () => {
  it("links a handle to the live profile, and gives up on display names", () => {
    expect(profileUrl("instagram", "@kiss100kenya")).toBe("https://www.instagram.com/kiss100kenya/");
    expect(profileUrl("tiktok", "@classic105.kenya")).toBe("https://www.tiktok.com/@classic105.kenya");
    expect(profileUrl("facebook", "RadioJamboKenya")).toBe("https://www.facebook.com/RadioJamboKenya");
    expect(profileUrl("twitter", "@thestarkenya")).toBe("https://x.com/thestarkenya");
    expect(profileUrl("youtube", "@RadioJamboKenyaOfficial")).toBe("https://www.youtube.com/@RadioJamboKenyaOfficial");
    expect(profileUrl("youtube", "Kiss 100 Kenya")).toBeNull();
    expect(profileUrl("radio", "Classic 105")).toBeNull();
    expect(profileUrl("instagram", null)).toBeNull();
  });

  it("lists what a package includes, one line each", () => {
    const pkg = { kind: "bundle", deliverable_type: "Interview, social and print", description: "A 10-minute interview\n1 reel, 1 carousel and 5 stories\nAn 18 × 6 ad in The Star" };
    expect(whatYouGet(pkg)).toEqual({ lines: ["A 10-minute interview", "1 reel, 1 carousel and 5 stories", "An 18 × 6 ad in The Star"], note: null });
  });

  it("leads with the deliverable and keeps where-the-numbers-come-from as a note", () => {
    const slot = { kind: "ad_slot", deliverable_type: "30-second spot, 6 to 9 AM", description: "Reach is the station's weekly listeners (GeoPoll Kenya radio survey, Q2 2026)." };
    expect(whatYouGet(slot)).toEqual({ lines: ["30-second spot, 6 to 9 AM"], note: "Reach is the station's weekly listeners (GeoPoll Kenya radio survey, Q2 2026)." });
    const account = { kind: "owned_account", deliverable_type: "Branded TikTok video", description: "Followers refreshed on 13 November 2026." };
    expect(whatYouGet(account).note).toBe("Followers refreshed on 13 November 2026.");
  });

  it("counts a station's audience once across its on-air formats", () => {
    expect(combinedReach([
      { kind: "ad_slot", title: "Kiss 100: 30-second breakfast spot", subtitle: "Kiss 100 · hit music", follower_count: 4_660_000 },
      { kind: "ad_slot", title: "Kiss 100: 10-minute interview", subtitle: "Kiss 100 · hit music", follower_count: 4_660_000 },
      { kind: "owned_account", title: "Kiss 100 on TikTok", follower_count: 559_700 },
      { kind: "influencer", title: "Maina Kageni", follower_count: 0 },
    ])).toBe(5_219_700);
  });

  it("names platforms and reach the way buyers read them", () => {
    expect(platformLabel("twitter")).toBe("X");
    expect(platformLabel("radio")).toBe("On air");
    expect(platformLabel("mixed")).toBe("Package");
    expect(reachLabel("owned_account", "instagram")).toBe("followers");
    expect(reachLabel("ad_slot", "radio")).toBe("listeners a week");
    expect(fmtCompact(2_210_111)).toBe("2.2M");
    expect(fmtCompact(931_626)).toBe("931.6K");
  });
});

describe("storefront requests", () => {
  it("totals the pipeline by stage and budget", () => {
    const s = pipelineSummary([
      { status: "new", budget_kes: 500_000 },
      { status: "new", budget_kes: null },
      { status: "quoted", budget_kes: 1_000_000 },
      { status: "won", budget_kes: 2_000_000 },
      { status: "lost", budget_kes: 900_000 },
    ]);
    expect(s.count).toEqual({ new: 2, reviewing: 0, quoted: 1, won: 1, lost: 1 });
    expect(s.open).toBe(3);
    expect(s.openValue).toBe(1_500_000);
    expect(s.wonValue).toBe(2_000_000);
  });

  it("turns Kenyan phone numbers into WhatsApp links", () => {
    expect(whatsappUrl("0712 345 678")).toBe("https://wa.me/254712345678");
    expect(whatsappUrl("+254 712 345 678")).toBe("https://wa.me/254712345678");
    expect(whatsappUrl("712345678")).toBe("https://wa.me/254712345678");
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl("12")).toBeNull();
  });

  it("says how long ago a request came in", () => {
    const now = new Date("2026-11-13T09:00:00Z");
    expect(ago("2026-11-13T08:59:30Z", now)).toBe("just now");
    expect(ago("2026-11-13T08:15:00Z", now)).toBe("45 min ago");
    expect(ago("2026-11-13T04:00:00Z", now)).toBe("5 h ago");
    expect(ago("2026-11-12T08:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-11-08T09:00:00Z", now)).toBe("5 days ago");
  });
});
