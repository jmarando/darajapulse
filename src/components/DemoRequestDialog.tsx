import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source?: string;
  title?: string;
  description?: string;
  defaultMessage?: string;
};

const emptyForm = (message = "") => ({ name: "", email: "", company: "", role: "", message });

export default function DemoRequestDialog({
  open,
  onOpenChange,
  source = "website",
  title = "Request a demo",
  description = "Tell us a little about your work. We'll reach out within one business day.",
  defaultMessage = "",
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState(() => emptyForm(defaultMessage));

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
      // Persist to the database so Super Admin can see it even if email fails.
      const { error: insertErr } = await (supabase.from("demo_requests") as any).insert({
        name: form.name,
        email: form.email,
        company: form.company || null,
        role: form.role || null,
        message: form.message || null,
        source,
      });
      if (insertErr) throw insertErr;

      // Fire-and-forget notification email; don't block the success state on it.
      supabase.functions
        .invoke("send-transactional-email", {
          body: {
            templateName: "demo-request",
            recipientEmail: "justin@glab.africa",
            templateData: form,
          },
        })
        .catch(() => {});
      setDone(true);
    } catch (err: any) {
      toast({ title: "Could not send request", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(() => { setDone(false); setForm(emptyForm(defaultMessage)); }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {done ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="size-12 text-accent mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="font-display text-2xl font-semibold mb-2">Request received</h3>
            <p className="text-muted-foreground text-sm">We'll be in touch within one business day.</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
              <DialogDescription>
                {description}
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
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {submitting ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : "Send request"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
