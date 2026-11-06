import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Panel } from "@/components/dash/Panel";
import { MAX_RECIPIENTS, parseRecipients } from "@/lib/listeningAlerts";

// This table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

/**
 * Who gets last month's report by email on the 1st. Agency staff change the list; the brand's own users see it
 * read-only. A test goes only to the signed-in person, whatever is typed or saved here.
 */
export default function BrandReportEmail({ clientId, brandName, canEdit }: { clientId: string; brandName: string; canEdit: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  useEffect(() => {
    // A late answer for a brand we have moved away from must not fill in this one's form.
    let current = true;
    setLoaded(false);
    setLoadError(null);
    db.from("brand_report_settings").select("monthly_email, recipients").eq("client_id", clientId).maybeSingle()
      .then(({ data, error }) => {
        if (!current) return;
        if (error) return setLoadError(error.message);
        setEnabled(data?.monthly_email ?? false);
        setText((data?.recipients ?? []).join("\n"));
        setLoaded(true);
      });
    return () => { current = false; };
  }, [clientId]);

  const save = async () => {
    const { emails, invalid, tooMany } = parseRecipients(text);
    if (invalid.length) {
      return toast({ title: "Check the email addresses", description: `These don't look like email addresses: ${invalid.join(", ")}`, variant: "destructive" });
    }
    if (tooMany) return toast({ title: "Too many addresses", description: `A brand's list holds up to ${MAX_RECIPIENTS}.`, variant: "destructive" });
    if (enabled && !emails.length) {
      return toast({ title: "Add an email address first", description: "The email can't be on with nobody to send it to.", variant: "destructive" });
    }
    setBusy("save");
    const { error } = await db.from("brand_report_settings").upsert(
      { client_id: clientId, monthly_email: enabled, recipients: emails, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    setBusy(null);
    if (error) return toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    setText(emails.join("\n"));
    toast({ title: "Saved", description: enabled ? `It goes to ${emails.length} ${emails.length === 1 ? "address" : "addresses"} on the 1st.` : "The monthly email is off." });
  };

  const sendTest = async () => {
    setBusy("test");
    const { data, error } = await supabase.functions.invoke("send-brand-report", { body: { client_id: clientId, test: true } });
    setBusy(null);
    if (error || !data?.sent) {
      return toast({ title: "Couldn't send the test", description: data?.error ?? error?.message, variant: "destructive" });
    }
    toast({ title: "Test email sent", description: "It went to the address you signed in with." });
  };

  return (
    <Panel
      title="Monthly email"
      action={loaded ? <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} aria-label="Monthly email" /> : undefined}
    >
      {loadError ? (
        <p className="text-[13px] text-destructive">Couldn't load the settings: {loadError}</p>
      ) : !loaded ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            At 8am on the 1st, last month's headline numbers and most viewed post for {brandName} go to these addresses, with a link to the full report.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="br-recipients">Who gets the email</Label>
            <Textarea id="br-recipients" value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} rows={3} placeholder="name@company.com" />
            <p className="text-[12px] text-muted-foreground">One address per line, or separated by commas. Up to {MAX_RECIPIENTS}.</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={save} disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save"}</Button>
              <Button size="sm" variant="outline" onClick={sendTest} disabled={busy !== null}>{busy === "test" ? "Sending…" : "Send me a test"}</Button>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">Only your agency can change who gets this.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
