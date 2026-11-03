// What the organic report's deck says, slide by slide, worked out from the report object so the slides and the page can't
// drift apart. The drawing is in exportOrganic.ts and only loads when someone exports.
import { DAY_LABELS, slotLabel } from "@/lib/postingCadence";
import { compact, platformLabel } from "@/lib/reportInsights";
import type { OrganicReport } from "../../supabase/functions/_shared/organic-report";

export type Figure = { label: string; value: string };
export type DeckSlide =
  | { kind: "cover"; title: string; subtitle: string; footer: string }
  | { kind: "headline"; tiles: Figure[]; sourcesLine: string; notes: string[] }
  | { kind: "account"; name: string; handle: string; platform: string; tag: "From Meta" | "Public numbers"; figures: Figure[] }
  | { kind: "top_posts"; posts: { label: string; name: string; value: string; unit: string; url: string | null }[] }
  | { kind: "what_worked"; formats: { label: string; posts: number; avgViews: string }[]; bestSlot: string | null };

const number = (v: number | null) => (v === null ? "—" : compact(v));
const percent = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

const FORMAT_LABEL: Record<string, string> = { video: "Video", photo: "Photo", carousel: "Carousel", text: "Text", other: "Other" };
const PICK_LABEL = { views: { label: "Most viewed", unit: "views" }, engagement: { label: "Highest engagement", unit: "engagement rate" }, intent: { label: "Strongest intent", unit: "saves and shares" } };

export function deckOutline(report: OrganicReport, ctx: { brandName: string; rangeLabel: string; generatedOn: string }): DeckSlide[] {
  const { tiles, platforms, picks, formats, cadence, sourcesLine, notes } = report;
  const slides: DeckSlide[] = [
    { kind: "cover", title: ctx.brandName, subtitle: `Organic report · ${ctx.rangeLabel}`, footer: `Made ${ctx.generatedOn}` },
    {
      kind: "headline",
      tiles: [
        { label: "Followers", value: number(tiles.followers.value) },
        { label: "Posts", value: number(tiles.posts.value) },
        { label: "Views", value: number(tiles.views.value) },
        { label: "Interactions", value: number(tiles.interactions.value) },
        { label: "Engagement rate", value: percent(tiles.rate.value) },
      ],
      sourcesLine,
      notes,
    },
    ...platforms.map((p): DeckSlide => ({
      kind: "account",
      name: p.name,
      handle: p.handle,
      platform: platformLabel(p.platform),
      tag: p.tag === "Connected" ? "From Meta" : "Public numbers",
      figures: [
        { label: "Followers", value: number(p.followers) },
        { label: "Posts", value: String(p.posts) },
        { label: "Views", value: number(p.views) },
        { label: "Engagement rate", value: percent(p.rate) },
      ],
    })),
  ];
  if (picks.length) {
    slides.push({
      kind: "top_posts",
      posts: picks.map((p) => ({
        ...PICK_LABEL[p.kind],
        name: p.post.caption?.trim().slice(0, 90) || p.post.influencers.full_name,
        value: p.kind === "views" ? compact(Number(p.metrics.views)) : p.kind === "engagement" ? `${p.rate.toFixed(1)}%` : compact(p.intent),
        url: p.post.post_url,
      })),
    });
  }
  if (picks.length && formats.length) {
    slides.push({
      kind: "what_worked",
      formats: formats.map((f) => ({ label: FORMAT_LABEL[f.format] ?? f.format, posts: f.posts, avgViews: number(f.avgViews === null ? null : Math.round(f.avgViews)) })),
      bestSlot: cadence.best ? `${DAY_LABELS[cadence.best.day]} ${slotLabel(cadence.best.hour)} (Nairobi time)` : null,
    });
  }
  return slides;
}
