// The figures behind Listening's analytics panels: the headline numbers against the period
// before, the days the mood peaked, the phrases people use and the voices with the most views.

import type { ListeningMention, MoodDay, Totals } from "./listening";

/** The change from the period before, to a whole percent; null when there is nothing before to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const authorKey = (author: string | null) => author?.trim().toLowerCase() || null;

/** How many different people posted, counting a handle once whatever its case. */
export function creatorCount(mentions: ListeningMention[]): number {
  return new Set(mentions.map((m) => authorKey(m.author)).filter(Boolean)).size;
}

export type KeyMetric = { value: number; previous: number; change: number | null };
export type KeyMetrics = Record<"mentions" | "views" | "shares" | "creators", KeyMetric>;

const metric = (value: number, previous: number): KeyMetric => ({ value, previous, change: percentChange(value, previous) });
const sum = (mentions: ListeningMention[], key: "reach" | "shares") => mentions.reduce((n, m) => n + Number(m[key] || 0), 0);

/** The headline numbers for a brand's posts, each against the same-length period before. */
export function keyMetrics(now: ListeningMention[], before: ListeningMention[]): KeyMetrics {
  return {
    mentions: metric(now.length, before.length),
    views: metric(sum(now, "reach"), sum(before, "reach")),
    shares: metric(sum(now, "shares"), sum(before, "shares")),
    creators: metric(creatorCount(now), creatorCount(before)),
  };
}

/** The day with the most positive posts and the day with the most negative (the later day on a tie), or null when no post had that mood. */
export function moodPeaks(days: MoodDay[]): { positive: MoodDay | null; negative: MoodDay | null } {
  const peak = (mood: "positive" | "negative") =>
    days.reduce<MoodDay | null>((best, d) => (d[mood] > 0 && d[mood] >= (best?.[mood] ?? 0) ? d : best), null);
  return { positive: peak("positive"), negative: peak("negative") };
}

export type MoodVerdict = "Mostly positive" | "Mostly neutral" | "Mostly negative" | "Mixed";

/** The mood that holds at least half of the posts read, and more than any other; "Mixed" when none does. */
export function moodVerdict(t: Totals): MoodVerdict | null {
  if (!t.rated) return null;
  const moods = ["positive", "neutral", "negative"] as const;
  const top = moods.find((m) => t[m] * 2 >= t.rated && moods.every((o) => o === m || t[o] < t[m]));
  return top ? `Mostly ${top}` : "Mixed";
}

export type Phrase = { phrase: string; posts: number };

// Words that join a sentence rather than say what it is about, in English, Kiswahili and Sheng, and the words
// every social post carries. A filler word breaks a phrase, so "chapati na masala chai" gives "masala chai".
const FILLER = new Set(`
a about above after again against ago all almost also always am among an and another any anyone anything are around as at away
back be because been before being below between both but by can cannot could did do does doing done down during each either else
enough even ever every everyone everything few for from further get gets getting give go goes going gone gonna got gotta had has
have having he her here hers herself him himself his how however i if in instead into is it its itself just keep know least less let
lets like ll lot lots made make makes many may me might mine more most much must my myself need needs never next no nobody none nor
not nothing now of off often oh ok okay on once one only or other others our ours ourselves out over own per please put quite rather
re really s said same say says see seen she should since so some someone something sometimes soon still such sure t take than thank
thanks that the their theirs them themselves then there these they thing things think this those though through till to too under
until up upon ur us use used very via was way we well were what whatever when where whether which while who whom whose why will with
within without would yeah yes yet you your yours yourself yourselves u ya yo hey hi hello wow lol lmao omg haha hahaha pls plz
im i'm i've ive i'll i'd you're youre you've you'll he's she's it's we're we've they're they've that's thats there's theres what's
whats who's here's let's don't dont doesn't doesnt didn't didnt isn't isnt aren't wasn't weren't won't wont can't cant couldn't
shouldn't wouldn't haven't hasn't hadn't ain't
na ya wa za la kwa ni katika hii hizi huu hiyo hayo haya huo hao hawa huyu yule ile ule hicho hiki kile vile hivi hivyo kama lakini
au ama pia sana tu hapa pale huko kuna kuwa yangu yako yake yetu yenu yao wangu wako wake wetu wenu mimi wewe yeye sisi nyinyi ninyi
ndio ndiyo hapana nini gani je si hata bila zaidi kila baada kabla sasa tena bado kwenye kutoka mpaka hadi ili kwamba ambayo ambao
ambaye ambapo cha vya mwa pa ku nami nawe naye nasi nao wote yote zote vyote nina una ana tuna mna wana sina huna hana hatuna
aje niaje manze buda msee bana basi ati eti yaani
video videos vid tiktok tiktoks instagram insta ig youtube yt reel reels short shorts subscribe subscribed subscribers follow
following followers comment comments share shared link bio watch watching channel full part episode ep live post posts duet stitch
`.trim().split(/\s+/));

