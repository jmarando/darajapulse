import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreatorForm } from "@/components/creators/CreatorForm";

/** Edit a creator's profile and platforms from a campaign page, in the same form the Creators page uses. */
export const EditCreatorDialog = ({
  influencerId,
  open,
  onOpenChange,
  onSaved,
  roster = [],
}: {
  influencerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
  /** The roster, so a handle that already belongs to someone else gets caught. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- influencer rows are read loosely across this app.
  roster?: any[];
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above.
  const [row, setRow] = useState<any>(null);

  useEffect(() => {
    setRow(null);
    if (!open || !influencerId) return;
    (async () => {
      const { data, error } = await supabase.from("influencers").select("*").eq("id", influencerId).maybeSingle();
      if (error || !data) return toast.error(error?.message ?? "Creator not found");
      setRow(data);
    })();
  }, [open, influencerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">Edit creator</DialogTitle></DialogHeader>
        {!row ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <CreatorForm
            key={row.id}
            row={row}
            agencyId={row.agency_id}
            roster={roster}
            onSaved={() => { onOpenChange(false); onSaved?.(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditCreatorDialog;
