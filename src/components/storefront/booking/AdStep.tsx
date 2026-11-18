import { useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AdPreview from "@/components/storefront/booking/AdPreview";
import type { PreviewKit } from "@/components/storefront/booking/BannerDraft";
import { hasPreview, radioScript, secondsOf } from "@/lib/adPreview";
import { adDue, datesBetween, MADE_FOR_A_FEE, shortDate, spreadSpots, type Material, type PricedLine, type ProductionFees } from "@/lib/storefrontBooking";
import type { KitState, MaterialState } from "@/lib/storefrontCheckout";
import { kes } from "@/lib/storefrontRequests";
import type { Listing } from "@/lib/storefront";

const LABEL: Record<Material, string> = {
  audio: "Audio advert", script: "Words read on air", banner: "Banners", print: "Print ad",
  social: "Social post", article: "Sponsored story", interview: "Interview", brief: "Package brief",
};
const SPECS: Partial<Record<Material, { accept: string; text: string }>> = {
  audio: { accept: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a", text: "MP3 or WAV: 30 seconds for radio, 15 or 30 for streaming." },
  banner: { accept: "image/jpeg,image/png,image/webp,image/gif", text: "JPG, PNG or GIF at 728 × 90, 320 × 50, 300 × 250 and 300 × 600 (whichever you booked)." },
  print: { accept: "application/pdf,image/jpeg,image/png", text: "PDF or JPG at the size you booked, print quality." },
};
const SWATCHES = ["#e11d48", "#1d4ed8", "#047857", "#f59e0b", "#7c3aed", "#111827"];
const words = (s?: string) => (s ?? "").trim().split(/\s+/).filter(Boolean).length;

const useObjectUrls = (files: File[]) => {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
};

const isAudio = (f: File) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a)$/i.test(f.name);
/** The days a line's spots fall on, for the week on air; null for lines that aren't spread over a run. */
const scheduleOf = (p: PricedLine) => (p.kind === "spread" && p.start ? spreadSpots(p.qty, datesBetween(p.start, p.end ?? p.start)) : null);
const fitNote = (seconds: number, target: number) =>
  seconds > target ? ": more than fits, so the studio will cut it down" : seconds < target / 2 ? ": room to say more about the offer" : "";

/** Step 2: the material for each kind of ad booked: a file, "make it for me" from a brand kit, words, or later. */
export default function AdStep({ needed, priced, byId, materials, onMaterials, kit, onKit, fees, accent, houseName }: {
  needed: Material[]; priced: PricedLine[]; byId: Map<string, Listing>; materials: Partial<Record<Material, MaterialState>>;
  onMaterials: (m: Partial<Record<Material, MaterialState>>) => void; kit: KitState; onKit: (k: KitState) => void;
  fees: ProductionFees; accent: string; houseName: string;
}) {
  const start = priced.map((p) => p.start).sort()[0];
  const due = start ? shortDate(adDue(start)) : null;
  const get = (m: Material): MaterialState => materials[m] ?? { mode: MADE_FOR_A_FEE.includes(m) ? "later" : "later", files: [] };
  const set = (m: Material, patch: Partial<MaterialState>) => onMaterials({ ...materials, [m]: { ...get(m), ...patch } });
  const wordsFor = (m: Material, patch: Partial<MaterialState>) => {
    const next = { ...get(m), ...patch };
    const given = Boolean(next.script?.trim() || next.topic?.trim() || next.notes?.trim() || next.files.length);
    onMaterials({ ...materials, [m]: { ...next, mode: given ? "have" : "later" } });
  };
  const usesKit = needed.some((m) => get(m).mode === "make") || needed.some((m) => ["social", "article", "brief"].includes(m));

  const logoUrl = useObjectUrls(useMemo(() => (kit.logo ? [kit.logo] : []), [kit.logo]))[0] ?? null;
  const photoUrls = useObjectUrls(kit.photos);
  const previewKit: PreviewKit = { logoUrl, photoUrls, headline: kit.headline, message: kit.message, cta: kit.cta, colour: kit.colour };
  const bannerFile = get("banner").mode === "have" ? get("banner").files.find((f) => f.type.startsWith("image/")) : undefined;
  const printFile = get("print").mode === "have" ? get("print").files.find((f) => f.type.startsWith("image/")) : undefined;
  const [bannerUrl, printUrl] = useObjectUrls(useMemo(() => [bannerFile, printFile].filter((f): f is File => Boolean(f)), [bannerFile, printFile]));
  const audioFile = get("audio").mode === "have" ? get("audio").files.find(isAudio) : undefined;
  const [audioUrl] = useObjectUrls(useMemo(() => (audioFile ? [audioFile] : []), [audioFile]));
  const previews = priced.filter((p) => hasPreview(p.adFormat));
  const audioLine = priced.find((p) => p.materials.includes("audio"));
  const script = needed.includes("audio") && get("audio").mode === "make" ? radioScript(kit, secondsOf(audioLine?.option)) : null;

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload ads you already have, or let {houseName} make them from your logo, photos and a few words.
        {due ? ` Anything you send later is due by ${due}.` : ""}
      </p>

      {needed.map((m) => {
        const s = get(m);
        if (m === "audio" || m === "banner" || m === "print") {
          const fee = fees[m];
          return (
            <fieldset key={m} aria-label={LABEL[m]} className="rounded-xl border border-border bg-card p-4">
              <legend className="sr-only">{LABEL[m]}</legend>
              <h3 className="text-[15px] font-semibold">{LABEL[m]}</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {([
                  ["have", "I have it"],
                  ["make", `Make it for me${fee ? ` · ${kes(fee)}` : ""}`],
                  ["later", "Send it later"],
                ] as const).map(([mode, label]) => (
                  <label key={mode} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${s.mode === mode ? "font-medium" : "text-muted-foreground"}`}
                    style={s.mode === mode ? { borderColor: accent } : undefined}>
                    <input type="radio" name={`mode-${m}`} checked={s.mode === mode} onChange={() => set(m, { mode })} className="accent-current" style={{ accentColor: accent }} />
                    {label}
                  </label>
                ))}
              </div>
              {s.mode === "have" && (
                <div className="mt-3 space-y-1.5">
                  <Input type="file" multiple accept={SPECS[m]?.accept} aria-label={`Files: ${LABEL[m]}`}
                    onChange={(e) => set(m, { files: Array.from(e.target.files ?? []).slice(0, 4) })} />
                  <p className="text-xs text-muted-foreground">{SPECS[m]?.text}</p>
                  {m === "audio" && audioUrl && <audio controls src={audioUrl} aria-label={`Listen to ${audioFile?.name ?? "your advert"}`} className="mt-1 w-full" />}
                </div>
              )}
              {s.mode === "make" && <p className="mt-3 text-sm text-muted-foreground">{houseName}'s studio makes it from your brand kit below and sends it to you to approve before it runs.</p>}
              {s.mode === "later" && due && <p className="mt-3 text-sm text-muted-foreground">Add it on your booking page by {due}.</p>}
            </fieldset>
          );
        }
        return (
          <fieldset key={m} aria-label={LABEL[m]} className="rounded-xl border border-border bg-card p-4">
            <legend className="sr-only">{LABEL[m]}</legend>
            <h3 className="text-[15px] font-semibold">{LABEL[m]}</h3>
            {m === "script" && (
              <div className="mt-2 space-y-1.5">
                <Label htmlFor="ad-script">What should be read on air?</Label>
                <Textarea id="ad-script" rows={4} value={s.script ?? ""} onChange={(e) => wordsFor(m, { script: e.target.value })}
                  placeholder="Your message, the offer and how to reach you." />
                <p className="text-xs text-muted-foreground">{words(s.script)} words · about 75 words fill 30 seconds. The presenters may tidy it.</p>
              </div>
            )}
            {m === "interview" && (
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="iv-topic">Topic</Label><Input id="iv-topic" value={s.topic ?? ""} onChange={(e) => wordsFor(m, { topic: e.target.value })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="iv-guest">Who comes on air</Label><Input id="iv-guest" value={s.guest ?? ""} onChange={(e) => wordsFor(m, { guest: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="iv-phone">Their phone</Label><Input id="iv-phone" type="tel" value={s.guest_phone ?? ""} onChange={(e) => wordsFor(m, { guest_phone: e.target.value })} /></div>
              </div>
            )}
            {(m === "social" || m === "article" || m === "brief") && (
              <div className="mt-2 space-y-2">
                <Label htmlFor={`notes-${m}`}>{m === "brief" ? "What should the package say and show?" : "What should it say?"}</Label>
                <Textarea id={`notes-${m}`} rows={3} value={s.notes ?? ""} onChange={(e) => wordsFor(m, { notes: e.target.value })}
                  placeholder="Key messages, offers, links and anything to avoid." />
                {m !== "brief" && (
                  <Input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" aria-label={`Photos or video: ${LABEL[m]}`}
                    onChange={(e) => wordsFor(m, { files: Array.from(e.target.files ?? []).slice(0, 4) })} />
                )}
                <p className="text-xs text-muted-foreground">{houseName}'s team writes it and shares it with you before it goes out.</p>
              </div>
            )}
          </fieldset>
        );
      })}

      {usesKit && (
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="kit-title">
          <h3 id="kit-title" className="text-[15px] font-semibold">Your brand kit</h3>
          <p className="text-sm text-muted-foreground">Rough drafts appear below as you go. {houseName}'s studio finishes the real thing.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="kit-logo">Logo</Label><Input id="kit-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onKit({ ...kit, logo: e.target.files?.[0] ?? null })} /></div>
            <div className="space-y-1.5"><Label htmlFor="kit-photos">Up to 3 photos</Label><Input id="kit-photos" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => onKit({ ...kit, photos: Array.from(e.target.files ?? []).slice(0, 3) })} /></div>
            <div className="space-y-1.5"><Label htmlFor="kit-headline">Headline</Label><Input id="kit-headline" maxLength={60} value={kit.headline} onChange={(e) => onKit({ ...kit, headline: e.target.value })} placeholder="Fresh bread every morning" /></div>
            <div className="space-y-1.5"><Label htmlFor="kit-cta">Call to action</Label><Input id="kit-cta" maxLength={40} value={kit.cta} onChange={(e) => onKit({ ...kit, cta: e.target.value })} placeholder="Call 0712 345 678" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="kit-message">One line about the offer</Label><Input id="kit-message" maxLength={120} value={kit.message} onChange={(e) => onKit({ ...kit, message: e.target.value })} placeholder="Delivered across Nairobi before 7 AM" /></div>
            <div className="sm:col-span-2">
              <span className="text-sm font-medium">Brand colour</span>
              <div className="mt-1.5 flex gap-2" role="group" aria-label="Brand colour">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={kit.colour === c} onClick={() => onKit({ ...kit, colour: c })}
                    className="h-8 w-8 rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ background: c, borderColor: kit.colour === c ? "hsl(var(--foreground))" : "transparent" }} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {script && (
        <section aria-labelledby="script-title" className="rounded-xl border border-border bg-card p-4">
          <h3 id="script-title" className="text-[15px] font-semibold">Rough script</h3>
          {script.lines.length ? (
            <>
              <div className="mt-2 space-y-1 text-sm">
                {script.lines.map((l, i) => (
                  <p key={i} className={l.startsWith("[") ? "text-xs text-muted-foreground" : "font-medium"}>{l}</p>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                About {script.seconds} seconds of {script.target}{fitNote(script.seconds, script.target)}. {houseName}'s studio writes and records the real advert and sends it to you to approve.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Add a headline, the offer and a call to action above to see a rough script.</p>
          )}
        </section>
      )}

      {previews.length > 0 && (
        <section aria-labelledby="drafts-title">
          <h3 id="drafts-title" className="text-[15px] font-semibold">See it in place</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {previews.map((p, i) => {
              const item = byId.get(p.id);
              if (!item) return null;
              const fileUrl = p.adFormat?.startsWith("print") ? printUrl : p.adFormat?.startsWith("web_") ? bannerUrl : null;
              return (
                <figure key={`${p.id}-${p.option}-${i}`} className="space-y-1.5">
                  <AdPreview item={item} option={p.option} kit={previewKit} fileUrl={fileUrl ?? null} schedule={scheduleOf(p)} accent={accent} />
                  <figcaption className="text-xs text-muted-foreground">{item.title}{p.option ? `, ${p.option}` : ""}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
