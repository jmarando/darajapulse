// The figures a Listening deck reports. Worked out once from the same helpers the page
// uses, so the slides and the screen cannot drift apart.

import {
  brandMentions, changeBetween, moodByPeriod, moodShare, needsAttention, netMood, onTopic, periodLabel,
  platformMix, shareOfVoice, themes, topMentions, totals,
  type ListeningMention, type ListeningTopic, type MoodDay, type Period, type PlatformRow, type ThemeRow,
  type VoiceRow, type WeekChange,
} from "./listening";

export type ListeningDeck = {
  brandName: string;
  /** "1–30 Sep 2026" — the period the deck covers. */
  rangeLabel: string;
  /** The same-length period before it, for the comparison. */
  previousLabel: string;
  generatedOn: string;
  compare: boolean;
  posts: number;
  creators: number;
  /** Views, where the platforms reported them. */
  views: number;
  previousPosts: number;
  previousViews: number;
  rated: number;
  positive: number | null;
  neutral: number | null;
  negative: number | null;
  net: number | null;
  change: WeekChange;
  lead: PlatformRow | null;
  platforms: PlatformRow[];
  voices: VoiceRow[];
  themes: ThemeRow[];
  attention: ListeningMention[];
  top: ListeningMention[];
  days: MoodDay[];
};

export function buildListeningDeck(
  input: {
    brandName: string;
    topics: ListeningTopic[];
    /** The period's mentions only. */
    mentions: ListeningMention[];
    /** The previous period's mentions only. */
    previousMentions: ListeningMention[];
    period: Period;
    previous: Period;
    compare: boolean;
  },
  now = Date.now(),
): ListeningDeck {
  const own = brandMentions(input.topics, input.mentions);
  const before = brandMentions(input.topics, input.previousMentions);
  const t = totals(own);
  const b = totals(before);
  const platforms = platformMix(own);
  const creators = new Set(
    own.map((m) => m.author?.trim().toLowerCase()).filter((a): a is string => !!a),
  ).size;

  return {
    brandName: input.brandName,
    rangeLabel: periodLabel(input.period),
    previousLabel: periodLabel(input.previous),
    generatedOn: new Date(now).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }),
    compare: input.compare,
    posts: t.mentions,
    creators,
    views: t.reach,
    previousPosts: b.mentions,
    previousViews: b.reach,
    rated: t.rated,
    positive: moodShare(t, "positive"),
    neutral: moodShare(t, "neutral"),
    negative: moodShare(t, "negative"),
    net: netMood(t),
    change: changeBetween(own, before),
    lead: platforms[0] ?? null,
    platforms,
    voices: shareOfVoice(input.topics, input.mentions, input.brandName),
    themes: themes(own),
    attention: needsAttention(input.topics, own, 8),
    // The most seen across every keyword, as the page's own list does.
    top: topMentions(onTopic(input.mentions), 10),
    days: moodByPeriod(own, input.period),
  };
}
