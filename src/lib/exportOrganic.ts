import pptxgen from "pptxgenjs";
import { BRAND, FONT } from "./exportListening";
import type { DeckSlide, Figure } from "./organicDeck";

const W = 13.33;
const M = 0.7;
const CW = W - M * 2;

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim();

/** Draws the deck in the browser and downloads it. */
export async function exportOrganicToPptx(outline: DeckSlide[], title: string): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.author = "Daraja Pulse";
  pptx.company = "Daraja Pulse";
  pptx.title = title;

  const heading = (slide: pptxgen.Slide, text: string, sub?: string) => {
    slide.background = { color: BRAND.paper };
    slide.addText(text, { x: M, y: 0.45, w: CW, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: BRAND.ink });
    if (sub) slide.addText(sub, { x: M, y: 1.1, w: CW, h: 0.4, fontFace: FONT, fontSize: 14, color: BRAND.muted });
  };
  const figures = (slide: pptxgen.Slide, list: Figure[], y: number) => {
    const w = CW / list.length;
    list.forEach((f, i) => {
      slide.addText(f.value, { x: M + i * w, y, w, h: 0.9, fontFace: FONT, fontSize: 30, color: BRAND.ink });
      slide.addText(f.label, { x: M + i * w, y: y + 0.85, w, h: 0.4, fontFace: FONT, fontSize: 13, color: BRAND.muted });
    });
  };

  for (const s of outline) {
    const slide = pptx.addSlide();
    if (s.kind === "cover") {
      slide.background = { color: BRAND.ink };
      slide.addText(s.title, { x: M, y: 2.4, w: CW, h: 1.2, fontFace: FONT, fontSize: 44, bold: true, color: BRAND.white });
      slide.addText(s.subtitle, { x: M, y: 3.6, w: CW, h: 0.5, fontFace: FONT, fontSize: 18, color: BRAND.paperAlt });
      slide.addText(s.footer, { x: M, y: 6.6, w: CW, h: 0.4, fontFace: FONT, fontSize: 12, color: BRAND.paperAlt });
    } else if (s.kind === "headline") {
      heading(slide, "Headline numbers");
      figures(slide, s.tiles, 1.7);
      const lines = [s.sourcesLine, ...s.notes].filter(Boolean);
      if (lines.length) slide.addText(lines.join("\n"), { x: M, y: 3.6, w: CW, h: 3, fontFace: FONT, fontSize: 13, color: BRAND.muted, valign: "top" });
    } else if (s.kind === "account") {
      heading(slide, s.name, `@${s.handle} · ${s.platform} · ${s.tag}`);
      figures(slide, s.figures, 2);
    } else if (s.kind === "top_posts") {
      heading(slide, "Top posts");
      const w = CW / s.posts.length;
      s.posts.forEach((p, i) => {
        slide.addText(p.label, { x: M + i * w, y: 1.6, w: w - 0.2, h: 0.4, fontFace: FONT, fontSize: 13, color: BRAND.muted });
        slide.addText(p.value, { x: M + i * w, y: 2, w: w - 0.2, h: 0.9, fontFace: FONT, fontSize: 30, color: BRAND.ink });
        slide.addText(p.unit, { x: M + i * w, y: 2.85, w: w - 0.2, h: 0.35, fontFace: FONT, fontSize: 12, color: BRAND.muted });
        slide.addText(p.url ? [{ text: p.name, options: { hyperlink: { url: p.url } } }] : p.name, { x: M + i * w, y: 3.3, w: w - 0.2, h: 1.6, fontFace: FONT, fontSize: 13, color: BRAND.ink, valign: "top" });
      });
    } else {
      heading(slide, "What worked");
      s.formats.forEach((f, i) => {
        slide.addText(`${f.label} · ${f.posts} ${f.posts === 1 ? "post" : "posts"}`, { x: M, y: 1.6 + i * 0.5, w: CW / 2, h: 0.45, fontFace: FONT, fontSize: 15, color: BRAND.ink });
        slide.addText(`${f.avgViews} average views`, { x: M + CW / 2, y: 1.6 + i * 0.5, w: CW / 2, h: 0.45, fontFace: FONT, fontSize: 15, color: BRAND.ink });
      });
      if (s.bestSlot) slide.addText(`Best time to post: ${s.bestSlot}`, { x: M, y: 5.6, w: CW, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: BRAND.ink });
    }
  }
  await pptx.writeFile({ fileName: `${safeName(title)}.pptx` });
}
