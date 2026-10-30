import pptxgen from "pptxgenjs";
import type { ListeningDeck } from "./listeningDeck";

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

/** Mood colours from the app's --status-good/--status-bad tokens, so the chart reads like the page. */
const MOOD = { positive: "23854E", neutral: "B9AFA8", negative: "BB2A5D" };

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n || 0)}`;
const full = (n: number) => Math.round(n || 0).toLocaleString();

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A move up or down, with its sign kept: "-4" and "+4" read differently at a glance. */
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** "16 Sep" from a "YYYY-MM-DD" day key, read as a local day like the page does. */
const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

/** "16 Sep 2026" from a timestamp, or "—" when the platform gave none. */
const whenLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** A slide cell holds one line or two, so long titles are cut rather than spilling. */
const cut = (s: string, max = 90) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Unread mood is a state, not a zero: never print it as "null". */
const shareText = (n: number | null) => (n == null ? "Not read yet" : `${n}%`);
const netText = (n: number | null) => (n == null ? "Not read yet" : signed(n));

/** Platform keys, as people know the platforms. */
const SOURCE_NAME: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", reddit: "Reddit" };
const platformName = (key: string) => SOURCE_NAME[key] ?? titleCase(key);

/** The keyword kinds, as the page names them. */
const kindName = (kind: string) =>
  kind === "brand" ? "Your brand" : kind === "competitor" ? "Competitor" : "Category";

/** A table cell; pptxgenjs takes a table as arrays of these. */
type Cell = {
  text: string;
  options: { align: "left" | "right"; fill: { color: string }; color: string; fontFace: string; bold?: boolean };
};

const cell = (text: string, fill: string, right = true): Cell => ({
  text,
  options: { align: right ? "right" : "left", fill: { color: fill }, color: BRAND.ink, fontFace: FONT },
});

const headCell = (text: string, right = false): Cell => ({
  text,
  options: { align: right ? "right" : "left", fill: { color: BRAND.ink }, color: BRAND.white, fontFace: FONT, bold: true },
});

export async function exportListeningToPptx(deck: ListeningDeck): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.author = "Daraja Pulse";
  pptx.company = "Daraja Pulse";
  pptx.title = `${deck.brandName} — Listening — ${deck.rangeLabel}`;

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
    s.addText(`${deck.brandName} · ${deck.rangeLabel}`, {
      x: M + CW / 2, y: 7.0, w: CW / 2, h: 0.3, fontSize: 9, color: BRAND.muted, align: "right", fontFace: FONT,
    });
    return s;
  };

  // ---------- Cover ----------
  const cover = pptx.addSlide();
  cover.background = { color: BRAND.ink };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: BRAND.accent } });
  cover.addShape(pptx.ShapeType.ellipse, { x: M, y: 0.66, w: 0.16, h: 0.16, fill: { color: BRAND.accent } });
  cover.addText("Daraja Pulse", { x: M + 0.26, y: 0.55, w: 5, h: 0.4, fontSize: 15, bold: true, color: BRAND.paper, fontFace: FONT });

  cover.addText("LISTENING REPORT", {
    x: M, y: 2.5, w: CW, h: 0.35, fontSize: 12, bold: true, charSpacing: 4, color: BRAND.accent, fontFace: FONT,
  });
  cover.addText(deck.brandName, {
    x: M, y: 2.95, w: CW - 1.5, h: 1.6, fontSize: 42, bold: true, color: BRAND.white, fontFace: FONT, valign: "top",
  });
  cover.addText(`${deck.rangeLabel}   ·   ${deck.generatedOn}`, {
    x: M, y: 4.75, w: CW, h: 0.4, fontSize: 14, color: "B9AFA8", fontFace: FONT,
  });

  // cover stat strip
  const coverStats: [string, string][] = [
    ["Posts", fmt(deck.posts)],
    ["Creators", fmt(deck.creators)],
    ["Views", fmt(deck.views)],
    ["Positive share", deck.positive == null ? "—" : `${deck.positive}%`],
  ];
  coverStats.forEach(([label, val], i) => {
    const x = M + i * (CW / 4);
    cover.addText(val, { x, y: 5.55, w: CW / 4 - 0.2, h: 0.55, fontSize: 26, bold: true, color: BRAND.white, fontFace: FONT });
    cover.addText(label.toUpperCase(), {
      x, y: 6.1, w: CW / 4 - 0.2, h: 0.3, fontSize: 9, bold: true, charSpacing: 2, color: "9A8F88", fontFace: FONT,
    });
  });
  cover.addText("Listening report", { x: M, y: 6.9, w: CW, h: 0.3, fontSize: 10, color: "7C716B", fontFace: FONT });

  // ---------- The conversation ----------
  const postDelta = deck.change.delta;
  const s2 = sheet("The conversation", deck.rangeLabel);
  s2.addText(full(deck.posts), {
    x: M, y: 1.7, w: CW, h: 1.2, fontSize: 54, bold: true, color: BRAND.ink, fontFace: FONT, valign: "top",
  });
  s2.addText("POSTS", { x: M, y: 2.95, w: 4, h: 0.25, fontSize: 9, bold: true, charSpacing: 2, color: BRAND.muted, fontFace: FONT });
  // Only meaningful when there is a period before to compare with.
  if (deck.compare)
    s2.addText(`${signed(postDelta)} posts vs ${deck.previousLabel} (${full(deck.previousPosts)})`, {
      x: M + 2.4, y: 2.9, w: CW - 2.4, h: 0.3, fontSize: 13, bold: true, fontFace: FONT,
      color: postDelta > 0 ? MOOD.positive : postDelta < 0 ? MOOD.negative : BRAND.muted,
    });

  const readLine =
    deck.positive == null
      ? "None of them have been read for mood yet."
      : `${deck.positive}% of the ${full(deck.rated)} posts read for mood are positive.`;
  s2.addText(`${full(deck.posts)} posts from ${full(deck.creators)} creators in ${deck.rangeLabel}. ${readLine}`, {
    x: M, y: 3.5, w: CW - 0.4, h: 0.8, fontSize: 14, color: BRAND.inkSoft, fontFace: FONT, valign: "top",
  });

  const cardW = (CW - 0.6) / 3;
  const cards: [string, string][] = [
    ["Creators", deck.creators ? fmt(deck.creators) : "—"],
    ["Posts read for mood", deck.positive == null ? "Not read yet" : `${full(deck.rated)} of ${full(deck.posts)}`],
    ["Views, where reported", deck.views ? fmt(deck.views) : "—"],
  ];
  cards.forEach(([label, val], i) => {
    const x = M + i * (cardW + 0.3);
    const y = 4.75;
    s2.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: 1.45, fill: { color: BRAND.white }, line: { color: BRAND.border, width: 1 }, rectRadius: 0.08,
    });
    s2.addShape(pptx.ShapeType.rect, { x: x + 0.22, y: y + 0.24, w: 0.28, h: 0.045, fill: { color: BRAND.accent } });
    s2.addText(label.toUpperCase(), {
      x: x + 0.22, y: y + 0.4, w: cardW - 0.44, h: 0.3, fontSize: 9, bold: true, charSpacing: 2, color: BRAND.muted, fontFace: FONT,
    });
    s2.addText(val, {
      x: x + 0.22, y: y + 0.72, w: cardW - 0.44, h: 0.55, fontSize: val.length > 9 ? 20 : 24, bold: true, color: BRAND.ink, fontFace: FONT,
    });
  });

  // ---------- Mood over time ----------
  const hasMood = deck.days.some((d) => d.positive + d.neutral + d.negative > 0);
  if (hasMood) {
    const labels = deck.days.map((d) => dayLabel(d.day));
    const s3 = sheet("Mood over time", "Posts read for mood, per day");
    s3.addChart(
      pptx.ChartType.bar,
      [
        { name: "Positive", labels, values: deck.days.map((d) => d.positive) },
        { name: "Neutral", labels, values: deck.days.map((d) => d.neutral) },
        { name: "Negative", labels, values: deck.days.map((d) => d.negative) },
      ],
      {
        x: M, y: 1.8, w: CW, h: 4.65,
        barDir: "col",
        barGrouping: "stacked",
        barGapWidthPct: 40,
        chartColors: [MOOD.positive, MOOD.neutral, MOOD.negative],
        showLegend: true,
        legendPos: "b",
        legendFontFace: FONT,
        legendFontSize: 10,
        legendColor: BRAND.ink,
        showTitle: false,
        catAxisLabelFontFace: FONT,
        catAxisLabelFontSize: 8,
        catAxisLabelColor: BRAND.muted,
        catAxisLabelRotate: -45,
        catAxisLineShow: false,
        valAxisLabelFontFace: FONT,
        valAxisLabelFontSize: 9,
        valAxisLabelColor: BRAND.muted,
        valAxisLineShow: false,
        valGridLine: { color: BRAND.border, style: "solid", size: 1 },
      },
    );
    s3.addText(`${full(deck.rated)} of ${full(deck.posts)} posts read for mood in ${deck.rangeLabel}.`, {
      x: M, y: 6.45, w: CW, h: 0.3, fontSize: 10, color: BRAND.muted, fontFace: FONT,
    });
  }

  // ---------- Share of voice ----------
  if (deck.voices.length) {
    const s4 = sheet("Share of voice", `On-topic posts, ${deck.rangeLabel}`);
    // Voices can outnumber the rows that fit, so the row height gives way before the table does.
    const rowH = Math.min(0.42, 4.9 / (deck.voices.length + 1));
    const rows: Cell[][] = [
      [headCell("Name"), headCell("Kind"), headCell("Posts", true), headCell("Share", true), headCell("Net mood", true)],
      ...deck.voices.map((v, i) => {
        const fill = i % 2 ? BRAND.paperAlt : BRAND.white;
        return [
          cell(v.label, fill, false),
          cell(kindName(v.kind), fill, false),
          cell(full(v.mentions), fill),
          cell(`${v.share}%`, fill),
          cell(netText(v.net), fill),
        ];
      }),
    ];
    s4.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.36, CW * 0.22, CW * 0.14, CW * 0.14, CW * 0.14],
      fontSize: 11, rowH, valign: "middle", margin: 0.1,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
  }

  // ---------- Platforms ----------
  if (deck.platforms.length) {
    const s5 = sheet("Platforms", "Where the conversation happened");
    const rows: Cell[][] = [
      [headCell("Platform"), headCell("Posts", true), headCell("Share", true), headCell("Views", true)],
      ...deck.platforms.map((p, i) => {
        const fill = i % 2 ? BRAND.paperAlt : BRAND.white;
        return [
          cell(p.label, fill, false),
          cell(full(p.mentions), fill),
          cell(`${p.share}%`, fill),
          // Not every platform reports views; say so rather than print a fake zero.
          cell(p.viewsKnown ? full(p.reach) : "no views reported", fill),
        ];
      }),
    ];
    s5.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.3, CW * 0.16, CW * 0.16, CW * 0.38],
      fontSize: 13, rowH: 0.42, valign: "middle", margin: 0.12,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
  }

  // ---------- What people talk about ----------
  const topThemes = deck.themes.slice(0, 8);
  if (topThemes.length) {
    const s6 = sheet("What people talk about", "Themes across the posts we read");
    const rows: Cell[][] = [
      [headCell("Theme"), headCell("Posts", true), headCell("Positive", true), headCell("Negative", true)],
      ...topThemes.map((t, i) => {
        const fill = i % 2 ? BRAND.paperAlt : BRAND.white;
        return [cell(t.theme, fill, false), cell(full(t.mentions), fill), cell(full(t.positive), fill), cell(full(t.negative), fill)];
      }),
    ];
    s6.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.46, CW * 0.18, CW * 0.18, CW * 0.18],
      fontSize: 12, rowH: 0.46, valign: "middle", margin: 0.12,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
  }

  // ---------- Needs attention ----------
  const attention = deck.attention.slice(0, 8);
  if (attention.length) {
    const s7 = sheet("Needs attention", "Negative posts that are spreading");
    const rows: Cell[][] = [
      [headCell("Platform"), headCell("Author"), headCell("Title"), headCell("Views", true), headCell("Mood", true)],
      ...attention.map((m, i) => {
        const fill = i % 2 ? BRAND.paperAlt : BRAND.white;
        return [
          cell(platformName(m.source), fill, false),
          cell(m.author?.trim() || "—", fill, false),
          cell(cut(m.title ?? m.snippet ?? "—"), fill, false),
          cell(m.reach == null ? "—" : full(m.reach), fill),
          cell(m.sentiment ? titleCase(m.sentiment) : "Not read yet", fill),
        ];
      }),
    ];
    s7.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.1, CW * 0.17, CW * 0.43, CW * 0.12, CW * 0.18],
      fontSize: 9, rowH: 0.42, valign: "middle", margin: 0.1,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
  }

  // ---------- Most seen posts ----------
  if (deck.top.length) {
    const s8 = sheet("Most seen posts", "Ranked by views");
    const rows: Cell[][] = [
      [headCell("Rank", true), headCell("Platform"), headCell("Author"), headCell("Title"), headCell("Views", true), headCell("Date")],
      ...deck.top.map((m, i) => {
        const fill = i % 2 ? BRAND.paperAlt : BRAND.white;
        return [
          cell(full(i + 1), fill),
          cell(platformName(m.source), fill, false),
          cell(m.author?.trim() || "—", fill, false),
          cell(cut(m.title ?? m.snippet ?? "—"), fill, false),
          cell(m.reach == null ? "—" : full(m.reach), fill),
          // The platform's date when it gives one, else when we found the post.
          cell(whenLabel(m.published_at ?? m.found_at), fill, false),
        ];
      }),
    ];
    s8.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.06, CW * 0.11, CW * 0.17, CW * 0.4, CW * 0.12, CW * 0.14],
      fontSize: 9, rowH: 0.38, valign: "middle", margin: 0.1,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
  }

  // ---------- Against the period before ----------
  if (deck.compare) {
    const s9 = sheet("Against the period before", deck.rangeLabel);
    const compareRows: [string, string, string][] = [
      ["Posts", full(deck.posts), full(deck.previousPosts)],
      [
        "Views, where reported",
        deck.views ? full(deck.views) : "no views reported",
        deck.previousViews ? full(deck.previousViews) : "no views reported",
      ],
      // Mood is only read for the current period's posts, so there is no figure to put opposite.
      ["Posts read for mood", deck.positive == null ? "Not read yet" : full(deck.rated), "—"],
      ["Positive share", shareText(deck.positive), "—"],
    ];
    const rows: Cell[][] = [
      [headCell(""), headCell(deck.rangeLabel, true), headCell(deck.previousLabel, true)],
      ...compareRows.map(([label, now, before], i) => {
        const fill = i % 2 ? BRAND.paperAlt : BRAND.white;
        return [cell(label, fill, false), cell(now, fill), cell(before, fill)];
      }),
    ];
    s9.addTable(rows, {
      x: M, y: 1.85, w: CW, colW: [CW * 0.4, CW * 0.3, CW * 0.3],
      fontSize: 12, rowH: 0.5, valign: "middle", margin: 0.12,
      border: { type: "solid", pt: 1, color: BRAND.border },
    });
    s9.addText(`${signed(postDelta)} posts against the period before.`, {
      x: M, y: 5.4, w: CW, h: 0.5, fontSize: 24, bold: true, fontFace: FONT,
      color: postDelta > 0 ? MOOD.positive : postDelta < 0 ? MOOD.negative : BRAND.muted,
    });
    s9.addText("Mood is read from the posts in this period, so the previous period shows posts and views only.", {
      x: M, y: 5.95, w: CW, h: 0.4, fontSize: 11, color: BRAND.muted, fontFace: FONT,
    });
  }

  // ---------- Closing ----------
  const end = pptx.addSlide();
  end.background = { color: BRAND.ink };
  end.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: BRAND.accent } });
  end.addShape(pptx.ShapeType.ellipse, { x: M, y: 3.2, w: 0.2, h: 0.2, fill: { color: BRAND.accent } });
  end.addText("Daraja Pulse", { x: M + 0.32, y: 3.05, w: 8, h: 0.5, fontSize: 26, bold: true, color: BRAND.white, fontFace: FONT });
  end.addText("Influence, measured.", { x: M + 0.32, y: 3.6, w: 8, h: 0.4, fontSize: 14, color: "9A8F88", fontFace: FONT });
  end.addText("darajapulse.com", { x: M + 0.32, y: 4.1, w: 8, h: 0.4, fontSize: 12, color: BRAND.accent, fontFace: FONT });

  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
  await pptx.writeFile({ fileName: `${safe(`${deck.brandName} - Listening - ${deck.rangeLabel}`)}.pptx` });
}
