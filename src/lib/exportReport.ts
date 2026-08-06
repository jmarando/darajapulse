import pptxgen from "pptxgenjs";

/** Daraja Pulse brand palette (mirrors the semantic tokens in index.css). */
const BRAND = {
  ink: "1D1816",
  inkSoft: "332B27",
  paper: "FAF7F2",
  paperAlt: "F1ECE4",
  accent: "FD1A14",
  muted: "6E645F",
  border: "E0DAD5",
  white: "FFFFFF",
};

const FONT = "Geist";

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n || 0)}`;
const full = (n: number) => Math.round(n || 0).toLocaleString();

export type ReportExportData = {
  campaignName: string;
  clientName: string;
  hashtag?: string | null;
  budgetKes?: number;
  rangeLabel?: string;
  totals: { views: number; reach: number; impressions: number; likes: number; comments: number; shares: number; saves: number };
  er: number;
  emv?: number;
  topPerformer?: { name: string; handle?: string; views: number; likes: number } | null;
  platformRows: { platform: string; posts: number; creators: number; views: number; reach: number }[];
  posts: { creator: string; platform: string; views: number; likes: number; comments: number; shares: number; url?: string }[];
  learnings?: string | null;
  clientLogoUrl?: string | null;
};

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export async function exportReportToPptx(d: ReportExportData) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.author = "Daraja Pulse";
  pptx.company = "Daraja Pulse";
  pptx.title = `${d.clientName} — ${d.campaignName}`;

  const W = 13.33;
  const M = 0.7; // margin
  const CW = W - M * 2; // content width

  /** Standard light slide with wordmark + footer rule. */
  const sheet = (heading: string, kicker?: string) => {
    const s = pptx.addSlide();
    s.background = { color: BRAND.paper };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.06, fill: { color: BRAND.accent } });
    if (kicker)
      s.addText(kicker.toUpperCase(), {
        x: M, y: 0.45, w: CW, h: 0.25, fontSize: 9, bold: true, charSpacing: 3, color: BRAND.accent, fontFace: FONT,
      });
    s.addText(heading, { x: M, y: kicker ? 0.72 : 0.55, w: CW, h: 0.6, fontSize: 30, bold: true, color: BRAND.ink, fontFace: FONT });
    // footer
    s.addShape(pptx.ShapeType.rect, { x: M, y: 6.95, w: CW, h: 0.01, fill: { color: BRAND.border } });
    s.addText("Daraja Pulse · Influence, measured.", {
      x: M, y: 7.0, w: CW / 2, h: 0.3, fontSize: 9, color: BRAND.muted, fontFace: FONT,
    });
    s.addText(`${d.clientName} · ${d.campaignName}`, {
      x: M + CW / 2, y: 7.0, w: CW / 2, h: 0.3, fontSize: 9, color: BRAND.muted, align: "right", fontFace: FONT,
    });
    return s;
  };

  // ---------- Cover ----------
  const s1 = pptx.addSlide();
  s1.background = { color: BRAND.ink };
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: BRAND.accent } });
  s1.addShape(pptx.ShapeType.ellipse, { x: M, y: 0.66, w: 0.16, h: 0.16, fill: { color: BRAND.accent } });
  s1.addText("Daraja Pulse", { x: M + 0.26, y: 0.55, w: 5, h: 0.4, fontSize: 15, bold: true, color: BRAND.paper, fontFace: FONT });
  if (d.clientLogoUrl) {
    try {
      s1.addImage({ path: d.clientLogoUrl, x: W - M - 1.1, y: 0.5, w: 1.1, h: 1.1, sizing: { type: "contain", w: 1.1, h: 1.1 } });
    } catch { /* logo optional */ }
  }

  s1.addText(d.clientName.toUpperCase(), {
    x: M, y: 2.5, w: CW, h: 0.35, fontSize: 12, bold: true, charSpacing: 4, color: BRAND.accent, fontFace: FONT,
  });
  s1.addText(d.campaignName, {
    x: M, y: 2.95, w: CW - 1.5, h: 1.6, fontSize: 42, bold: true, color: BRAND.white, fontFace: FONT, valign: "top",
  });
  const meta = [d.hashtag, d.rangeLabel, d.budgetKes ? `Budget KES ${Number(d.budgetKes).toLocaleString()}` : null]
    .filter(Boolean)
    .join("   ·   ");
  if (meta) s1.addText(meta, { x: M, y: 4.75, w: CW, h: 0.4, fontSize: 14, color: "B9AFA8", fontFace: FONT });

  // cover stat strip
  const coverStats = [
    ["Views", fmt(d.totals.views)],
    ["Engagements", fmt(d.totals.likes + d.totals.comments + d.totals.shares + d.totals.saves)],
    ["Posts", String(d.posts.length)],
    ["Engagement rate", `${d.er.toFixed(1)}%`],
  ];
  coverStats.forEach(([label, val], i) => {
    const x = M + i * (CW / 4);
    s1.addText(val, { x, y: 5.55, w: CW / 4 - 0.2, h: 0.55, fontSize: 26, bold: true, color: BRAND.white, fontFace: FONT });
    s1.addText(label.toUpperCase(), {
      x, y: 6.1, w: CW / 4 - 0.2, h: 0.3, fontSize: 9, bold: true, charSpacing: 2, color: "9A8F88", fontFace: FONT,
    });
  });
  s1.addText("Campaign report", { x: M, y: 6.9, w: CW, h: 0.3, fontSize: 10, color: "7C716B", fontFace: FONT });

  // ---------- KPIs ----------
  const s2 = sheet("Performance", d.rangeLabel || "Campaign to date");
  const kpis: [string, string, string?][] = [
    ["Views", full(d.totals.views)],
    ["Reach", full(d.totals.reach)],
    ["Impressions", full(d.totals.impressions)],
    ["Engagement rate", `${d.er.toFixed(1)}%`],
    ["Likes", full(d.totals.likes)],
    ["Comments", full(d.totals.comments)],
    ["Shares", full(d.totals.shares)],
    ["Saves", full(d.totals.saves)],
  ];
  const cw = (CW - 0.3 * 3) / 4;
  kpis.forEach(([label, val], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = M + col * (cw + 0.3);
    const y = 1.75 + row * 2.3;
    s2.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cw, h: 1.95, fill: { color: BRAND.white }, line: { color: BRAND.border, width: 1 }, rectRadius: 0.08,
    });
    s2.addShape(pptx.ShapeType.rect, { x: x + 0.22, y: y + 0.24, w: 0.28, h: 0.045, fill: { color: BRAND.accent } });
    s2.addText(label.toUpperCase(), {
      x: x + 0.22, y: y + 0.4, w: cw - 0.44, h: 0.3, fontSize: 9, bold: true, charSpacing: 2, color: BRAND.muted, fontFace: FONT,
    });
    s2.addText(val, {
      x: x + 0.22, y: y + 0.75, w: cw - 0.44, h: 0.95, fontSize: val.length > 9 ? 26 : 32, bold: true, color: BRAND.ink, fontFace: FONT, valign: "top",
    });
  });
  if (d.emv)
    s2.addText(`Estimated media value: KES ${full(d.emv)}`, {
      x: M, y: 6.45, w: CW, h: 0.3, fontSize: 11, color: BRAND.muted, fontFace: FONT,
    });

  // ---------- Channel mix ----------
  if (d.platformRows.length) {
    const s4 = sheet("Channel mix", "Where the campaign ran");
    const head = ["Platform", "Posts", "Creators", "Views", "Reach"];
    const rows: any[][] = [
      head.map((h, i) => ({
        text: h,
        options: { bold: true, color: BRAND.white, fill: BRAND.ink, align: i === 0 ? "left" : "right", fontFace: FONT },
      })),
      ...d.platformRows.map((r, ri) => {
        const fill = ri % 2 ? BRAND.paperAlt : BRAND.white;
        const cell = (t: string, right = true) => ({ text: t, options: { align: right ? "right" : "left", fill, color: BRAND.ink, fontFace: FONT } });
        return [cell(titleCase(r.platform), false), cell(full(r.posts)), cell(full(r.creators)), cell(full(r.views)), cell(full(r.reach))];
      }),
    ];
    s4.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.28, CW * 0.15, CW * 0.17, CW * 0.2, CW * 0.2],
      fontSize: 13, rowH: 0.42, valign: "middle", margin: 0.12,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
  }

  // ---------- Top performer ----------
  if (d.topPerformer) {
    const s3 = sheet("Standout creator", "Top performer");
    s3.addShape(pptx.ShapeType.roundRect, {
      x: M, y: 1.9, w: CW, h: 3.4, fill: { color: BRAND.white }, line: { color: BRAND.border, width: 1 }, rectRadius: 0.1,
    });
    s3.addText(d.topPerformer.name, { x: M + 0.5, y: 2.3, w: CW - 1, h: 0.9, fontSize: 34, bold: true, color: BRAND.ink, fontFace: FONT });
    if (d.topPerformer.handle)
      s3.addText(`@${d.topPerformer.handle.replace(/^@/, "")}`, {
        x: M + 0.5, y: 3.15, w: CW - 1, h: 0.4, fontSize: 14, color: BRAND.accent, fontFace: FONT,
      });
    s3.addText(full(d.topPerformer.views), { x: M + 0.5, y: 3.85, w: 3.5, h: 0.7, fontSize: 30, bold: true, color: BRAND.ink, fontFace: FONT });
    s3.addText("VIEWS", { x: M + 0.5, y: 4.55, w: 3.5, h: 0.3, fontSize: 9, bold: true, charSpacing: 2, color: BRAND.muted, fontFace: FONT });
    s3.addText(full(d.topPerformer.likes), { x: M + 4.3, y: 3.85, w: 3.5, h: 0.7, fontSize: 30, bold: true, color: BRAND.ink, fontFace: FONT });
    s3.addText("LIKES", { x: M + 4.3, y: 4.55, w: 3.5, h: 0.3, fontSize: 9, bold: true, charSpacing: 2, color: BRAND.muted, fontFace: FONT });
  }

  // ---------- Posts (paginated, 12 rows per slide) ----------
  if (d.posts.length) {
    const sorted = [...d.posts].sort((a, b) => b.views - a.views);
    const PER = 10;
    const pages = Math.ceil(sorted.length / PER);
    for (let p = 0; p < pages; p++) {
      const chunk = sorted.slice(p * PER, (p + 1) * PER);
      const s5 = sheet(pages > 1 ? `Posts (${p + 1}/${pages})` : "Posts", `${d.posts.length} posts · ranked by views`);
      const head = ["Creator", "Platform", "Views", "Likes", "Comments", "Shares"];
      const rows: any[][] = [
        head.map((h, i) => ({
          text: h,
          options: { bold: true, color: BRAND.white, fill: BRAND.ink, align: i < 2 ? "left" : "right", fontFace: FONT },
        })),
        ...chunk.map((row, ri) => {
          const fill = ri % 2 ? BRAND.paperAlt : BRAND.white;
          const cell = (t: string, right = true) => ({ text: t, options: { align: right ? "right" : "left", fill, color: BRAND.ink, fontFace: FONT } });
          return [cell(row.creator, false), cell(titleCase(row.platform), false), cell(full(row.views)), cell(full(row.likes)), cell(full(row.comments)), cell(full(row.shares))];
        }),
      ];
      s5.addTable(rows, {
        x: M, y: 1.85, w: CW, colW: [CW * 0.3, CW * 0.14, CW * 0.14, CW * 0.14, CW * 0.14, CW * 0.14],
        fontSize: 11, rowH: 0.38, valign: "middle", margin: 0.1,
        border: { type: "solid", pt: 1, color: BRAND.border },
      });
    }
  }

  // ---------- Learnings ----------
  if (d.learnings) {
    const s6 = sheet("Learnings & recommendations", "What we take forward");
    const bullets = d.learnings
      .split(/\n+/)
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
    s6.addShape(pptx.ShapeType.roundRect, {
      x: M, y: 1.8, w: CW, h: 4.9, fill: { color: BRAND.white }, line: { color: BRAND.border, width: 1 }, rectRadius: 0.1,
    });
    s6.addText(
      bullets.map((t) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: true, color: BRAND.inkSoft, fontSize: 14, fontFace: FONT, paraSpaceAfter: 8 } })),
      { x: M + 0.4, y: 2.1, w: CW - 0.8, h: 4.3, valign: "top" },
    );
  }

  // ---------- Closing ----------
  const sEnd = pptx.addSlide();
  sEnd.background = { color: BRAND.ink };
  sEnd.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: BRAND.accent } });
  sEnd.addShape(pptx.ShapeType.ellipse, { x: M, y: 3.2, w: 0.2, h: 0.2, fill: { color: BRAND.accent } });
  sEnd.addText("Daraja Pulse", { x: M + 0.32, y: 3.05, w: 8, h: 0.5, fontSize: 26, bold: true, color: BRAND.white, fontFace: FONT });
  sEnd.addText("Influence, measured.", { x: M + 0.32, y: 3.6, w: 8, h: 0.4, fontSize: 14, color: "9A8F88", fontFace: FONT });
  sEnd.addText("darajapulse.com", { x: M + 0.32, y: 4.1, w: 8, h: 0.4, fontSize: 12, color: BRAND.accent, fontFace: FONT });

  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
  await pptx.writeFile({ fileName: `${safe(d.clientName)} - ${safe(d.campaignName)} - Daraja Pulse Report.pptx` });
}

export function downloadReportAsPdf() {
  // Browser's print-to-PDF — uses our @media print styles
  window.print();
}
