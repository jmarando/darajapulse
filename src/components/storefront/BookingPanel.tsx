import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  houseCan, lineWhat, nextStep, shortDate, stateOf, type BookingRow, type HouseAction, type LineLike, type SavedFile,
} from "@/lib/storefrontBooking";
import { functionError, uploadAll } from "@/lib/storefrontCheckout";
import { ago, kes, whatsappUrl } from "@/lib/storefrontRequests";
import { materialNote } from "@/lib/storefrontBookings";

type HouseView = { booking: BookingRow; urls: Record<string, string>; events: { at: string; actor: string; kind: string; detail: Record<string, unknown> }[] };

const EVENT_WORDS: Record<string, string> = {
  created: "Booked", payment_started: "Opened online payment", pay_by_bank: "Chose to pay by bank", payment_claimed: "Said they'd paid",
  paid: "Paid", files_added: "Added files", final_approved: "Approved the finished ad", final_changes: "Asked for a change to the finished ad",
  mark_paid: "Payment marked as received", request_changes: "Asked for a change", send_final: "Sent the finished ad", approve: "Approved and scheduled",
  mark_live: "Marked live", mark_done: "Marked done", cancel: "Cancelled", note: "Added a note",
};

/** One booking, for the house: where it stands, its lines, the ad, the payment, the history, and the next steps. */
export default function BookingPanel({ id, today, onClose, onChanged }: { id: string | null; today: string; onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<HouseView | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("storefront-booking-house", { body: { action, id, ...extra } });
    if (error) throw new Error(await functionError(error, "That didn't work. Try again."));
    return data;
  }, [id]);

  useEffect(() => {
    setView(null);
    if (!id) return;
    call("get").then((d) => setView(d as HouseView)).catch((e: Error) => toast.error(e.message));
  }, [id, call]);

  const act = async (action: HouseAction, extra: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      setView((await call(action, extra)) as HouseView);
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Uploads the house's files through signed links, then returns them as the actions take them. */
  const upload = async (purpose: "final" | "proof", files: File[]) => {
    const asked = files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
    const { uploads } = (await call("upload_urls", { purpose, files: asked })) as { uploads: { name: string; path: string; token: string }[] };
    return uploadAll(supabase as never, uploads.map((u) => ({ slot: purpose, path: u.path, token: u.token })), files);
  };

  const b = view?.booking;
  const state = b ? stateOf(b) : null;
  const can = (a: HouseAction) => Boolean(state && houseCan(state, a));
  const link = (f: SavedFile) => view?.urls[f.path];
  const wa = whatsappUrl(b?.contact_phone);

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {!b || !state ? (
          <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Loading…</div>
        ) : (
          <div className="space-y-5">
            <SheetHeader className="space-y-1 text-left">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Booking {b.ref} · {ago(b.created_at)}</div>
              <SheetTitle className="font-display text-2xl">{b.company || b.contact_name}</SheetTitle>
              <SheetDescription>{b.company ? `${b.contact_name} · ` : ""}{b.contact_email}{b.contact_phone ? ` · ${b.contact_phone}` : ""}{b.client_name ? ` · for ${b.client_name}` : ""}</SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Total", value: kes(b.total_kes) },
                { label: "Paid", value: b.paid_at ? shortDate(b.paid_at.slice(0, 10)) : "Not yet" },
                { label: "Next", value: nextStep(state, today).label },
              ].map((x) => (
                <div key={x.label} className="rounded-xl border border-border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{x.label}</div>
                  <div className="text-sm font-semibold">{x.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><a href={`mailto:${b.contact_email}`}><Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Email</a></Button>
              {b.contact_phone && <Button asChild size="sm" variant="outline"><a href={`tel:${b.contact_phone.replace(/\s/g, "")}`}><Phone className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Call</a></Button>}
              {wa && <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden /> WhatsApp</a></Button>}
            </div>

            <Actions booking={b} can={can} busy={busy} act={act} upload={upload} />

            <Tabs defaultValue="booking">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="booking">Booking</TabsTrigger>
                <TabsTrigger value="ad">Ad</TabsTrigger>
                <TabsTrigger value="payment">Payment</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="booking" className="space-y-2">
                {(b.lines as unknown as (LineLike & { title: string; total: number })[]).map((l, n) => (
                  <div key={n} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="min-w-0"><div className="font-medium">{l.title}</div><div className="text-xs text-muted-foreground">{lineWhat(l)}</div></div>
                    <div className="shrink-0 tabular-nums">{kes(l.total)}</div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Media {kes(b.media_kes)}{b.production_kes ? ` · making the ad ${kes(b.production_kes)}` : ""} · VAT {kes(b.vat_kes)}
                </p>
                {b.schedule_note && <p className="text-sm"><b>Schedule:</b> {b.schedule_note}</p>}
                {b.internal_notes && <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-xs">{b.internal_notes}</p>}
              </TabsContent>
              <TabsContent value="ad" className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {Object.entries(b.materials ?? {}).map(([m, s]) => (
                    <li key={m}>
                      <span className="font-medium capitalize">{m}</span>: {materialNote(s, b.start_date)}
                      {s.script && <span className="block whitespace-pre-wrap text-muted-foreground">"{s.script}"</span>}
                      {s.topic && <span className="block text-muted-foreground">Topic: {s.topic}{s.guest ? ` · ${s.guest}` : ""}{s.guest_phone ? ` · ${s.guest_phone}` : ""}</span>}
                      {s.notes && <span className="block whitespace-pre-wrap text-muted-foreground">{s.notes}</span>}
                    </li>
                  ))}
                </ul>
                {(b.kit?.headline || b.kit?.message || b.kit?.cta) ? (
                  <p className="text-muted-foreground">Brand kit: {[b.kit.headline, b.kit.message, b.kit.cta].filter(Boolean).join(" · ")}{b.kit.colour ? ` · ${b.kit.colour}` : ""}</p>
                ) : null}
                <FileList title="Their files" files={b.files} link={link} />
                <FileList title={`Finished ad${b.final_state === "awaiting_buyer" ? " (waiting for their answer)" : b.final_state === "approved" ? " (approved)" : b.final_state === "changes" ? " (they asked for a change)" : ""}`} files={b.final_files} link={link} />
              </TabsContent>
              <TabsContent value="payment" className="space-y-1 text-sm">
                <p>Way to pay: {b.pay_method === "pesapal" ? "M-Pesa or card (Pesapal)" : "PesaLink or paybill"}</p>
                {b.pesapal_status && <p>Pesapal: {b.pesapal_status}</p>}
                {b.payment_claimed_ref && <p>They said they paid: {b.payment_claimed_ref}</p>}
                {b.paid_at && <p>Paid {shortDate(b.paid_at.slice(0, 10))}{b.payment_ref ? `, reference ${b.payment_ref}` : ""}</p>}
                {b.status === "cancelled" && <p>Cancelled{b.refunded ? `, refunded${b.refund_ref ? ` (${b.refund_ref})` : ""}` : ""}</p>}
              </TabsContent>
              <TabsContent value="history">
                <ol className="space-y-1.5 text-sm">
                  {view.events.map((e, n) => (
                    <li key={n} className="flex justify-between gap-3">
                      <span>{EVENT_WORDS[e.kind] ?? e.kind}<span className="text-muted-foreground"> · {e.actor === "house" ? "your team" : e.actor === "buyer" ? "buyer" : "system"}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ago(e.at)}</span>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FileList({ title, files, link }: { title: string; files: SavedFile[]; link: (f: SavedFile) => string | undefined }) {
  if (!files?.length) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</div>
      <ul className="mt-1 space-y-0.5">
        {files.map((f) => <li key={f.path}>{link(f) ? <a className="underline underline-offset-4" href={link(f)} target="_blank" rel="noreferrer">{f.name}</a> : f.name}{f.slot ? <span className="text-muted-foreground"> · {f.slot.replace("kit_", "kit ")}</span> : null}</li>)}
      </ul>
    </div>
  );
}

/** The steps the house can take now, each with the one or two fields it needs. */
function Actions({ booking: b, can, busy, act, upload }: {
  booking: BookingRow; can: (a: HouseAction) => boolean; busy: boolean;
  act: (action: HouseAction, extra: Record<string, unknown>, done: string) => Promise<void>;
  upload: (purpose: "final" | "proof", files: File[]) => Promise<{ path: string; name: string; type: string; size: number }[]>;
}) {
  const [reference, setReference] = useState(b.payment_claimed_ref ?? "");
  const [note, setNote] = useState("");
  const [finalFiles, setFinalFiles] = useState<File[]>([]);
  const [proof, setProof] = useState<{ views: string; spots: string; files: File[] }>({ views: "", spots: "", files: [] });
  const [cancelling, setCancelling] = useState(false);
  const [refund, setRefund] = useState({ refunded: false, ref: "" });

  return (
    <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Next steps">
      {can("mark_paid") && (
        <div className="space-y-1.5">
          <Label htmlFor="bp-ref">Bank or M-Pesa reference</Label>
          <div className="flex gap-2">
            <Input id="bp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="From the bank statement" />
            <Button type="button" disabled={busy || !reference.trim()} onClick={() => act("mark_paid", { reference: reference.trim() }, "Marked as paid")}>Mark as received</Button>
          </div>
        </div>
      )}

      {(can("approve") || can("request_changes") || can("mark_live") || can("mark_done")) && (
        <div className="space-y-1.5">
          <Label htmlFor="bp-note">Note to the buyer</Label>
          <Textarea id="bp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={can("approve") ? "When it runs, e.g. 7:10 and 8:40 each morning" : "What they should know"} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {can("approve") && <Button type="button" disabled={busy} onClick={() => act("approve", { note }, "Approved and scheduled")}>Approve and schedule</Button>}
        {can("request_changes") && <Button type="button" variant="outline" disabled={busy || !note.trim()} onClick={() => act("request_changes", { note }, "Change asked")}>Ask for a change</Button>}
        {can("mark_live") && <Button type="button" disabled={busy} onClick={() => act("mark_live", { note }, "Marked live")}>Mark live</Button>}
      </div>

      {can("send_final") && (
        <div className="space-y-1.5">
          <Label htmlFor="bp-final">Finished ad, for the buyer to approve</Label>
          <div className="flex gap-2">
            <Input id="bp-final" type="file" multiple onChange={(e) => setFinalFiles(Array.from(e.target.files ?? []))} />
            <Button type="button" variant="outline" disabled={busy || !finalFiles.length}
              onClick={async () => { const files = await upload("final", finalFiles); await act("send_final", { files, note }, "Sent to the buyer"); }}>
              Send
            </Button>
          </div>
        </div>
      )}

      {can("mark_done") && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="bp-views" className="text-xs">Views delivered</Label><Input id="bp-views" type="number" value={proof.views} onChange={(e) => setProof({ ...proof, views: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="bp-spots" className="text-xs">Spots aired</Label><Input id="bp-spots" type="number" value={proof.spots} onChange={(e) => setProof({ ...proof, spots: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="bp-proof" className="text-xs">Proof files</Label><Input id="bp-proof" type="file" multiple onChange={(e) => setProof({ ...proof, files: Array.from(e.target.files ?? []) })} /></div>
          <Button type="button" className="sm:col-span-3" disabled={busy}
            onClick={async () => {
              const files = proof.files.length ? await upload("proof", proof.files) : [];
              await act("mark_done", { note, views: Number(proof.views) || null, spots: Number(proof.spots) || null, files }, "Marked done");
            }}>
            Mark done and send proof
          </Button>
        </div>
      )}

      {can("cancel") && (cancelling ? (
        <div className="space-y-2 rounded-lg bg-muted/60 p-2">
          <Label htmlFor="bp-cancel">Why is it cancelled?</Label>
          <Textarea id="bp-cancel" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {b.paid_at && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={refund.refunded} onChange={(e) => setRefund({ ...refund, refunded: e.target.checked })} /> Refunded
              {refund.refunded && <Input className="h-8" placeholder="Refund reference" value={refund.ref} onChange={(e) => setRefund({ ...refund, ref: e.target.value })} />}
            </label>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={busy || !note.trim()} onClick={() => act("cancel", { reason: note, refunded: refund.refunded, refund_ref: refund.ref }, "Cancelled")}>Cancel booking</Button>
            <Button type="button" variant="ghost" onClick={() => setCancelling(false)}>Keep it</Button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setCancelling(true)}>Cancel this booking</button>
      ))}

      <NoteBox busy={busy} onSave={(text) => act("note", { text }, "Note saved")} />
    </section>
  );
}

function NoteBox({ busy, onSave }: { busy: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <Input aria-label="Note for your team" value={text} onChange={(e) => setText(e.target.value)} placeholder="Note for your team" />
      <Button type="button" variant="outline" disabled={busy || !text.trim()} onClick={() => { onSave(text.trim()); setText(""); }}>Save note</Button>
    </div>
  );
}
