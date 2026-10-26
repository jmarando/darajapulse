export type CampaignViews = { id: string; name: string; views: number };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The agency's biggest campaigns by views, with the rest gathered into one row
 * so the rows add up to `total`, and the one-line takeaway for the card.
 * `campaignCount` is every campaign the viewer can see, including ones with no views.
 */
export function campaignBreakdown(rows: CampaignViews[], total: number, campaignCount: number, show = 5) {
  const ranked = rows.filter((r) => r.views > 0).sort((a, b) => b.views - a.views);
  if (total <= 0 || ranked.length === 0) return null;

  const top = ranked.slice(0, show);
  const items = top.map((r) => ({ key: r.id, label: r.name, views: r.views, share: r.views / total }));
  const rest = total - top.reduce((a, r) => a + r.views, 0);
  const restCount = campaignCount - top.length;
  if (rest > 0 && restCount > 0) {
    items.push({ key: "others", label: `${restCount} other campaign${restCount === 1 ? "" : "s"}`, views: rest, share: rest / total });
  }

  const lead = items[0];
  const topThree = items.slice(0, 3).reduce((a, i) => a + i.share, 0);
  const callout =
    campaignCount > 3 && top.length >= 3
      ? `${lead.label} leads with ${pct(lead.share)} of views. The top three campaigns carry ${pct(topThree)}.`
      : `${lead.label} leads with ${pct(lead.share)} of views.`;
  return { items, callout };
}