/** Hashtags nearly every video carries, which say nothing about what it is about. */
const noiseTag = (tag: string) =>
  /^(fy+p+|for_?you|(go)?viral|trending|trend$|explore|reels?$|insta(gram|good|daily)?$|tiktok|kenyantiktok|youtube|shorts?$|capcut|xyzbca|parati$|duet$|stitch$|creatorsearchinsights$)/u.test(tag);

/** The two-word phrases and hashtags in one post, each once. */
function postPhrases(m: ListeningMention): Set<string> {
  const found = new Set<string>();
  const text = [m.title, m.snippet].filter(Boolean).join("\n")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, "\n")
    .replace(/@[\p{L}\p{N}_.]+/gu, "\n")
    .replace(/[’`]/g, "'")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ");
  // Anything but letters, numbers, hashtags, apostrophes and spaces ends a phrase: punctuation, emoji, new lines.
  for (const part of text.split(/[^\p{L}\p{N}#' \t]+/u)) {
    let previous: string | null = null;
    for (const raw of part.split(/[ \t]+/)) {
      const word = raw.replace(/^'+|'+$/g, "").replace(/'s$/, "");
      if (word.startsWith("#")) {
        const tag = word.replace(/#/g, "");
        if (tag.length >= 3 && /\p{L}/u.test(tag) && !noiseTag(tag)) found.add(`#${tag}`);
        previous = null;
      } else if (word.length < 2 || FILLER.has(word) || /^\p{N}+$/u.test(word) || word.includes("#")) {
        previous = null;
      } else {
        if (previous) found.add(`${previous} ${word}`);
        previous = word;
      }
    }
  }
  return found;
}

/**
 * What people say: two-word phrases and hashtags, each counted once per post, most-used first. A phrase in a
 * single post is left out unless `minPosts` is 1, which the period before uses so a comparison sees every phrase.
 */
export function popularPhrases(mentions: ListeningMention[], minPosts = 2): Phrase[] {
  const counts = new Map<string, number>();
  for (const m of mentions) {
    for (const p of postPhrases(m)) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, posts]) => posts >= minPosts)
    .map(([phrase, posts]) => ({ phrase, posts }))
    .sort((a, b) => b.posts - a.posts || a.phrase.localeCompare(b.phrase));
}

export type PhraseRow = Phrase & { previous: number; change: number | null; score: number };

/** The top phrases, each scored against the first (100) and compared with its use in the period before. */
export function phraseTable(current: Phrase[], previous: Phrase[], limit = 10): PhraseRow[] {
  const before = new Map(previous.map((p) => [p.phrase, p.posts]));
  const top = current[0]?.posts ?? 0;
  return current.slice(0, limit).map((p) => {
    const prev = before.get(p.phrase) ?? 0;
    return { ...p, previous: prev, change: percentChange(p.posts, prev), score: top ? Math.round((p.posts / top) * 100) : 0 };
  });
}

export type Voice = {
  author: string;
  /** The platform of their most-seen post. */
  source: string;
  posts: number;
  views: number;
  /** Whether any of their posts reported views (Instagram and Reddit don't). */
  viewsKnown: boolean;
  /** Their most-seen post. */
  topUrl: string;
  negative: number;
};

/** The people whose posts were seen most, most views first; authors whose platforms report no views rank by posts. */
export function topVoices(mentions: ListeningMention[], limit = 8): Voice[] {
  const byAuthor = new Map<string, { voice: Voice; topReach: number }>();
  for (const m of mentions) {
    const key = authorKey(m.author);
    if (!key) continue;
    const reach = Number(m.reach || 0);
    const row = byAuthor.get(key);
    if (!row) {
      byAuthor.set(key, {
        voice: {
          author: m.author!.trim(), source: m.source, posts: 1, views: reach, viewsKnown: m.reach != null, topUrl: m.url,
          negative: m.sentiment === "negative" ? 1 : 0,
        },
        topReach: reach,
      });
      continue;
    }
    const v = row.voice;
    v.posts++;
    v.views += reach;
    v.viewsKnown ||= m.reach != null;
    if (m.sentiment === "negative") v.negative++;
    if (reach > row.topReach) {
      row.topReach = reach;
      v.topUrl = m.url;
      v.source = m.source;
    }
  }
  return [...byAuthor.values()]
    .map((r) => r.voice)
    .sort((a, b) => b.views - a.views || b.posts - a.posts || a.author.localeCompare(b.author))
    .slice(0, limit);
}
