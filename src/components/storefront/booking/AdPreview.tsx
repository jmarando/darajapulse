import { Check, Pause, Radio } from "lucide-react";
import BannerDraft, { hasKit, type PreviewKit } from "@/components/storefront/booking/BannerDraft";
import { BANNER_SIZES, domainOf, isBannerFormat, printBox, propertyName, secondsOf, type BannerFormat } from "@/lib/adPreview";
import { fmtCompact, platformLabel, whatYouGet, type Listing } from "@/lib/storefront";

export type { PreviewKit } from "@/components/storefront/booking/BannerDraft";

type Props = {
  item: Listing; option?: string | null; kit?: PreviewKit | null; fileUrl?: string | null;
  device?: "computer" | "phone"; schedule?: { date: string; count: number }[] | null; accent: string;
};

/**
 * "See it in place": a sketch of where the buyer's ad runs (a news page, a newspaper page, the week on air, the
 * streaming app, a post on the account) holding their file, a draft from their kit, or the slot's size. Plain shapes in
 * the house's colour; never a copy of the house's own sites.
 */
export default function AdPreview({ item, option = null, kit = null, fileUrl = null, device = "computer", schedule = null, accent }: Props) {
  const format = item.ad_format ?? "";
  if (isBannerFormat(format)) return <WebPage item={item} format={format} device={device} kit={kit} fileUrl={fileUrl} accent={accent} />;
  switch (format) {
    case "web_takeover": return <Takeover item={item} kit={kit} fileUrl={fileUrl} accent={accent} />;
    case "web_article": return <Article item={item} kit={kit} fileUrl={fileUrl} accent={accent} />;
    case "print_display": return <PrintPage item={item} option={option} kit={kit} fileUrl={fileUrl} accent={accent} />;
    case "radio_spot": case "radio_mention": case "radio_promotion": case "radio_interview": case "radio_classified":
      return <OnAir item={item} option={option} schedule={schedule} accent={accent} />;
    case "audio_preroll": case "audio_hostread": return <Player item={item} option={option} kit={kit} accent={accent} />;
    case "social_post": return <SocialPost item={item} kit={kit} fileUrl={fileUrl} accent={accent} />;
    case "package": return <PackageParts item={item} accent={accent} />;
    default: return null;
  }
}

/** The ad in its slot: the buyer's file, a draft from their kit, or the slot's size. */
function Creative({ w, h, kit, fileUrl, accent }: { w: number; h: number; kit: PreviewKit | null; fileUrl: string | null; accent: string }) {
  if (fileUrl) return <img src={fileUrl} alt="Your ad" className="h-full w-full object-cover" />;
  if (hasKit(kit)) return <BannerDraft width={w} height={h} kit={kit} accent={accent} />;
  return (
    <div className="flex h-full w-full items-center justify-center border border-dashed text-center text-[10px] font-medium leading-tight"
      style={{ borderColor: accent, color: accent, background: `color-mix(in srgb, ${accent} 8%, transparent)` }}>
      Your ad, {w} × {h}
    </div>
  );
}

const Slot = ({ w, h, className = "", ...rest }: { w: number; h: number; kit: PreviewKit | null; fileUrl: string | null; accent: string; className?: string }) => (
  <div className={`overflow-hidden rounded-sm ${className}`} style={{ aspectRatio: `${w} / ${h}` }}><Creative w={w} h={h} {...rest} /></div>
);

/** Grey text lines, for the parts of a page that aren't the ad. */
const Lines = ({ n, widths = ["100%", "92%", "96%", "70%"] }: { n: number; widths?: string[] }) => (
  <div className="space-y-1">{Array.from({ length: n }, (_, i) => <div key={i} className="h-1.5 rounded-full bg-muted-foreground/15" style={{ width: widths[i % widths.length] }} />)}</div>
);

function Computer({ site, children }: { site: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-2.5 py-1.5">
        {[0, 1, 2].map((n) => <span key={n} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />)}
        <span className="ml-2 truncate rounded bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{domainOf(site)}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[220px] rounded-[26px] border-[6px] border-foreground/80 bg-background p-2 shadow-sm">
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-foreground/20" />
      {children}
    </div>
  );
}

const Masthead = ({ site, accent }: { site: string; accent: string }) => (
  <div className="mb-2 flex items-center justify-between border-b border-border pb-1.5">
    <span className="text-sm font-black tracking-tight" style={{ color: accent }}>{site}</span>
    <span className="flex gap-1">{[0, 1, 2, 3].map((n) => <span key={n} className="h-1 w-5 rounded-full bg-muted-foreground/20" />)}</span>
  </div>
);

