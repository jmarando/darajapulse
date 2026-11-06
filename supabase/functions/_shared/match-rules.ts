// What discovery-match tells the model about off-topic creators. A political campaign needs the
// political, news and commentary creators that every brand brief rightly skips.

/** A brief is political only when it says so with a true; anything else keeps the brand rule. */
export const isPolitical = (brief: unknown) =>
  !!brief && typeof brief === "object" && (brief as { political?: unknown }).political === true;

const MATCH = "- Only include a creator if their niche/bio clearly matches the brief.";

export const offTopicRule = (political: boolean) =>
  political
    ? `${MATCH} This is a political campaign, so political, news and commentary creators are on-topic: do not skip them for being political. Skip anyone whose niche has nothing to do with it.`
    : `${MATCH} Skip anyone off-topic (e.g. do NOT include a political/news creator for a food brief).`;
