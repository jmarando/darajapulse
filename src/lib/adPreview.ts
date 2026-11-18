// Sizes and names the "See it in place" previews draw from.

export type BannerFormat = "web_leaderboard" | "web_mpu" | "web_halfpage";

/** The banner sizes a slot runs at: what a computer shows, what a phone shows (null when phones don't), and its label. */
export const BANNER_SIZES: Record<BannerFormat, { computer: [number, number]; phone: [number, number] | null; label: string }> = {
  web_leaderboard: { computer: [728, 90], phone: [320, 50], label: "970 × 90, 728 × 90 or 320 × 50" },
  web_mpu: { computer: [300, 250], phone: [300, 250], label: "300 × 250 or 336 × 280" },
  web_halfpage: { computer: [300, 600], phone: null, label: "300 × 600" },
};

export const isBannerFormat = (format: string | null | undefined): format is BannerFormat =>
  format === "web_leaderboard" || format === "web_mpu" || format === "web_halfpage";

/** A print ad's box on a newspaper page of 6 columns and 10 rows. */
export function printBox(option: string | null | undefined): { cols: number; rows: number; label: string } {
  const o = (option ?? "").trim().toLowerCase();
  const label = option?.trim() || "Display ad";
  if (o.startsWith("quarter")) return { cols: 3, rows: 5, label };
  if (o.startsWith("half")) return { cols: 6, rows: 5, label };
  if (o.startsWith("full")) return { cols: 6, rows: 10, label };
  return { cols: 6, rows: 3, label };
}

const PLATFORM_SUFFIX = /\s+(?:on|—|–|-)\s+(?:facebook|instagram|tiktok|youtube|x|twitter)$/i;

/** "The Star" for "The Star online: Leaderboard", "Kiss 100" for "Kiss 100 on Instagram". */
export function propertyName(item: { title: string }): string {
  const at = item.title.indexOf(": ");
  if (at > 0) return item.title.slice(0, at).replace(/\s+(?:online|newspaper)$/i, "").trim();
  return item.title.replace(PLATFORM_SUFFIX, "").trim() || item.title;
}

const DOMAINS: Record<string, string> = { "The Star": "the-star.co.ke", Mpasho: "mpasho.co.ke", "Songa Play": "songaplay.com" };
export const domainOf = (name: string): string => DOMAINS[name] ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.co.ke`;

/** How long an audio ad runs, from its choice ("15-second pre-roll"). */
export const secondsOf = (option: string | null | undefined): number =>
  /\b15-second/i.test(option ?? "") ? 15 : /\b60-second/i.test(option ?? "") ? 60 : 30;

/** Formats that have a "See it in place" sketch: banners, print, social posts, the week on air and the streaming app. */
export const hasPreview = (format: string | null | undefined): boolean => /^(web_|print_|social_|radio_|audio_)/.test(format ?? "");

export type RadioScript = { lines: string[]; words: number; seconds: number; target: number };

const tidy = (s?: string | null) => (s ?? "").trim().replace(/\s+/g, " ");
const endWith = (s: string, mark: string) => (/[.!?]$/.test(s) ? s : `${s}${mark}`);
const spoken = (s: string) => s.replace(/[\s.!?,;:'"()–—-]+/g, "").length > 0;

/**
 * A rough radio script from the brand kit, so the buyer sees the shape of the advert before the studio writes the real
 * one: the headline, the offer, the call to action and the headline again, read at about 2.5 words a second.
 */
export function radioScript(kit: { headline?: string | null; message?: string | null; cta?: string | null }, target: number): RadioScript {
  const headline = tidy(kit.headline);
  const said = [
    endWith(headline, "!"),
    endWith(tidy(kit.message), "."),
    endWith(tidy(kit.cta), "."),
    endWith(headline.replace(/!+$/, ""), "."),
  ].filter(spoken);
  const words = said.join(" ").split(/\s+/).filter(Boolean).length;
  return { lines: said.length ? ["[Music up]", ...said, "[Music out]"] : [], words, seconds: Math.round(words / 2.5), target };
}