function WebPage({ item, format, device, kit, fileUrl, accent }: { item: Listing; format: BannerFormat; device: "computer" | "phone"; kit: PreviewKit | null; fileUrl: string | null; accent: string }) {
  const site = propertyName(item);
  const size = BANNER_SIZES[format];
  const slot = { kit, fileUrl, accent };
  if (device === "phone") {
    const phone = size.phone;
    return (
      <Phone>
        <Masthead site={site} accent={accent} />
        {format === "web_leaderboard" && phone && <Slot w={phone[0]} h={phone[1]} className="mb-2" {...slot} />}
        <div className="mb-1.5 h-2.5 w-11/12 rounded bg-foreground/70" />
        <div className="mb-2 aspect-video rounded bg-muted" />
        <Lines n={4} />
        {format === "web_mpu" && phone && <Slot w={phone[0]} h={phone[1]} className="my-2" {...slot} />}
        {format === "web_halfpage" && <p className="my-2 rounded bg-muted p-2 text-center text-[10px] text-muted-foreground">The half page shows on computers only.</p>}
        <Lines n={3} />
      </Phone>
    );
  }
  const [w, h] = size.computer;
  return (
    <Computer site={site}>
      <Masthead site={site} accent={accent} />
      {format === "web_leaderboard" && <Slot w={w} h={h} className="mx-auto mb-2.5 w-full" {...slot} />}
      <div className="grid grid-cols-[1fr_32%] gap-3">
        <div>
          <div className="mb-1.5 h-3 w-10/12 rounded bg-foreground/70" />
          <div className="mb-2 aspect-[16/8] rounded bg-muted" />
          <Lines n={6} />
        </div>
        <div className="space-y-2">
          {format === "web_leaderboard" ? <><div className="aspect-[6/5] rounded bg-muted" /><Lines n={3} /></> : <Slot w={w} h={h} className="w-full" {...slot} />}
        </div>
      </div>
    </Computer>
  );
}

function Takeover({ item, kit, fileUrl, accent }: { item: Listing; kit: PreviewKit | null; fileUrl: string | null; accent: string }) {
  const site = propertyName(item);
  const slot = { kit, fileUrl, accent };
  return (
    <div className="space-y-1.5">
      <Computer site={site}>
        <Masthead site={site} accent={accent} />
        <Slot w={728} h={90} className="mb-2.5 w-full" {...slot} />
        <div className="grid grid-cols-[1fr_32%] gap-3">
          <div><div className="mb-2 aspect-[16/8] rounded bg-muted" /><Lines n={5} /></div>
          <div className="space-y-2"><Slot w={300} h={250} className="w-full" {...slot} /><Slot w={300} h={250} className="w-full" {...slot} /></div>
        </div>
      </Computer>
      <p className="text-xs text-muted-foreground">Every ad place on {site}'s homepage is yours for the day.</p>
    </div>
  );
}

function Article({ item, kit, fileUrl, accent }: { item: Listing; kit: PreviewKit | null; fileUrl: string | null; accent: string }) {
  const site = propertyName(item);
  const photo = fileUrl ?? kit?.photoUrls?.[0] ?? null;
  return (
    <Computer site={site}>
      <Masthead site={site} accent={accent} />
      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" style={{ background: accent }}>Sponsored</span>
      <p className="mt-1.5 text-sm font-bold leading-snug">{kit?.headline || "Your story's headline"}</p>
      {photo ? <img src={photo} alt="" className="my-2 aspect-[16/8] w-full rounded object-cover" /> : <div className="my-2 aspect-[16/8] rounded bg-muted" />}
      <Lines n={6} />
      <p className="mt-2 text-[11px] text-muted-foreground">Written with {site}'s team and shared on its social accounts.</p>
    </Computer>
  );
}

