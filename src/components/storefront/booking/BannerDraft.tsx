/** What the buyer gives for "Make it for me": a logo, up to 3 photos and a few words. URLs are local previews of their files. */
export type PreviewKit = {
  logoUrl?: string | null; photoUrls?: string[]; headline?: string | null; message?: string | null; cta?: string | null; colour?: string | null;
};

export const hasKit = (kit: PreviewKit | null | undefined): kit is PreviewKit =>
  Boolean(kit && (kit.headline || kit.message || kit.cta || kit.logoUrl || kit.photoUrls?.length));

const FONT = "Helvetica, Arial, sans-serif";
/** A font size that fits `text` in `room` pixels, at most `max`. */
const fit = (text: string, room: number, max: number) => Math.max(8, Math.min(max, room / (Math.max(text.length, 6) * 0.56)));

/** Splits words into at most two lines of roughly even length. */
function twoLines(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return [text];
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length, b = words.slice(i).join(" ").length;
    if (Math.abs(a - b) < Math.abs(words.slice(0, best).join(" ").length - words.slice(best).join(" ").length)) best = i;
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * A rough draft of the buyer's ad at a given size, drawn from their kit: photo, headline, call to action and logo in
 * their colour. Drawn as SVG at the ad's real size, so it scales to any slot it's shown in.
 */
export default function BannerDraft({ width, height, kit, accent }: { width: number; height: number; kit: PreviewKit; accent: string }) {
  const bg = kit.colour || accent;
  const photo = kit.photoUrls?.[0] ?? null;
  const headline = (kit.headline || "Your headline").trim();
  const cta = (kit.cta || "").trim();
  const wide = width / height >= 3;
  const pad = Math.round(Math.min(width, height) * 0.12);

  if (wide) {
    const photoW = photo ? Math.round(height * 1.4) : 0;
    const btnH = Math.round(height * 0.5);
    const btnW = cta ? Math.min(Math.round(width * 0.28), Math.round(cta.length * btnH * 0.34 + btnH)) : 0;
    const room = width - photoW - pad * 2 - (cta ? btnW + pad : 0) - (kit.logoUrl ? height * 0.7 : 0);
    const fs = fit(headline, room, height * 0.36);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label={`Draft ad, ${width} × ${height}`}>
        <rect width={width} height={height} fill={bg} />
        {photo && <image href={photo} x={0} y={0} width={photoW} height={height} preserveAspectRatio="xMidYMid slice" />}
        {kit.logoUrl && <image href={kit.logoUrl} x={photoW + pad * 0.6} y={height * 0.2} width={height * 0.6} height={height * 0.6} preserveAspectRatio="xMidYMid meet" />}
        <text x={photoW + pad + (kit.logoUrl ? height * 0.7 : 0)} y={height / 2} dominantBaseline="middle" fill="#ffffff" fontWeight={700} fontSize={fs} fontFamily={FONT}>{headline}</text>
        {cta && (
          <g>
            <rect x={width - btnW - pad} y={(height - btnH) / 2} width={btnW} height={btnH} rx={btnH / 2} fill="#ffffff" />
            <text x={width - pad - btnW / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fit(cta, btnW - btnH * 0.5, btnH * 0.42)} fill={bg} fontWeight={700} fontFamily={FONT}>{cta}</text>
          </g>
        )}
      </svg>
    );
  }

  const photoH = photo ? Math.round(height * (height > width ? 0.5 : 0.45)) : 0;
  const lines = twoLines(headline);
  const fs = fit(lines.reduce((a, b) => (b.length > a.length ? b : a), ""), width - pad * 2, width * 0.11);
  const message = (kit.message || "").trim();
  const ms = fit(message, (width - pad * 2) * 1.8, fs * 0.55);
  const btnH = Math.round(Math.min(height * 0.12, width * 0.14));
  const btnW = Math.round(width - pad * 2);
  const top = photoH + pad + fs;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label={`Draft ad, ${width} × ${height}`}>
      <rect width={width} height={height} fill={bg} />
      {photo && <image href={photo} x={0} y={0} width={width} height={photoH} preserveAspectRatio="xMidYMid slice" />}
      {kit.logoUrl && <image href={kit.logoUrl} x={pad * 0.6} y={pad * 0.6} width={width * 0.22} height={width * 0.22} preserveAspectRatio="xMidYMid meet" />}
      {lines.map((l, n) => (
        <text key={n} x={pad} y={top + n * fs * 1.15} fill="#ffffff" fontWeight={700} fontSize={fs} fontFamily={FONT}>{l}</text>
      ))}
      {message && <text x={pad} y={top + lines.length * fs * 1.15 + ms * 0.4} fill="#ffffff" fillOpacity={0.9} fontSize={ms} fontFamily={FONT}>{message}</text>}
      {cta && (
        <g>
          <rect x={pad} y={height - pad - btnH} width={btnW} height={btnH} rx={btnH / 2} fill="#ffffff" />
          <text x={width / 2} y={height - pad - btnH / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fit(cta, btnW - btnH, btnH * 0.45)} fill={bg} fontWeight={700} fontFamily={FONT}>{cta}</text>
        </g>
      )}
    </svg>
  );
}
