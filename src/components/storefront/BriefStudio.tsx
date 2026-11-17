import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ListingCover from "@/components/storefront/ListingCover";
import { combinedReach, fmtCompact, KIND_LABEL, type Listing, type PlanMatch } from "@/lib/storefront";
import type { PickApi } from "@/lib/storefrontPlan";

const EXAMPLES = [
  "A festive mobile-money offer for young earners in Nairobi and Mombasa, December, fun and loud.",
  "A new cooking sauce for busy mums 25 to 40. Warm, funny food content in Swahili and Sheng.",
  "A back-to-school banking offer for parents in January. Trusted voices, morning radio, upcountry reach.",
];

/**
 * For buyers who don't know what to pick: they describe what they're launching and the planner suggests listings
 * from everything the house sells, shown right under it rather than in a pop-up.
 */
export function BriefStudio({ accent, houseName, brief, setBrief, running, onRun }: {
  accent: string; houseName: string; brief: string; setBrief: (v: string) => void; running: boolean; onRun: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="brief-studio-title">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-8">
        <div>
          <h2 id="brief-studio-title" className="font-display text-xl font-semibold leading-tight">Not sure what to pick?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Say what you're launching, who it's for and when. We'll suggest a plan from everything {houseName} sells, and you can add
            it in one go.
          </p>
        </div>
        <div className="min-w-0">
          <label htmlFor="brief-studio-text" className="sr-only">Your brief</label>
          <Textarea
            id="brief-studio-text"
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun(); }}
            placeholder="e.g. Launching a new energy drink for young men in Nairobi in December. Football, music, a bit cheeky."
            className="resize-none bg-background text-[15px]"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setBrief(ex)}
                className="max-w-full truncate rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                {ex.split(",")[0]}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onRun} disabled={running} className="text-white shadow-sm" style={{ background: accent }}>
              {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Suggesting a plan…</> : <><Sparkles className="mr-2 h-4 w-4" aria-hidden /> Suggest a plan</>}
            </Button>
            <span className="text-xs text-muted-foreground">Takes about ten seconds. Nothing is booked until you send a request.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const PICK_WORDS: Record<string, [string, string]> = {
  owned_account: ["social account", "social accounts"],
  influencer: ["presenter", "presenters"],
  ad_slot: ["ad slot", "ad slots"],
  bundle: ["package", "packages"],
};

/** The planner's suggestions, inline under the studio: each with its reason, one tap to add, or all at once. */
export function PlanResults({ matches, items, pick, onAddAll, onClear }: {
  matches: PlanMatch[]; items: Listing[]; pick: PickApi; onAddAll: () => void; onClear: () => void;
}) {
  const { accent } = pick;
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
  const allIn = picked.every((p) => pick.isPicked(p.item.id));
  return (
    <section className="mt-6" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="plan-title" className="font-display text-2xl">Suggested for your brief</h3>
          <p className="text-sm text-muted-foreground">{kinds}{reach > 0 ? `, about ${fmtCompact(reach)} combined reach` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}><X className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Clear suggestions</Button>
          <Button type="button" size="sm" className="text-white" style={{ background: accent }} onClick={onAddAll} disabled={allIn}>
            {allIn ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> All in your plan</> : `Add all ${picked.length} to my plan`}
          </Button>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picked.map(({ m, item }) => {
          const inPlan = pick.isPicked(item.id);
          return (
            <li key={item.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
              <button type="button" onClick={() => pick.onOpen(item)} className="shrink-0 overflow-hidden rounded-xl" aria-label={`${item.title}: details`}>
                <ListingCover item={item} className="h-20 w-20" badge={false} />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => pick.onOpen(item)} className="min-w-0 text-left">
                    <div className="truncate text-sm font-semibold hover:underline">{item.title}</div>
                  </button>
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>{m.score}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{m.reason}</p>
                <div className="mt-auto pt-2">
                  <Button type="button" size="sm" variant={inPlan ? "default" : "outline"} className={`h-7 px-2.5 text-xs ${inPlan ? "text-white" : ""}`} style={inPlan ? { background: accent } : undefined} aria-pressed={inPlan} onClick={() => pick.onToggleItem(item)}>
                    {inPlan ? <><Check className="mr-1 h-3 w-3" aria-hidden /> Added</> : "Add"}
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
