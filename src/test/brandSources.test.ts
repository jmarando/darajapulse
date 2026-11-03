import { describe, expect, it } from "vitest";
import {
  channelIsDue, cleanCaption, facebookPageUrl, maxPublicCalls, normaliseHandle, pullMode,
} from "../../supabase/functions/_shared/brand-sources";

const ok = (platform: Parameters<typeof normaliseHandle>[0], input: string) => (normaliseHandle(platform, input) as { handle: string }).handle;
const err = (platform: Parameters<typeof normaliseHandle>[0], input: string) => (normaliseHandle(platform, input) as { error: string }).error;

describe("normaliseHandle", () => {
  it("cleans up what people paste", () => {
    expect(ok("tiktok", "@AcmeKenya")).toBe("acmekenya");
    expect(ok("tiktok", "https://www.tiktok.com/@AcmeKenya?lang=en")).toBe("acmekenya");
    expect(ok("instagram", "instagram.com/acme.kenya/")).toBe("acme.kenya");
    expect(ok("instagram", "  acme_kenya ")).toBe("acme_kenya");
    expect(ok("facebook", "https://m.facebook.com/AcmeKenya/")).toBe("acmekenya");
    expect(ok("facebook", "https://www.facebook.com/profile.php?id=61551234567890")).toBe("61551234567890");
    expect(ok("facebook", "https://www.facebook.com/people/Acme-Kenya/61551234567890/")).toBe("61551234567890");
    expect(ok("facebook", "https://www.facebook.com/pages/Acme-Kenya/104359362513119")).toBe("104359362513119");
  });

  it("refuses a link to a post in plain words", () => {
    expect(err("instagram", "https://www.instagram.com/p/DKSMEpKRd6h/")).toMatch(/link to a post/);
    expect(err("instagram", "https://www.instagram.com/reel/DKSMEpKRd6h/")).toMatch(/link to a post/);
    expect(err("facebook", "https://www.facebook.com/share/p/abc")).toMatch(/link to a post/);
    expect(err("facebook", "https://www.facebook.com/acmekenya/posts/pfbid02abc")).toMatch(/link to a post/);
    expect(err("tiktok", "https://www.tiktok.com/@acme/video/7517114944362499342")).toMatch(/link to a post/);
  });

  it("refuses a link to another platform, and names it", () => {
    expect(err("tiktok", "https://www.instagram.com/acme")).toMatch(/Instagram/);
    expect(err("instagram", "facebook.com/acme")).toMatch(/Facebook/);
  });

  it("refuses nothing at all, and things that can't be a handle", () => {
    expect(err("tiktok", "   ")).toBeTruthy();
    expect(err("tiktok", "has space")).toBeTruthy();
    expect(err("tiktok", "https://example.test/acme")).toBeTruthy();
    expect(err("facebook", "https://www.facebook.com/")).toBeTruthy();
  });
});

describe("facebookPageUrl", () => {
  it("builds a page address from a name or an id", () => {
    expect(facebookPageUrl("acmekenya")).toBe("https://www.facebook.com/acmekenya");
    expect(facebookPageUrl("61551234567890")).toBe("https://www.facebook.com/profile.php?id=61551234567890");
  });
});

describe("channelIsDue", () => {
  const now = Date.parse("2026-11-04T01:00:00Z");
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const row = (last_pull_at: string | null, last_good_pull_at: string | null, status = "ok") => ({ last_pull_at, last_good_pull_at, status });

  it("is due when never read, or last read over 20 hours ago", () => {
    expect(channelIsDue(row(null, null), now)).toBe(true);
    expect(channelIsDue(row(ago(19), ago(19)), now)).toBe(false);
    expect(channelIsDue(row(ago(21), ago(21)), now)).toBe(true);
  });

  it("leaves a wrong handle alone, so it doesn't spend credits every night", () => {
    expect(channelIsDue(row(ago(30), null, "error"), now)).toBe(false);
  });

  it("keeps trying an account that worked once, since it may come back", () => {
    expect(channelIsDue(row(ago(21), ago(40), "error"), now)).toBe(true);
  });
});

describe("pullMode", () => {
  const good = { last_good_pull_at: "2026-10-01T00:00:00Z" };

  it("reads further back on the first good pull", () => {
    expect(pullMode({ last_good_pull_at: null }, Date.parse("2026-11-09T10:00:00Z"))).toBe("first");
  });

  it("reads further back on Sundays in Nairobi", () => {
    expect(pullMode(good, Date.parse("2026-11-07T22:00:00Z"))).toBe("deep"); // Saturday in UTC, Sunday 01:00 in Nairobi
    expect(pullMode(good, Date.parse("2026-11-08T20:59:00Z"))).toBe("deep");
    expect(pullMode(good, Date.parse("2026-11-08T21:00:00Z"))).toBe("nightly"); // Monday 00:00 in Nairobi
    expect(pullMode(good, Date.parse("2026-11-09T10:00:00Z"))).toBe("nightly");
  });
});

describe("maxPublicCalls", () => {
  it("counts the most calls a pull can make", () => {
    expect(maxPublicCalls("facebook", "nightly")).toBe(7); // profile, 5 post pages, 1 reel page
    expect(maxPublicCalls("facebook", "first")).toBe(34);
    expect(maxPublicCalls("tiktok", "nightly")).toBe(3);
    expect(maxPublicCalls("instagram", "first")).toBe(9);
  });
});

describe("cleanCaption", () => {
  it("makes any caption safe to store", () => {
    expect(cleanCaption("a\u0000b")).toBe("ab");
    expect(cleanCaption("a\ud83d")).toBe("a"); // half an emoji
    expect(Array.from(cleanCaption("😀".repeat(600))!).length).toBe(500); // cut by character, not by code unit
    expect(cleanCaption("   ")).toBeNull();
    expect(cleanCaption(42)).toBeNull();
    expect(cleanCaption(null)).toBeNull();
  });
});
