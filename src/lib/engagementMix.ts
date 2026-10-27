export type EngagementKey = "likes" | "comments" | "shares" | "saves";

export type EngagementPart = {
  key: EngagementKey;
  label: string;
  value: number;
  /** This kind's part of all interactions, from 0 to 1. */
  share: number;
  /** Filled in from views and likes, because the platform doesn't report it. */
  estimated: boolean;
};

export type EngagementMixResult = {
  total: number;
  parts: EngagementPart[];
  /** Saves and shares: the signals of stronger intent. */
  intent: number;
  intentShare: number;
};

const KINDS: [EngagementKey, string][] = [["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"], ["saves", "Saves"]];

/** What the campaign's interactions are made of. Null when there are none. */
export function buildEngagementMix(totals: Record<EngagementKey, number>, estimated: { shares?: boolean; saves?: boolean }): EngagementMixResult | null {
  const total = KINDS.reduce((a, [key]) => a + Number(totals[key] || 0), 0);
  if (!(total > 0)) return null;
  const parts = KINDS.map(([key, label]) => {
    const value = Number(totals[key] || 0);
    const filledIn = (key === "shares" && !!estimated.shares) || (key === "saves" && !!estimated.saves);
    return { key, label, value, share: value / total, estimated: filledIn && value > 0 };
  });
  const intent = Number(totals.shares || 0) + Number(totals.saves || 0);
  return { total, parts, intent, intentShare: intent / total };
}