function PrintPage({ item, option, kit, fileUrl, accent }: { item: Listing; option: string | null; kit: PreviewKit | null; fileUrl: string | null; accent: string }) {
  const box = printBox(option);
  const site = propertyName(item);
  return (
    <div className="mx-auto max-w-[280px]">
      <div className="relative overflow-hidden rounded border border-border bg-background p-3 shadow-sm" style={{ aspectRatio: "3 / 4" }}>
        <div className="border-b-2 border-foreground/80 pb-1 text-center font-serif text-lg font-black tracking-tight">{site}</div>
        <div className="mt-2 grid grid-cols-6 gap-1.5">{Array.from({ length: 6 }, (_, i) => <Lines key={i} n={14} widths={["100%", "90%", "100%", "80%"]} />)}</div>
        <div className="absolute overflow-hidden rounded-sm bg-background" style={{
          right: "5%", bottom: "4%", width: `${(box.cols / 6) * 90}%`, height: `${(box.rows / 10) * 80}%`,
          boxShadow: `0 0 0 2px ${accent}`,
        }}>
          <Creative w={box.cols * 100} h={box.rows * 60} kit={kit} fileUrl={fileUrl} accent={accent} />
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs text-muted-foreground"><span className="font-medium text-foreground">{box.label}</span> in {site}</p>
    </div>
  );
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (iso: string) => DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

function OnAir({ item, option, schedule, accent }: { item: Listing; option: string | null; schedule: { date: string; count: number }[] | null; accent: string }) {
  const station = propertyName(item);
  const word = item.ad_format === "radio_mention" ? "mention" : "spot";
  const reach = Number(item.follower_count) || 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: accent }}><Radio className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{station}</div>
          <div className="text-xs text-muted-foreground">{option || "On air"}{reach ? ` · ${fmtCompact(reach)} listeners a week` : ""}</div>
        </div>
      </div>
      {schedule?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {schedule.slice(0, 14).map((d) => (
            <div key={d.date} className="min-w-[64px] rounded-lg border border-border px-2 py-1.5 text-center">
              <div className="text-[10px] text-muted-foreground">{dayName(d.date)} {Number(d.date.slice(8, 10))}</div>
              <div className="text-xs font-semibold" style={{ color: accent }}>{d.count === 1 ? `1 ${word}` : `${d.count} ${word}s`}</div>
            </div>
          ))}
          {schedule.length > 14 && <div className="self-center text-xs text-muted-foreground">and {schedule.length - 14} more days</div>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {item.ad_format === "radio_mention" ? "The presenters read your message live" : "Your advert plays"}{option ? ` in the ${option} band` : ""}, on the days you pick.
        </p>
      )}
    </div>
  );
}

function Player({ item, option, kit, accent }: { item: Listing; option: string | null; kit: PreviewKit | null; accent: string }) {
  const show = item.title.includes(": ") ? item.title.slice(item.title.indexOf(": ") + 2) : item.title;
  const seconds = secondsOf(option);
  const art = kit?.logoUrl ?? kit?.photoUrls?.[0] ?? null;
  const hostRead = item.ad_format === "audio_hostread" || /read by the host/i.test(option ?? "");
  return (
    <Phone>
      <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Songa Play</div>
      <div className="mx-auto my-2 flex aspect-square w-4/5 items-center justify-center overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, ${accent}, #1c1714)` }}>
        {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <span className="px-3 text-center text-xs font-semibold text-white">{show}</span>}
      </div>
      <div className="truncate text-center text-xs font-semibold">{show}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="rounded px-1 text-[9px] font-semibold text-white" style={{ background: accent }}>Ad · 0:{String(seconds).padStart(2, "0")}</span>
        <div className="h-1 flex-1 rounded-full bg-muted"><div className="h-1 w-1/4 rounded-full" style={{ background: accent }} /></div>
      </div>
      <div className="mt-2 flex justify-center"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background"><Pause className="h-3.5 w-3.5" aria-hidden /></span></div>
      <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
        {hostRead ? "The host reads your message in the show." : `Your ${seconds}-second ad plays before the show starts.`}
      </p>
    </Phone>
  );
}

function SocialPost({ item, kit, fileUrl, accent }: { item: Listing; kit: PreviewKit | null; fileUrl: string | null; accent: string }) {
  const account = propertyName(item);
  const photo = fileUrl ?? kit?.photoUrls?.[0] ?? null;
  const caption = [kit?.headline, kit?.message].filter(Boolean).join(" ");
  return (
    <Phone>
      <div className="mb-2 flex items-center gap-1.5">
        {item.cover_url
          ? <img src={item.cover_url} alt="" className="h-6 w-6 rounded-full object-cover" />
          : <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: accent }}>{account.charAt(0)}</span>}
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[11px] font-semibold">{account}</div>
          <div className="text-[9px] text-muted-foreground">{platformLabel(item.platform)} · Sponsored</div>
        </div>
      </div>
      {photo ? <img src={photo} alt="" className="aspect-square w-full rounded object-cover" /> : (
        <div className="flex aspect-square w-full items-center justify-center rounded text-[10px] text-muted-foreground" style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)` }}>Your photo or video</div>
      )}
      <p className="mt-1.5 text-[10px] leading-snug"><span className="font-semibold">{account}</span> {caption || "Your message, written with the station's team."}</p>
    </Phone>
  );
}

function PackageParts({ item, accent }: { item: Listing; accent: string }) {
  const { lines } = whatYouGet({ ...item, deliverable_type: null });
  return (
    <ul className="space-y-1.5 rounded-xl border border-border bg-card p-3">
      {lines.slice(0, 6).map((l) => (
        <li key={l} className="flex gap-2 text-xs leading-snug"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent }} aria-hidden /><span>{l}</span></li>
      ))}
    </ul>
  );
}
