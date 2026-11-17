import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Listing, PriceOption } from "@/lib/storefront";
import type { PickApi } from "@/lib/storefrontPlan";
import { kes } from "@/lib/storefrontRequests";

const optionPrice = (option: PriceOption, pick: PickApi): number | null =>
  pick.showPrices && typeof option.price_kes === "number" && option.price_kes > 0 ? option.price_kes : null;

/** One choice on a listing, as a chip: its label and price; pressed when it's in the plan. */
export function OptionChip({ item, option, pick }: { item: Listing; option: PriceOption; pick: PickApi }) {
  const qty = pick.qtyOf(item.id, option.label);
  const on = qty > 0;
  const price = optionPrice(option, pick);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${item.title}, ${option.label}${price ? `, ${kes(price)}` : ""}`}
      onClick={() => pick.onPick(item.id, option.label)}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-transparent text-white" : "border-border bg-background hover:border-foreground/30"}`}
      style={on ? { background: pick.accent } : undefined}
    >
      {on && <Check className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">{option.label}</span>
      {price !== null && <span className={`shrink-0 tabular-nums ${on ? "text-white/90" : "text-muted-foreground"}`}>{kes(price)}</span>}
      {qty > 1 && <span className="shrink-0 tabular-nums">× {qty}</span>}
    </button>
  );
}

/**
 * Many choices in a narrow card: pick one from a list (with its price), Add it, and pick another to add that too.
 * The choices already in the plan are named underneath, so what's picked stays visible.
 */
function OptionSelect({ item, pick }: { item: Listing; pick: PickApi }) {
  const options = item.options ?? [];
  const [choice, setChoice] = useState(options[0]?.label ?? "");
  const on = pick.qtyOf(item.id, choice) > 0;
  const inPlan = options.filter((o) => pick.qtyOf(item.id, o.label) > 0).map((o) => o.label);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <select
          aria-label={`Choice for ${item.title}`}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
        >
          {options.map((o) => {
            const price = optionPrice(o, pick);
            return <option key={o.label} value={o.label}>{o.label}{price ? ` (${kes(price)})` : ""}</option>;
          })}
        </select>
        <Button
          type="button"
          size="sm"
          variant={on ? "default" : "outline"}
          className={`h-8 shrink-0 ${on ? "text-white" : ""}`}
          style={on ? { background: pick.accent } : undefined}
          aria-pressed={on}
          aria-label={`${on ? "Remove" : "Add"} ${item.title}, ${choice}`}
          onClick={() => pick.onPick(item.id, choice)}
        >
          {on ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Added</> : "Add"}
        </Button>
      </div>
      {inPlan.length > 0 && <p className="text-xs text-muted-foreground">In your plan: {inPlan.join(", ")}</p>}
    </div>
  );
}

/**
 * The choices of a listing as chips, or one Add button when it has none. In a narrow place (`compact`), more than two
 * choices become a list to pick from, since chips with prices would stack one per line.
 */
export function PickControl({ item, pick, compact = false }: { item: Listing; pick: PickApi; compact?: boolean }) {
  const options = item.options ?? [];
  if (compact && options.length > 2) return <OptionSelect item={item} pick={pick} />;
  if (options.length) {
    return (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Choices for ${item.title}`}>
        {options.map((o) => <OptionChip key={o.label} item={item} option={o} pick={pick} />)}
      </div>
    );
  }
  const on = pick.isPicked(item.id);
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "default" : "outline"}
      className={`h-8 ${on ? "text-white" : ""}`}
      style={on ? { background: pick.accent } : undefined}
      aria-pressed={on}
      aria-label={`${on ? "Remove" : "Add"} ${item.title}`}
      onClick={() => pick.onToggleItem(item)}
    >
      {on ? <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Added</> : "Add"}
    </Button>
  );
}
