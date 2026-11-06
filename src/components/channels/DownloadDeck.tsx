import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { OrganicReport } from "../../../supabase/functions/_shared/organic-report";

/** The report on screen as a PowerPoint deck, built in the browser. Its code loads only when someone exports. */
export default function DownloadDeck({ report, brandName, rangeLabel }: { report: OrganicReport; brandName: string; rangeLabel: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { deckOutline } = await import("@/lib/organicDeck");
      const { exportOrganicToPptx } = await import("@/lib/exportOrganic");
      const generatedOn = new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
      await exportOrganicToPptx(deckOutline(report, { brandName, rangeLabel, generatedOn }), `${brandName} - Organic report - ${rangeLabel}`);
    } catch (e) {
      toast({ title: "Couldn't build the deck", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" className="h-9" onClick={download} disabled={busy}>
      <Download className="mr-2 h-4 w-4" aria-hidden /> {busy ? "Preparing…" : "Download deck"}
    </Button>
  );
}
