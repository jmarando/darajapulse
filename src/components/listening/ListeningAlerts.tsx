import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Panel } from "@/components/dash/Panel";
import { MAX_RECIPIENTS, parseRecipients } from "@/lib/listeningAlerts";
import { ACT_VIEWS, WATCH_VIEWS, views } from "../../../supabase/functions/_shared/listening-brief";

/**
 * Who is emailed when a negative post about the brand spreads, and a button to see the email. Agency staff
 * change the list; the brand's own users see it read-only. The rules (Watch and Act views, once per post
 * per level) are the morning view's, so the numbers here come from the same constants.
 */
export default function ListeningAlerts({ clientId, brandName, canEdit }: {
  clientId: string;
  brandName: string;
  canEdit: boolean;
}) {
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
    supabase.from("listening_alert_rules").select("enabled, recipients").eq("client_id", clientId).maybeSingle()
      .then(({ data, error }) => {
        if (!current) return;
        if (error) return setLoadError(error.message);
        setEnabled(data?.enabled ?? false);
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
      return toast({ title: "Add an email address first", description: "Alerts can't be on with nobody to send them to.", variant: "destructive" });
    }
    setBusy("save");
    const { error } = await supabase.from("listening_alert_rules").upsert(
      { client_id: clientId, enabled, recipients: emails, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    setBusy(null);
    if (error) return toast({ title: "Couldn't save alerts", description: error.message, variant: "destructive" });
    setText(emails.join("\n"));
    toast({ title: "Alerts saved", description: enabled ? `They go to ${emails.length} ${emails.length === 1 ? "address" : "addresses"}.` : "Alerts are off." });
  };

  // The function sends it to the signed-in person's own address, whatever is typed or saved above.
  const sendTest = async () => {
    setBusy("test");
    const { data, error } = await supabase.functions.invoke("listening-alerts", { body: { client_id: clientId, test: true } });
    setBusy(null);
    if (error || data?.error) return toast({ title: "Test didn't send", description: error?.message ?? data?.error, variant: "destructive" });
    toast({ title: "Test email sent", description: "It went to the address you signed in with." });
  };

  return (
    <Panel
      title="Email alerts"
      action={loaded ? <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} aria-label={`Email alerts for ${brandName}`} /> : undefined}
    >
      {loadError ? (
        <p className="text-[13px] text-destructive">Couldn't load the alert settings: {loadError}</p>
      ) : !loaded ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            We check every hour. You get an email when a negative post about {brandName} reaches {views(WATCH_VIEWS)} views (Watch)
            or {views(ACT_VIEWS)} views (Act), and when negative posts jump well above a normal day. Each post is emailed once per level.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="la-recipients">Who gets the emails</Label>
            <Textarea
              id="la-recipients"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="name@company.com"
            />
            <p className="text-[12px] text-muted-foreground">One address per line, or separated by commas. Up to {MAX_RECIPIENTS}.</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={save} disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save"}</Button>
              <Button size="sm" variant="outline" onClick={sendTest} disabled={busy !== null}>{busy === "test" ? "Sending…" : "Send me a test"}</Button>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">Only your agency can change who gets alerts.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
