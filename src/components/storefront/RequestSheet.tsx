import { useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ListingCover from "@/components/storefront/ListingCover";
import { EMPTY_REQUEST, type Listing, type RequestForm } from "@/lib/storefront";

/**
 * The buyer's request, in a side panel: what they picked (removable), who they are, budget and dates, then one send.
 * After sending it says what happens next instead of closing on a toast.
 */
export default function RequestSheet({ open, onOpenChange, houseName, accent, items, onRemove, onSend, sending, sentTo, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void; houseName: string; accent: string; items: Listing[];
  onRemove: (id: string) => void; onSend: (form: RequestForm, website: string) => void; sending: boolean;
  sentTo: { email: string; count: number } | null; onDone: () => void;
}) {
  const [form, setForm] = useState<RequestForm>(EMPTY_REQUEST);
  const [website, setWebsite] = useState("");
  const set = (k: keyof RequestForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {sentTo ? (
          <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-12 w-12" style={{ color: accent }} aria-hidden />
            <SheetHeader className="mt-4 space-y-2 text-center">
              <SheetTitle className="font-display text-2xl">Request sent</SheetTitle>
              <SheetDescription>
                {houseName} has your request for {sentTo.count} item{sentTo.count === 1 ? "" : "s"} and will reply within a day.
                A copy is on its way to {sentTo.email}.
              </SheetDescription>
            </SheetHeader>
            <Button type="button" className="mt-6 text-white" style={{ background: accent }} onClick={() => { setForm(EMPTY_REQUEST); onDone(); }}>Done</Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => { e.preventDefault(); onSend(form, website); }}
          >
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="font-display text-2xl">Request a quote</SheetTitle>
              <SheetDescription>{houseName} replies within a day with prices and dates.</SheetDescription>
            </SheetHeader>

            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Your picks ({items.length})</div>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing picked yet. Add listings from the storefront, or build a plan from your brief.</p>
              ) : (
                <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                      <ListingCover item={i} className="h-11 w-11 shrink-0 rounded-lg" badge={false} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{i.title}</div>
                        {i.deliverable_type && <div className="truncate text-xs text-muted-foreground">{i.deliverable_type}</div>}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remove ${i.title}`} onClick={() => onRemove(i.id)}>
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="rq-name">Your name *</Label><Input id="rq-name" required autoComplete="name" value={form.contact_name} onChange={set("contact_name")} /></div>
              <div className="space-y-1.5"><Label htmlFor="rq-company">Company</Label><Input id="rq-company" autoComplete="organization" value={form.company} onChange={set("company")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="rq-email">Email *</Label><Input id="rq-email" type="email" required autoComplete="email" value={form.contact_email} onChange={set("contact_email")} /></div>
              <div className="space-y-1.5"><Label htmlFor="rq-phone">Phone</Label><Input id="rq-phone" type="tel" autoComplete="tel" value={form.contact_phone} onChange={set("contact_phone")} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label htmlFor="rq-budget">Budget (KES)</Label><Input id="rq-budget" type="number" min={0} inputMode="numeric" value={form.budget_kes} onChange={set("budget_kes")} /></div>
              <div className="space-y-1.5"><Label htmlFor="rq-start">Start</Label><Input id="rq-start" type="date" value={form.target_start} onChange={set("target_start")} /></div>
              <div className="space-y-1.5"><Label htmlFor="rq-end">End</Label><Input id="rq-end" type="date" value={form.target_end} onChange={set("target_end")} /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-message">Anything else</Label>
              <Textarea id="rq-message" rows={4} value={form.message} onChange={set("message")} placeholder="Goals, key messages, deadlines…" />
            </div>
            {/* Hidden from people; bots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0">
              <label htmlFor="rq-website">Website</label>
              <input id="rq-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <Button type="submit" size="lg" disabled={sending || items.length === 0} className="w-full text-white" style={{ background: accent }}>
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Sending…</> : `Send request to ${houseName}`}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
