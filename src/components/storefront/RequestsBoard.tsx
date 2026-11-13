import { useEffect, useState } from "react";
import { Inbox, Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ago, kes, pipelineSummary, STAGES, whatsappUrl, type RequestStage, type StorefrontRequest } from "@/lib/storefrontRequests";

const STAGE_DOT: Record<RequestStage, string> = {
  new: "bg-sky-500", reviewing: "bg-amber-500", quoted: "bg-violet-500", won: "bg-emerald-500", lost: "bg-muted-foreground/40",
};

/** A basic CRM for storefront quote requests: totals, one column per stage, and a panel to work each request. */
export default function RequestsBoard({ requests, onChanged }: { requests: StorefrontRequest[]; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = requests.find((r) => r.id === openId) ?? null;
  const summary = pipelineSummary(requests);

  if (requests.length === 0) {
    return (
      <Card className="p-16 text-center text-muted-foreground">
        <Inbox className="w-10 h-10 mx-auto opacity-50" aria-hidden />
        <p className="mt-3">No requests yet. Share your storefront link to get the first one.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "New", value: String(summary.count.new) },
          { label: "Open requests", value: String(summary.open) },
          { label: "Open budgets", value: summary.openValue ? kes(summary.openValue) : "—" },
          { label: "Won", value: summary.wonValue ? kes(summary.wonValue) : String(summary.count.won) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="text-[12px] text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="-mx-1 overflow-x-auto pb-2">
        <div className="grid min-w-[1000px] grid-cols-5 gap-3 px-1">
          {STAGES.map((stage) => {
            const list = requests.filter((r) => r.status === stage.key);
            return (
              <section key={stage.key} className="flex min-w-0 flex-col rounded-2xl bg-secondary/40 p-2" aria-label={stage.label}>
                <header className="flex items-center justify-between px-2 py-1.5">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage.key]}`} aria-hidden /> {stage.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
                </header>
                <div className="flex flex-col gap-2">
                  {list.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{stage.hint}</p>}
                  {list.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      className="rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="truncate text-sm font-semibold">{r.company || r.contact_name}</div>
                      {r.company && <div className="truncate text-xs text-muted-foreground">{r.contact_name}</div>}
                      <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {(r.items ?? []).length} item{(r.items ?? []).length === 1 ? "" : "s"}{r.items?.[0]?.title ? `: ${r.items[0].title}` : ""}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{r.budget_kes ? kes(r.budget_kes) : "No budget given"}</span>
                        <span>{ago(r.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <RequestPanel request={open} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </div>
  );
}

function RequestPanel({ request, onClose, onChanged }: { request: StorefrontRequest | null; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNotes(request?.internal_notes ?? ""); }, [request?.id, request?.internal_notes]);

  const update = async (patch: Partial<Pick<StorefrontRequest, "status" | "internal_notes">>, done: string) => {
    if (!request) return;
    setSaving(true);
    const { error } = await supabase.from("inventory_bookings").update(patch).eq("id", request.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(done);
    onChanged();
  };

  const wa = whatsappUrl(request?.contact_phone);
  return (
    <Sheet open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {request && (
          <div className="space-y-6">
            <SheetHeader className="space-y-1 text-left">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Quote request · {ago(request.created_at)}</div>
              <SheetTitle className="font-display text-2xl">{request.company || request.contact_name}</SheetTitle>
              <SheetDescription>{request.company ? `${request.contact_name} · ` : ""}{request.contact_email}{request.contact_phone ? ` · ${request.contact_phone}` : ""}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><a href={`mailto:${request.contact_email}`}><Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Email</a></Button>
              {request.contact_phone && <Button asChild size="sm" variant="outline"><a href={`tel:${request.contact_phone.replace(/\s/g, "")}`}><Phone className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Call</a></Button>}
              {wa && <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden /> WhatsApp</a></Button>}
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Stage</div>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Stage">
                {STAGES.map((s) => (
                  <Button key={s.key} type="button" size="sm" variant={request.status === s.key ? "default" : "outline"} disabled={saving}
                    aria-pressed={request.status === s.key}
                    onClick={() => request.status !== s.key && update({ status: s.key }, `Moved to ${s.label}`)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Budget</dt><dd className="mt-0.5 font-medium tabular-nums">{request.budget_kes ? kes(request.budget_kes) : "Not given"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Dates</dt><dd className="mt-0.5 font-medium">{request.target_start || request.target_end ? `${request.target_start ?? "?"} to ${request.target_end ?? "?"}` : "Not given"}</dd></div>
            </dl>

            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">What they picked</div>
              <ul className="mt-2 space-y-1.5">
                {(request.items ?? []).map((i, n) => (
                  <li key={n} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="font-medium">{i.title}</div>
                    {(i.deliverable_type || i.handle) && <div className="text-xs text-muted-foreground">{[i.deliverable_type, i.handle].filter(Boolean).join(" · ")}</div>}
                  </li>
                ))}
              </ul>
            </div>

            {request.message && (
              <div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Their note</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{request.message}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="request-notes" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Notes for the team</Label>
              <Textarea id="request-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Price quoted, who's following up, next step…" />
              <Button type="button" size="sm" disabled={saving || notes === (request.internal_notes ?? "")} onClick={() => update({ internal_notes: notes || null }, "Notes saved")}>Save notes</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
