import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PublicFooter from "@/components/PublicFooter";

type State = "form" | "submitting" | "done" | "error";

const DataDeletion = () => {
  const [state, setState] = useState<State>("form");
  const [email, setEmail] = useState("");
  const [platformUserId, setPlatformUserId] = useState("");
  const [details, setDetails] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("submitting");
    const { error } = await supabase.from("data_deletion_requests").insert({
      email: email.trim(),
      platform_user_id: platformUserId.trim() || null,
      details: details.trim() || null,
    });
    if (error) {
      setState("error");
    } else {
      setState("done");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1">
        <div className="max-w-xl mx-auto px-6 md:px-10 py-12">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</a>
          <h1 className="font-display text-3xl font-semibold mt-4 mb-2">Data Deletion Request</h1>
          <p className="text-muted-foreground text-sm">
            Request deletion of your data connected through Facebook or Instagram. We will process your request within 30 days and confirm by email.
          </p>

          {state === "form" && (
            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platformUserId">Instagram / Facebook user ID (optional)</Label>
                <Input
                  id="platformUserId"
                  placeholder="e.g. 17841405793187218"
                  value={platformUserId}
                  onChange={(e) => setPlatformUserId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">Additional details (optional)</Label>
                <Textarea
                  id="details"
                  placeholder="Any specific data or campaigns you'd like us to remove..."
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">Submit request</Button>
            </form>
          )}

          {state === "submitting" && (
            <p className="mt-8 text-muted-foreground">Submitting your request…</p>
          )}

          {state === "done" && (
            <div className="mt-8 p-6 rounded-xl border bg-card space-y-3">
              <p className="font-medium text-foreground">Request received</p>
              <p className="text-sm text-muted-foreground">
                We have logged your deletion request. Our team will review and process it within 30 days. You will receive a confirmation email at <span className="text-foreground">{email}</span> once complete.
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="mt-8 p-6 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
              <p className="font-medium text-destructive">Something went wrong</p>
              <p className="text-sm text-muted-foreground">
                We couldn't submit your request. Please try again or email us directly at{" "}
                <a className="underline" href="mailto:privacy@darajapulse.com">privacy@darajapulse.com</a>.
              </p>
              <Button variant="outline" onClick={() => setState("form")} className="mt-2">Try again</Button>
            </div>
          )}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
};

export default DataDeletion;
