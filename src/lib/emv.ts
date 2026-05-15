// Earned Media Value helpers.
// Public Instagram/TikTok scraping rarely returns paid impressions, so we
// derive EMV from views using a Kenya influencer-marketing CPM benchmark.
// 250 KES per 1,000 views is a conservative blended rate across IG/TikTok
// based on local agency rate cards (Reelo, IMS, SquadDigital 2024–2025).
export const EMV_CPM_KES = 250;

export function computeEmv(views: number, impressions = 0): number {
  const reachLike = impressions > 0 ? impressions : views;
  return Math.round((reachLike / 1000) * EMV_CPM_KES);
}

export const EMV_DISCLAIMER = `Estimated at KES ${EMV_CPM_KES} CPM (Kenya influencer benchmark).`;
