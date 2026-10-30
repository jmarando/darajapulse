import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { detailsState, isDetailsComplete, type DetailsLike, type DetailsState } from "../../../supabase/functions/_shared/payout-rules";

const LABEL: Record<DetailsState, string> = { missing: "Details missing", creator_confirmed: "Creator confirmed", staff_entered: "Staff entered" };
const TONE: Record<DetailsState, string> = {
  missing: "text-highlight border-highlight/40",
  creator_confirmed: "text-success border-success/40",
  staff_entered: "text-muted-foreground",
};

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

/** Where a creator's payout details stand, with a way to add or correct them. */
export default function PayoutDetailsCell({ details, onEdit }: { details: DetailsLike | undefined; onEdit: () => void }) {
  const state = detailsState(details);
  return (
    <div className="space-y-1">
      <Badge variant="outline" className={TONE[state]}>{LABEL[state]}</Badge>
      {details && !isDetailsComplete(details) && <div className="text-[10px] text-highlight">Invoice consent missing</div>}
      {details?.mpesaChangedByKind === "staff" && details.mpesaChangedAt && (
        <div className="text-[10px] text-highlight">Number changed by staff {shortDate(details.mpesaChangedAt)}</div>
      )}
      <div>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onEdit}>{details ? "Edit details" : "Add details"}</Button>
      </div>
    </div>
  );
}
