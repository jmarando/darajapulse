import * as XLSX from "xlsx";
import {
  PublicationRow, byCountry, byDeliverable, byInfluencer, byMonth, byPlatform,
  platformCounts, rowCountry, titleCase, totalsFor,
} from "@/lib/reporting";

const round = (n: number) => Math.round(n || 0);
const er = (t: { engagement: number; views: number }) => (t.views ? +((t.engagement / t.views) * 100).toFixed(2) : 0);

export type SheetSet = { name: string; rows: Record<string, any>[] }[];

/** `nameOf` turns a country code into its display name; defaults to the raw code. */
export const buildSummarySheets = (
  rows: PublicationRow[],
  nameOf: (c: string) => string = (c) => c,
): SheetSet => {
  const t = totalsFor(rows);
  return [
    {
      name: "Summary",
      rows: [{
        "Unique deliverables": t.deliverables,
        "Platform publications": t.publications,
        Creators: t.creators,
        Views: round(t.views),
        Likes: round(t.likes),
        Comments: round(t.comments),
        Shares: round(t.shares),
        Saves: round(t.saves),
        Reach: round(t.reach),
        Engagement: round(t.engagement),
        "Engagement rate %": er(t),
      }],
    },
    {
      name: "By platform",
      rows: byPlatform(rows).map((g) => ({
        Platform: titleCase(g.label),
        Publications: g.publications,
        "Deliverables represented": g.deliverables,
        Views: round(g.views), Likes: round(g.likes), Comments: round(g.comments),
        Shares: round(g.shares), Engagement: round(g.engagement), "Engagement rate %": er(g),
      })),
    },
    {
      name: "By influencer",
      rows: byInfluencer(rows).map((g) => {
        const pc = platformCounts(g.rows);
        return {
          Influencer: g.label,
          "Unique deliverables": g.deliverables,
          "Platform publications": g.publications,
          TikTok: pc.tiktok || 0, Instagram: pc.instagram || 0, Facebook: pc.facebook || 0,
          YouTube: pc.youtube || 0, Other: g.publications - (pc.tiktok || 0) - (pc.instagram || 0) - (pc.facebook || 0) - (pc.youtube || 0),
          Views: round(g.views), Likes: round(g.likes), Comments: round(g.comments),
          Shares: round(g.shares), Engagement: round(g.engagement), "Engagement rate %": er(g),
        };
      }),
    },
    {
      name: "By country",
      rows: byCountry(rows, nameOf).map((g) => ({
        Country: g.label,
        Creators: g.creators,
        "Unique deliverables": g.deliverables,
        "Platform publications": g.publications,
        Views: round(g.views), Likes: round(g.likes), Comments: round(g.comments),
        Shares: round(g.shares), Engagement: round(g.engagement), "Engagement rate %": er(g),
      })),
    },
    {
      name: "By month",
      rows: byMonth(rows).map((g) => ({
        Month: g.label,
        "Unique deliverables": g.deliverables,
        "Platform publications": g.publications,
        Views: round(g.views), Likes: round(g.likes), Comments: round(g.comments),
        Shares: round(g.shares), Engagement: round(g.engagement), "Engagement rate %": er(g),
      })),
    },
  ];
};

export const buildDetailedSheets = (rows: PublicationRow[]): SheetSet => [
  ...buildSummarySheets(rows),
  {
    name: "Deliverables",
    rows: byDeliverable(rows).map((g) => ({
      Deliverable: g.label,
      Campaign: g.rows[0].campaign_name,
      Influencer: g.rows[0].influencer_name || "",
      "Content type": g.rows[0].deliverable_content_type || "",
      Status: g.rows[0].deliverable_status || "",
      Platforms: [...new Set(g.rows.map((r) => titleCase(r.platform)))].join(", "),
      Publications: g.publications,
      "Publication dates": [...new Set(g.rows.map((r) => (r.posted_at || "").slice(0, 10)).filter(Boolean))].join(", "),
      Views: round(g.views), Likes: round(g.likes), Comments: round(g.comments),
      Shares: round(g.shares), Engagement: round(g.engagement), "Engagement rate %": er(g),
    })),
  },
  {
    name: "Publications",
    rows: rows.map((r) => ({
      Deliverable: r.deliverable_title || "",
      Campaign: r.campaign_name,
      Client: r.client_name || "",
      Influencer: r.influencer_name || "",
      Handle: r.influencer_handle || "",
      Platform: titleCase(r.platform),
      "Post URL": r.post_url || "",
      "Published": (r.posted_at || "").slice(0, 10),
      Status: r.post_status || "",
      Views: round(r.views), Likes: round(r.likes), Comments: round(r.comments),
      Shares: round(r.shares), Saves: round(r.saves), Reach: round(r.reach),
      Engagement: round(r.likes + r.comments + r.shares + r.saves),
      "Last synced": (r.last_synced || "").slice(0, 10),
    })),
  },
];

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80);

export const exportToExcel = (sheets: SheetSet, fileName: string) => {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${safe(fileName)}.xlsx`);
};

export const exportToCsv = (sheets: SheetSet, fileName: string) => {
  const parts = sheets.map((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    return `${s.name}\n${XLSX.utils.sheet_to_csv(ws)}`;
  });
  const blob = new Blob([parts.join("\n\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe(fileName)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const printReport = () => window.print();
