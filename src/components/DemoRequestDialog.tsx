import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export default function DemoRequestDialog({ open, onOpenChange }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", role: "", message: "" });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "demo-request",
          recipientEmail: "justin@glab.africa",
          templateData: form,
        },
      });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      toast({ title: "Could not send request", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(() => { setDone(false); setForm({ name: "", email: "", company: "", role: "", message: "" }); }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {done ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="size-12 text-accent mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="font-display text-2xl font-semibold mb-2">Request received</h3>
            <p className="text-muted-foreground text-sm">Justin will be in touch within one business day.</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Request a demo</DialogTitle>
              <DialogDescription>
                Tell us a little about your work. We'll reach out within one business day.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={form.name} onChange={update("name")} required autoComplete="name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" value={form.email} onChange={update("email")} required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={form.company} onChange={update("company")} autoComplete="organization" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <Input id="role" value={form.role} onChange={update("role")} placeholder="e.g. Head of Marketing" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message">What are you trying to do?</Label>
                <Textarea id="message" value={form.message} onChange={update("message")} rows={3} placeholder="A few campaigns, contest ideas, creator markets you care about…" />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent text-accent-foreground px-6 py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60 transition-[filter,scale] active:scale-[0.96]"
              >
                {submitting ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : "Send request"}
              </button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
