import { Check, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ListingCover from "@/components/storefront/ListingCover";
import { combinedReach, fmtCompact, KIND_LABEL, type Listing, type PlanMatch } from "@/lib/storefront";

const EXAMPLES = [
  "A festive mobile-money offer for young earners in Nairobi and Mombasa, December, fun and loud.",
  "A new cooking sauce for busy mums 25 to 40. Warm, funny food content in Swahili and Sheng.",
  "A back-to-school banking offer for parents in January. Trusted voices, morning radio, upcountry reach.",
];

/**
 * The storefront's front door: the buyer describes what they're launching and the planner builds a plan from the
 * house's own listings, shown right here rather than in a pop-up. The numbers on the right say what's on offer.
 */
export function BriefStudio({ accent, houseName, brief, setBrief, running, onRun, stats }: {
  accent: string; houseName: string; brief: string; setBrief: (v: string) => void; running: boolean; onRun: () => void;
  stats: { following: number; channels: number; talent: number; formats: number };
}) {
  const tint = `color-mix(in srgb, ${accent} 10%, transparent)`;
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card" aria-labelledby="brief-studio-title">
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(900px 360px at 0% 0%, ${tint}, transparent 70%)` }} />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.45fr_1fr]">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest" style={{ background: tint, color: accent }}>
            <Wand2 className="h-3.5 w-3.5" aria-hidden /> Plan with AI
          </span>
          <h2 id="brief-studio-title" className="mt-3 font-display text-3xl leading-tight sm:text-4xl">Tell us what you're launching.</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Say what it is, who it's for and what you need. We'll pick the channels, voices and on-air slots from {houseName} that fit,
            and you can send the whole plan as one request.
          </p>
          <label htmlFor="brief-studio-text" className="sr-only">Your brief</label>
          <Textarea
            id="brief-studio-text"
            rows={4}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun(); }}
            placeholder="e.g. Launching a new energy drink for young men in Nairobi in December. Football, music, a bit cheeky."
            className="mt-4 resize-none bg-background text-[15px]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setBrief(ex)}
                className="max-w-full truncate rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                {ex.split(",")[0]}
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" onClick={onRun} disabled={running} className="text-white shadow-sm" style={{ background: accent }}>
              {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Building your plan…</> : <><Sparkles className="mr-2 h-4 w-4" aria-hidden /> Build my plan</>}
            </Button>
            <span className="text-xs text-muted-foreground">Takes about ten seconds. Nothing is booked until you send it.</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 self-start">
          {[
            { label: "Social following", value: fmtCompact(stats.following) },
            { label: "Social accounts", value: String(stats.channels) },
            { label: "On-air voices", value: String(stats.talent) },
            { label: "On-air formats and packages", value: String(stats.formats) },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-background/70 p-4">
              <dd className="font-display text-3xl tabular-nums leading-none">{s.value}</dd>
              <dt className="mt-2 text-xs text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const PICK_WORDS: Record<string, [string, string]> = {
  owned_account: ["social account", "social accounts"],
  influencer: ["presenter", "presenters"],
  ad_slot: ["on-air format", "on-air formats"],
  bundle: ["package", "packages"],
};

/** The planner's picks, inline under the studio: each with its reason, one tap to add, or all at once. */
export function PlanResults({ matches, items, accent, cart, onToggle, onOpen, onAddAll, onClear }: {
  matches: PlanMatch[]; items: Listing[]; accent: string; cart: string[];
  onToggle: (id: string) => void; onOpen: (item: Listing) => void; onAddAll: () => void; onClear: () => void;
}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const picked = matches.map((m) => ({ m, item: byId.get(m.item_id) })).filter((x): x is { m: PlanMatch; item: Listing } => Boolean(x.item));
  if (!picked.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nothing here fits that brief closely. Try saying more about the audience, or browse everything below.
      </div>
    );
  }
  const reach = combinedReach(picked.map((p) => p.item));
  const kinds = Object.entries(picked.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.item.kind]: (acc[p.item.kind] ?? 0) + 1 }), {}))
    .map(([k, n]) => `${n} ${(PICK_WORDS[k] ?? [KIND_LABEL[k] ?? k, KIND_LABEL[k] ?? k])[n === 1 ? 0 : 1]}`).join(", ");
  const allIn = picked.every((p) => cart.includes(p.item.id));
  return (
    <section className="mt-6" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Your plan</div>
          <h3 id="plan-title" className="font-display text-2xl">{picked.length} picks for this brief</h3>
          <p className="text-sm text-muted-foreground">{kinds}{reach > 0 ? ` · about ${fmtCompact(reach)} combined reach` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}><X className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Clear plan</Button>
          <Button type="button" size="sm" className="text-white" style={{ background: accent }} onClick={onAddAll} disabled={allIn}>
            {allIn ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> All in your request</> : `Add all ${picked.length} to my request`}
          </Button>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picked.map(({ m, item }) => {
          const inCart = cart.includes(item.id);
          return (
            <li key={item.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
              <button type="button" onClick={() => onOpen(item)} className="shrink-0 overflow-hidden rounded-xl" aria-label={`${item.title}: details`}>
                <ListingCover item={item} className="h-20 w-20" badge={false} />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => onOpen(item)} className="min-w-0 text-left">
                    <div className="truncate text-sm font-semibold hover:underline">{item.title}</div>
                  </button>
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>{m.score}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{m.reason}</p>
                <div className="mt-auto pt-2">
                  <Button type="button" size="sm" variant={inCart ? "default" : "outline"} className={`h-7 px-2.5 text-xs ${inCart ? "text-white" : ""}`} style={inCart ? { background: accent } : undefined} aria-pressed={inCart} onClick={() => onToggle(item.id)}>
                    {inCart ? <><Check className="mr-1 h-3 w-3" aria-hidden /> Added</> : "Add"}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
