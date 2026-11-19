// A house's own colour on its storefront: kept for large type, lines and bars, and darkened just enough for buttons
// with white text, which need 4.5:1 to read.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const channels = (hex: string): number[] => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const luminance = (rgb: number[]): number => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** How well white text reads on this #rrggbb colour (WCAG contrast ratio). */
export const contrastWithWhite = (hex: string): number => 1.05 / (luminance(channels(hex)) + 0.05);

/**
 * The colour itself when white text already reads on it (4.5:1), else the colour darkened in small steps until it
 * does. Anything that isn't a #rgb or #rrggbb colour comes back as it is.
 */
export function readableShade(color: string): string {
  if (!HEX.test(color)) return color;
  let rgb = channels(color);
  if (1.05 / (luminance(rgb) + 0.05) >= 4.5) return color;
  for (let i = 0; i < 40 && 1.05 / (luminance(rgb) + 0.05) < 4.5; i++) rgb = rgb.map((c) => Math.floor(c * 0.95));
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
