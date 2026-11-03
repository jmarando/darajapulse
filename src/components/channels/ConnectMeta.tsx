import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cancelConnectLink, connectUrl, createConnectLink, loadOpenLinks, startConnect, whatsappUrl, type ConnectLink } from "@/lib/brandChannels";

const endsOn = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" });

/**
 * How a brand's pages get connected: log in now, or, for agency staff, a link to send to whoever runs the page. It needs
 * no Pulse login, lasts 7 days and can be cancelled.
 */
export default function ConnectMeta({ clientId, brandName, canMakeLinks }: { clientId: string; brandName: string; canMakeLinks: boolean }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ConnectLink[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !canMakeLinks) return;
    let current = true;
    loadOpenLinks(clientId)
      .then((list) => { if (current) setLinks(list); })
      .catch((e) => toast({ title: "Couldn't load the links", description: (e as Error).message, variant: "destructive" }));
    return () => { current = false; };
  }, [open, canMakeLinks, clientId]);

  const connectNow = async () => {
    setBusy(true);
    try {
      window.location.assign(await startConnect(clientId));
    } catch (e) {
      setBusy(false);
      toast({ title: "Couldn't start the Facebook step", description: (e as Error).message, variant: "destructive" });
    }
  };

  const copyLink = async () => {
    setBusy(true);
    try {
      const link = links[0] ?? (await createConnectLink(clientId));
      setLinks((current) => (current.some((l) => l.id === link.id) ? current : [link, ...current]));
      await navigator.clipboard?.writeText(connectUrl(link.token));
      toast({ title: "Link copied", description: `It works until ${endsOn(link.expires_at)}.` });
    } catch (e) {
      toast({ title: "Couldn't make the link", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (link: ConnectLink) => {
    try {
      await cancelConnectLink(link.id);
      setLinks((current) => current.filter((l) => l.id !== link.id));
    } catch (e) {
      toast({ title: "Couldn't cancel the link", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setOpen(true)}>Connect Facebook and Instagram</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect {brandName}'s pages</DialogTitle>
            <DialogDescription>Read-only. Pulse can't post, comment or read messages. It needs someone who manages the page on Facebook.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-10 flex-1" onClick={connectNow} disabled={busy}>Connect now</Button>
            {canMakeLinks && <Button variant="outline" className="h-10 flex-1" onClick={copyLink} disabled={busy}>Copy link</Button>}
          </div>
          {canMakeLinks && links.length > 0 && (
            <ul className="space-y-3 border-t border-border/70 pt-3">
              {links.map((link) => (
                <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-muted-foreground">Works until {endsOn(link.expires_at)}</span>
                  <span className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm" className="h-8">
                      <a href={whatsappUrl(brandName, link.token)} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => cancel(link)}>Cancel link</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
