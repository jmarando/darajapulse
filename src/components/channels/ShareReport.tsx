import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { reportShareUrl, reportWhatsappUrl, shareLink, turnOffShareLink, type ShareLink } from "@/lib/brandChannels";

/** Makes or reuses the brand's one live share link and copies it. Agency staff only: the table's rules say so too. */
export default function ShareReport({ clientId, brandName }: { clientId: string; brandName: string }) {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const live = await shareLink(clientId);
      setLink(live);
      await navigator.clipboard?.writeText(reportShareUrl(live.token));
      toast({ title: "Link copied", description: "Anyone with it can see this report, with no login." });
    } catch (e) {
      toast({ title: "Couldn't make the link", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!link) return;
    try {
      await turnOffShareLink(link.id);
      setLink(null);
      toast({ title: "Link turned off", description: "It no longer shows the report." });
    } catch (e) {
      toast({ title: "Couldn't turn it off", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={share} disabled={busy}>
        <Share2 className="mr-2 h-4 w-4" aria-hidden /> Share
      </Button>
      <Dialog open={!!link} onOpenChange={(open) => { if (!open) setLink(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share {brandName}'s report</DialogTitle>
            <DialogDescription>The link is copied. Anyone with it can see this report, with no login, until you turn it off.</DialogDescription>
          </DialogHeader>
          {link && <p className="break-all rounded-lg bg-secondary/60 p-2 text-[12.5px]">{reportShareUrl(link.token)}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            {link && (
              <Button asChild variant="outline" className="h-10 flex-1">
                <a href={reportWhatsappUrl(brandName, link.token)} target="_blank" rel="noreferrer">Send on WhatsApp</a>
              </Button>
            )}
            <Button variant="outline" className="h-10 flex-1" onClick={turnOff}>Turn off</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
