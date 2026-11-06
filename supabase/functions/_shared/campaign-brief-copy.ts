// The generic brief email's wording, kept apart from the template so it can be tested without Deno.
// A campaign may have no agreement or no approval step, and the email must not promise either. With no flags it
// says what it always said.
export type BriefEmailFlags = { has_agreement?: boolean; needs_approval?: boolean };

export function briefEmailCopy({ has_agreement = true, needs_approval = true }: BriefEmailFlags) {
  const link = needs_approval ? "video submission link" : "submission link";
  const nextSteps = has_agreement
    ? needs_approval
      ? "Read and sign your agreement before uploading a video for approval. Please wait for approval before posting."
      : "Read and sign your agreement before posting, then send us each post link once it's live."
    : needs_approval
      ? "Upload your video for approval from that page. Please wait for approval before posting, then send us the post link."
      : "Send us each post link from that page once it's live.";
  return {
    includes: has_agreement ? `includes your agreement and ${link}.` : `includes your ${link}.`,
    nextSteps,
    button: has_agreement ? "Open my brief and sign" : "Open my brief",
    subjectItems: has_agreement ? "brief, agreement and submission link" : "brief and submission link",
    feeLabel: has_agreement ? "Your contracted fee" : "Your fee",
    feeNote: has_agreement ? "Please check your signed agreement for payment terms." : "",
  };
}
