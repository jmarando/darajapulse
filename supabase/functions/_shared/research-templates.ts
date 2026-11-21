// The measures a consumer-research study can ask, grouped into templates. Each Likert measure
// has a question the synthetic respondent answers in their own words and anchor statements
// (1 = most negative … 5 = most positive) that research-ssr.ts scores the answer against.
//
// The anchors decide the score, so these were written to be plain, first-person and evenly
// spaced, and they stay fixed: a study's results can only be compared with another's when
// both used the same anchors. Custom questions get AI-drafted anchors that a person approves
// and are labelled untested in results.

export type MeasureKind = "likert" | "open";

export type Measure = {
  key: string;
  label: string;
  kind: MeasureKind;
  /** What the respondent is asked, in the second person. */
  prompt: string;
  /** Likert only: one or more sets of five statements, from 1 to 5. */
  anchors: string[][];
};

export const MEASURES: Record<string, Measure> = {
  purchase_intent: {
    key: "purchase_intent",
    label: "Purchase intent",
    kind: "likert",
    prompt: "How likely would you be to buy this if it were available where you usually shop? Say honestly what you would do and why.",
    anchors: [
      [
        "I would definitely not buy it.",
        "I probably would not buy it.",
        "I might or might not buy it; I'm not sure.",
        "I would probably buy it.",
        "I would definitely buy it.",
      ],
      [
        "This is not for me and I would never spend my money on it.",
        "I doubt I would buy it; it doesn't really tempt me.",
        "I could maybe try it, but I would need to think about it.",
        "I'm quite keen and would likely pick it up.",
        "I want this and would buy it as soon as I see it.",
      ],
    ],
  },
  appeal: {
    key: "appeal",
    label: "Appeal",
    kind: "likert",
    prompt: "How much do you like this overall? Describe your honest first reaction.",
    anchors: [[
      "I really dislike it.",
      "I don't like it much.",
      "It's okay; I neither like nor dislike it.",
      "I like it.",
      "I love it.",
    ]],
  },
  uniqueness: {
    key: "uniqueness",
    label: "Uniqueness",
    kind: "likert",
    prompt: "How different is this from what you can already buy? Explain what, if anything, feels new.",
    anchors: [[
      "It's exactly the same as what's already out there.",
      "It's mostly the same as other products I know.",
      "It's a little different, but not much.",
      "It's noticeably different from what I've seen.",
      "It's completely new; I've never seen anything like it.",
    ]],
  },
  believability: {
    key: "believability",
    label: "Believability",
    kind: "likert",
    prompt: "How much do you believe what this says or promises? Explain what you trust or doubt.",
    anchors: [[
      "I don't believe it at all.",
      "I'm doubtful about what it claims.",
      "I partly believe it, but I'm unsure.",
      "I mostly believe it.",
      "I completely believe it.",
    ]],
  },
  relevance: {
    key: "relevance",
    label: "Relevance",
    kind: "likert",
    prompt: "How well does this fit your own life and needs? Explain why or why not.",
    anchors: [[
      "It has nothing to do with my life or needs.",
      "It doesn't really fit my needs.",
      "It fits my needs somewhat.",
      "It fits my needs well.",
      "It's exactly what someone like me needs.",
    ]],
  },
  value: {
    key: "value",
    label: "Value for money",
    kind: "likert",
    prompt: "Thinking about the price, is this good value for money for you? Explain.",
    anchors: [[
      "It's very poor value; far too expensive for what it is.",
      "It's poor value; a bit too expensive.",
      "The price is fair; neither good nor bad value.",
      "It's good value for the money.",
      "It's excellent value; a real bargain.",
    ]],
  },
  brand_fit: {
    key: "brand_fit",
    label: "Brand fit",
    kind: "likert",
    prompt: "Does this feel like something this brand would do? Explain how it fits or clashes with what you know of the brand.",
    anchors: [[
      "It doesn't fit the brand at all; it feels wrong for them.",
      "It doesn't fit the brand very well.",
      "It fits the brand somewhat.",
      "It fits the brand well.",
      "It fits the brand perfectly; it's exactly them.",
    ]],
  },
  message: {
    key: "message",
    label: "Message takeaway",
    kind: "open",
    prompt: "In your own words, what was this trying to tell you?",
    anchors: [],
  },
  recall: {
    key: "recall",
    label: "What stood out",
    kind: "open",
    prompt: "What do you remember most from it, and what would you change?",
    anchors: [],
  },
};

export type TemplateKey = "concept" | "ad" | "price" | "custom";

export const TEMPLATES: Record<TemplateKey, { key: TemplateKey; label: string; description: string; measures: string[] }> = {
  concept: {
    key: "concept",
    label: "Concept test",
    description: "Compare product ideas, claims or packs: purchase intent, appeal, uniqueness, believability, relevance and value.",
    measures: ["purchase_intent", "appeal", "uniqueness", "believability", "relevance", "value"],
  },
  ad: {
    key: "ad",
    label: "Ad or video test",
    description: "Compare ads, key visuals or creator videos: appeal, purchase intent, believability, brand fit, the message people took away and what stood out.",
    measures: ["appeal", "purchase_intent", "believability", "brand_fit", "message", "recall"],
  },
  price: {
    key: "price",
    label: "Price test",
    description: "Put the same product at different prices and see where purchase intent and value for money fall away.",
    measures: ["purchase_intent", "value"],
  },
  custom: {
    key: "custom",
    label: "Custom",
    description: "Start from purchase intent and add your own questions.",
    measures: ["purchase_intent"],
  },
};

export const MAX_CUSTOM_QUESTIONS = 5;
export const MAX_STIMULI = 5;

/** True when a set of anchors is usable: five distinct, non-empty statements of sensible length. */
export function anchorsValid(anchors: unknown): anchors is string[] {
  if (!Array.isArray(anchors) || anchors.length !== 5) return false;
  const clean = anchors.map((a) => (typeof a === "string" ? a.trim() : ""));
  if (clean.some((a) => a.length < 3 || a.length > 200)) return false;
  return new Set(clean.map((a) => a.toLowerCase())).size === 5;
}
