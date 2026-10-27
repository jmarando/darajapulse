import type { PerformerStats, RosterEntry } from "@/lib/topPerformers";

export type CostRow = {
  id: string;
  name: string;
  handle: string;
  fee: number;
  /** No fee is recorded for this creator, so it was worked out from the budget. */
  feeFromBudget: boolean;
  views: number;
  /** Likes, comments, shares and saves. */
  interactions: number;
  /** Cost per view, per 1,000 views and per interaction. Zero where there is nothing to divide by. */
  cpv: number;
  cpm: number;
  cpe: number;
};

type CostEntry = RosterEntry & { fee_kes?: number | null };

export const formatKes = (n: number) =>
  n >= 1e6 ? `KES ${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `KES ${(n / 1e3).toFixed(0)}K` : `KES ${Math.round(n).toLocaleString()}`;

/**
 * What each creator cost for what they delivered, cheapest per view first, creators with no views last.
 * A creator with no recorded fee is given an even share of the fees paid, or of the budget when none was.
 */
export function buildCostEfficiency(roster: CostEntry[], stats: Map<string, PerformerStats>, budget: number, limit = 12): CostRow[] {
  const totalFee = roster.reduce((a, x) => a + Number(x.fee_kes || 0), 0);
  const fallbackBudget = totalFee > 0 ? totalFee : Number(budget);
  const rows: CostRow[] = [];
  for (const x of roster) {
    const s = stats.get(x.influencer_id);
    if (!s) continue;
    const recorded = Number(x.fee_kes || 0);
    const fee = recorded || fallbackBudget / Math.max(1, roster.length);
    const interactions = s.likes + s.comments + s.shares + s.saves;
    rows.push({
      id: x.id,
      name: x.influencers?.full_name ?? "—",
      handle: String(x.influencers?.handle ?? "").replace(/^@/, ""),
      fee,
      feeFromBudget: !(recorded > 0),
      views: s.views,
      interactions,
      cpv: s.views > 0 ? fee / s.views : 0,
      cpm: s.views > 0 ? (fee / s.views) * 1000 : 0,
      cpe: interactions > 0 ? fee / interactions : 0,
    });
  }
  const order = (r: CostRow) => (r.cpv === 0 ? Infinity : r.cpv);
  return rows.sort((a, b) => (order(a) === order(b) ? 0 : order(a) < order(b) ? -1 : 1)).slice(0, limit);
}
