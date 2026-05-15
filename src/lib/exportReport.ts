import pptxgen from "pptxgenjs";

const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}k` : `${n}`;

export type ReportExportData = {
  campaignName: string;
  clientName: string;
  hashtag?: string | null;
  budgetKes?: number;
  rangeLabel?: string;
  totals: { views: number; reach: number; impressions: number; likes: number; comments: number; shares: number; saves: number };
  er: number;
  emv: number;
  topPerformer?: { name: string; handle?: string; views: number; likes: number } | null;
  platformRows: { platform: string; posts: number; creators: number; views: number; reach: number }[];
  posts: { creator: string; platform: string; views: number; likes: number; comments: number; shares: number; url?: string }[];
  learnings?: string | null;
  clientLogoUrl?: string | null;
};

export async function exportReportToPptx(d: ReportExportData) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5

  // Cover
  const s1 = pptx.addSlide();
  s1.background = { color: "0F172A" };
  if (d.clientLogoUrl) {
    try { s1.addImage({ path: d.clientLogoUrl, x: 0.6, y: 0.5, w: 1.2, h: 1.2, sizing: { type: "contain", w: 1.2, h: 1.2 } }); } catch {}
  }
  s1.addText(d.clientName.toUpperCase(), { x: 2.0, y: 0.7, w: 10, h: 0.4, fontSize: 12, color: "94A3B8", bold: true, charSpacing: 4 });
  s1.addText(d.campaignName, { x: 0.6, y: 2.0, w: 12, h: 2.2, fontSize: 44, color: "FFFFFF", bold: true, fontFace: "Calibri" });
  const meta = [d.hashtag, d.budgetKes ? `KES ${Number(d.budgetKes).toLocaleString()}` : null, d.rangeLabel].filter(Boolean).join("   ·   ");
  if (meta) s1.addText(meta, { x: 0.6, y: 3.0, w: 12, h: 0.5, fontSize: 16, color: "CBD5E1" });
  s1.addText("Campaign Report", { x: 0.6, y: 6.6, w: 12, h: 0.4, fontSize: 12, color: "94A3B8", italic: true });

  // KPIs
  const s2 = pptx.addSlide();
  s2.addText("Performance", { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true });
  if (d.rangeLabel) s2.addText(d.rangeLabel, { x: 0.5, y: 1.0, w: 12, h: 0.3, fontSize: 12, color: "64748B" });
  const kpis = [
    ["Views", fmt(d.totals.views)],
    ["Reach", fmt(d.totals.reach)],
    ["Impressions", fmt(d.totals.impressions)],
    ["Likes", fmt(d.totals.likes)],
    ["Comments", fmt(d.totals.comments)],
    ["Shares", fmt(d.totals.shares)],
    ["Saves", fmt(d.totals.saves)],
    ["Engagement", `${d.er.toFixed(1)}%`],
  ];
  kpis.forEach(([label, val], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 0.5 + col * 3.15, y = 1.6 + row * 2.4;
    s2.addShape(pptx.ShapeType.rect, { x, y, w: 3.0, h: 2.1, fill: { color: "F8FAFC" }, line: { color: "E2E8F0", width: 1 } });
    s2.addText(label.toUpperCase(), { x: x + 0.2, y: y + 0.2, w: 2.6, h: 0.3, fontSize: 10, color: "64748B", bold: true, charSpacing: 2 });
    s2.addText(val, { x: x + 0.2, y: y + 0.6, w: 2.6, h: 1.3, fontSize: 36, bold: true, color: "0F172A" });
  });

  // EMV + Top performer
  const s3 = pptx.addSlide();
  s3.addText("Earned Media Value", { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true });
  s3.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.3, w: 6.1, h: 5.5, fill: { color: "0F172A" } });
  s3.addText("ESTIMATED VALUE", { x: 0.8, y: 1.6, w: 5.5, h: 0.4, fontSize: 11, color: "94A3B8", bold: true, charSpacing: 3 });
  s3.addText(`KES ${fmt(d.emv)}`, { x: 0.8, y: 2.1, w: 5.5, h: 1.6, fontSize: 56, color: "FFFFFF", bold: true });
  s3.addText("vs. paid media at KES 12 CPM benchmark", { x: 0.8, y: 4.0, w: 5.5, h: 0.6, fontSize: 14, color: "CBD5E1" });
  if (d.topPerformer) {
    s3.addText("TOP PERFORMER", { x: 7.0, y: 1.6, w: 5.5, h: 0.4, fontSize: 11, color: "64748B", bold: true, charSpacing: 3 });
    s3.addText(d.topPerformer.name, { x: 7.0, y: 2.1, w: 5.8, h: 0.9, fontSize: 32, bold: true });
    if (d.topPerformer.handle) s3.addText(d.topPerformer.handle, { x: 7.0, y: 3.0, w: 5.8, h: 0.4, fontSize: 14, color: "64748B" });
    s3.addText(`${fmt(d.topPerformer.views)} views`, { x: 7.0, y: 3.8, w: 5.8, h: 0.6, fontSize: 22, bold: true });
    s3.addText(`${fmt(d.topPerformer.likes)} likes`, { x: 7.0, y: 4.4, w: 5.8, h: 0.6, fontSize: 22, bold: true });
  }

  // Platform mix
  if (d.platformRows.length) {
    const s4 = pptx.addSlide();
    s4.addText("Channel Mix", { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true });
    const rows: any[][] = [
      [{ text: "Platform", options: { bold: true, fill: "F1F5F9" } }, { text: "Posts", options: { bold: true, fill: "F1F5F9", align: "right" } }, { text: "Creators", options: { bold: true, fill: "F1F5F9", align: "right" } }, { text: "Views", options: { bold: true, fill: "F1F5F9", align: "right" } }, { text: "Reach", options: { bold: true, fill: "F1F5F9", align: "right" } }],
      ...d.platformRows.map(r => [r.platform, { text: String(r.posts), options: { align: "right" } }, { text: String(r.creators), options: { align: "right" } }, { text: fmt(r.views), options: { align: "right" } }, { text: fmt(r.reach), options: { align: "right" } }])
    ];
    s4.addTable(rows, { x: 0.5, y: 1.4, w: 12.3, fontSize: 14, border: { type: "solid", pt: 1, color: "E2E8F0" } });
  }

  // Posts
  if (d.posts.length) {
    const s5 = pptx.addSlide();
    s5.addText("Posts", { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true });
    const rows: any[][] = [
      [{ text: "Creator", options: { bold: true, fill: "F1F5F9" } }, { text: "Platform", options: { bold: true, fill: "F1F5F9" } }, { text: "Views", options: { bold: true, fill: "F1F5F9", align: "right" } }, { text: "Likes", options: { bold: true, fill: "F1F5F9", align: "right" } }, { text: "Comments", options: { bold: true, fill: "F1F5F9", align: "right" } }, { text: "Shares", options: { bold: true, fill: "F1F5F9", align: "right" } }],
      ...d.posts.map(p => [p.creator, p.platform, { text: fmt(p.views), options: { align: "right" } }, { text: fmt(p.likes), options: { align: "right" } }, { text: fmt(p.comments), options: { align: "right" } }, { text: fmt(p.shares), options: { align: "right" } }])
    ];
    s5.addTable(rows, { x: 0.5, y: 1.4, w: 12.3, fontSize: 12, border: { type: "solid", pt: 1, color: "E2E8F0" } });
  }

  // Learnings
  if (d.learnings) {
    const s6 = pptx.addSlide();
    s6.addText("Learnings & Recommendations", { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true });
    s6.addText(d.learnings, { x: 0.5, y: 1.4, w: 12.3, h: 5.7, fontSize: 14, color: "1E293B", valign: "top" });
  }

  await pptx.writeFile({ fileName: `${d.clientName} - ${d.campaignName} - Report.pptx` });
}

export function downloadReportAsPdf() {
  // Browser's print-to-PDF — uses our @media print styles
  window.print();
}
