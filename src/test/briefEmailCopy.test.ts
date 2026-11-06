import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { briefEmailCopy } from "../../supabase/functions/_shared/campaign-brief-copy";

const all = (flags: Parameters<typeof briefEmailCopy>[0]) => JSON.stringify(briefEmailCopy(flags));

describe("the generic brief email's wording", () => {
  it("is unchanged for a send that says nothing about the campaign", () => {
    const copy = briefEmailCopy({});
    expect(copy.includes).toBe("includes your agreement and video submission link.");
    expect(copy.nextSteps).toBe("Read and sign your agreement before uploading a video for approval. Please wait for approval before posting.");
    expect(copy.button).toBe("Open my brief and sign");
    expect(copy.subjectItems).toBe("brief, agreement and submission link");
    expect(copy.feeNote).toBe("Please check your signed agreement for payment terms.");
  });

  it("doesn't ask for a signature when the campaign has no agreement", () => {
    const text = all({ has_agreement: false, needs_approval: true });
    expect(text).not.toMatch(/sign/i);
    expect(text).not.toMatch(/agreement/i);
    expect(text).toMatch(/approval/i);
  });

  it("doesn't mention approval when the campaign doesn't ask for it", () => {
    const text = all({ has_agreement: true, needs_approval: false });
    expect(text).not.toMatch(/approval/i);
    expect(text).toMatch(/sign/i);
  });

  it("asks for neither on a campaign with neither", () => {
    const text = all({ has_agreement: false, needs_approval: false });
    expect(text).not.toMatch(/sign|agreement|approval/i);
    expect(text).toMatch(/post link/i);
  });
});

describe("the template", () => {
  // It imports through npm: specifiers that only Deno resolves, so this pins the wiring rather than running it.
  const template = readFileSync(resolve(__dirname, "../../supabase/functions/_shared/transactional-email-templates/campaign-brief-live.tsx"), "utf8");

  it("takes its wording from the tested module in both the body and the subject", () => {
    expect(template.match(/briefEmailCopy\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(template).not.toContain("Read and sign your agreement");
  });
});
