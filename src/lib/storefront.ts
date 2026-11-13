/** A listing's engagement rate for its card: a percentage when the platform gave one, a dash when nobody knows it. */
export const fmtEngagement = (rate: unknown): string => {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(1)}%` : "—";
};
