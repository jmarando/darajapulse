import { describe, expect, it } from "vitest";
import { isPolitical, offTopicRule } from "../../supabase/functions/_shared/match-rules";

describe("discovery-match: who counts as off-topic", () => {
  it("keeps the rule brand briefs have always had", () => {
    expect(offTopicRule(false)).toBe(
      "- Only include a creator if their niche/bio clearly matches the brief. Skip anyone off-topic (e.g. do NOT include a political/news creator for a food brief).",
    );
  });

  it("does not skip political creators for a political campaign", () => {
    const rule = offTopicRule(true);
    expect(rule).not.toMatch(/do NOT include a political/i);
    expect(rule).toMatch(/political/i);
    expect(rule).toMatch(/news/i);
  });

  it("still tells the model to skip creators whose niche has nothing to do with the brief", () => {
    expect(offTopicRule(true)).toMatch(/nothing to do with/i);
  });

  it("treats a brief as political only when it says so with a true", () => {
    expect(isPolitical({ brand: "x", political: true })).toBe(true);
    for (const brief of [{ political: "true" }, { political: 1 }, { political: false }, {}, null, undefined, "political"])
      expect(isPolitical(brief)).toBe(false);
  });
});
