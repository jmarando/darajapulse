// Social listening: types and the figures the Listening page shows, worked out
// from a brand's keywords and the mentions the listening-sweep function stored.

export type TopicKind = "brand" | "competitor" | "category";
export type Mood = "positive" | "neutral" | "negative";

export type ListeningTopic = {
  id: string;
  client_id: string;
  kind: TopicKind;
  label: string;
  query: string;
  exclude_terms: string[];
  active: boolean;
  last_scanned_at: string | null;
  last_note: string | null;
  created_at: string;
};

export type ListeningMention = {
  id: string;
  topic_id: string;
  source: string;
  url: string;
  title: string | null;
  snippet: string | null;
  author: string | null;
  reach: number | null;
  shares: number | null;
  published_at: string | null;
  found_at: string;
  sentiment: Mood | null;
  sentiment_score: number | null;
  theme: string | null;
};

export const OFF_TOPIC = "off-topic";
export const DAILY_CREDITS = 300;
export const CREDITS_PER_SEARCH = 3;
export const MAX_ACTIVE_TOPICS = 15;

export const KIND_LABEL: Record<TopicKind, string> = {
  brand: "Your brand",
  competitor: "Competitor",
  category: "Category",
};

export const SOURCE_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
};

/** When a mention happened: the platform's date when it gives one, else when we found it. */
export const mentionDate = (m: Pick<ListeningMention, "published_at" | "found_at">) => m.published_at ?? m.found_at;

/** Mentions the AI judged to be about the keyword's subject (unrated ones count until read). */
export const onTopic = (mentions: ListeningMention[]) => mentions.filter((m) => m.theme !== OFF_TOPIC);

export const withinDays = (mentions: ListeningMention[], days: number, now = Date.now()) => {
  const since = now - days * 86_400_000;
  return mentions.filter((m) => Date.parse(mentionDate(m)) >= since);
};

export type Totals = { mentions: number; rated: number; positive: number; neutral: number; negative: number; reach: number };

export function totals(mentions: ListeningMention[]): Totals {
  const t: Totals = { mentions: 0, rated: 0, positive: 0, neutral: 0, negative: 0, reach: 0 };
  for (const m of mentions) {
    t.mentions++;
    t.reach += Number(m.reach || 0);
    if (m.sentiment) {
      t.rated++;
      t[m.sentiment]++;
    }
  }
  return t;
}

/** Share of rated mentions with this mood, 0–100, or null when nothing is rated yet. */
export const moodShare = (t: Totals, mood: Mood) => (t.rated ? Math.round((t[mood] / t.rated) * 100) : null);

/** Net mood: positive share minus negative share, from -100 to 100. */
export const netMood = (t: Totals) => (t.rated ? Math.round(((t.positive - t.negative) / t.rated) * 100) : null);

export type VoiceRow = { key: string; label: string; kind: TopicKind; mentions: number; share: number; reach: number; net: number | null };

/**
 * Share of voice among the brand and its competitors: each voice's on-topic
 * mentions as a share of all of them. The brand's keywords (its name, products,
 * hashtags) make one voice, counting a post two of them found once; each
 * competitor is its own. Category keywords are left out, since a category is
 * the conversation the brands compete in, not a voice in it. Paused keywords
 * with nothing found are left out too.
 */
export function shareOfVoice(topics: ListeningTopic[], mentions: ListeningMention[], brandLabel: string): VoiceRow[] {
  const relevant = onTopic(mentions);
  const brandIds = new Set(topics.filter((t) => t.kind === "brand").map((t) => t.id));
  const groups: { key: string; label: string; kind: TopicKind; list: ListeningMention[] }[] = [];
  if (brandIds.size) {
    const seen = new Set<string>();
    const list = relevant.filter((m) => brandIds.has(m.topic_id) && !seen.has(m.url) && seen.add(m.url));
    groups.push({ key: "brand", label: brandLabel, kind: "brand", list });
  }
  for (const t of topics.filter((x) => x.kind === "competitor")) {
    groups.push({ key: t.id, label: t.label, kind: "competitor", list: relevant.filter((m) => m.topic_id === t.id) });
  }
  const kept = groups.filter((g) => g.list.length || g.kind === "brand" || topics.find((t) => t.id === g.key)?.active);
  const total = kept.reduce((n, g) => n + g.list.length, 0);
  return kept
    .map((g) => {
      const t = totals(g.list);
      return { key: g.key, label: g.label, kind: g.kind, mentions: g.list.length, share: total ? Math.round((g.list.length / total) * 1000) / 10 : 0, reach: t.reach, net: netMood(t) };
    })
    .sort((a, b) => b.mentions - a.mentions || (a.kind === "brand" ? -1 : 1));
}

export type MoodDay = { day: string; positive: number; neutral: number; negative: number };

/** Rated mentions per day and mood over the last `days` days, oldest first, with empty days kept. */
export function moodByDay(mentions: ListeningMention[], days: number, now = new Date()): MoodDay[] {
  const out = new Map<string, MoodDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    out.set(key, { day: key, positive: 0, neutral: 0, negative: 0 });
  }
  for (const m of mentions) {
    if (!m.sentiment) continue;
    const row = out.get(dayKey(new Date(mentionDate(m))));
    if (row) row[m.sentiment]++;
  }
  return [...out.values()];
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type ThemeRow = { theme: string; mentions: number; negative: number; positive: number };

/** What people talk about: rated on-topic mentions per theme, most-discussed first. */
export function themes(mentions: ListeningMention[]): ThemeRow[] {
  const map = new Map<string, ThemeRow>();
  for (const m of mentions) {
    if (!m.theme || m.theme === OFF_TOPIC) continue;
    const row = map.get(m.theme) ?? { theme: m.theme, mentions: 0, negative: 0, positive: 0 };
    row.mentions++;
    if (m.sentiment === "negative") row.negative++;
    if (m.sentiment === "positive") row.positive++;
    map.set(m.theme, row);
  }
  return [...map.values()].sort((a, b) => b.mentions - a.mentions);
}

/** Negative posts about the brand that are spreading: the most-seen first. */
export function needsAttention(topics: ListeningTopic[], mentions: ListeningMention[], limit = 5): ListeningMention[] {
  const own = new Set(topics.filter((t) => t.kind === "brand").map((t) => t.id));
  return mentions
    .filter((m) => own.has(m.topic_id) && m.sentiment === "negative" && m.theme !== OFF_TOPIC)
    .sort((a, b) => Number(b.reach || 0) - Number(a.reach || 0) || Date.parse(mentionDate(b)) - Date.parse(mentionDate(a)))
    .slice(0, limit);
}

/** "a, b , ,c" → ["a","b","c"], deduplicated, at most 10. */
export const parseTerms = (s: string) => [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
