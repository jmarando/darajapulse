import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy, Mail, Send, Sparkles, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";

// Sender identity for Royco creator comms. Must stay on the verified darajapulse.com domain.
const ROYCO_FROM = "Royco x Daraja Pulse <royco@darajapulse.com>";

type Recipient = { email: string; name?: string | null };

type Props = {
  campaignId: string;
  campaignName: string;
  emails: string[];
  recipients?: Recipient[];
  hashtag?: string | null;
};

const BATCH = 80;

export const BroadcastCreatorsDialog = ({ campaignId, campaignName, emails, recipients, hashtag }: Props) => {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [subject, setSubject] = useState(`${campaignName} — update`);
  const [body, setBody] = useState("");

  // Kick-off invite state
  const [meetingDay, setMeetingDay] = useState("Tuesday 26 August");
  const [meetingTime, setMeetingTime] = useState("5:00 – 6:30 PM EAT");
  const [meetingLink, setMeetingLink] = useState("https://teams.microsoft.com/meet/336068736223252?p=zyx6Rhg5jNTRIqUmUq");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [replyTo, setReplyTo] = useState("royco@reply.darajapulse.com");

  // Preview + test send
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  const clean = useMemo(
    () => Array.from(new Set(emails.map((e) => (e || "").trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))),
    [emails]
  );

  const namedRecipients = useMemo(() => {
    const byEmail = new Map<string, string | null>();
    (recipients ?? []).forEach((r) => {
      const e = (r.email || "").trim().toLowerCase();
      if (e && !byEmail.has(e)) byEmail.set(e, r.name ?? null);
    });
    return clean.map((e) => ({ email: e, name: byEmail.get(e) ?? null }));
  }, [clean, recipients]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("contests")
      .select("submission_token")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setToken(data?.submission_token ?? null));
  }, [open, campaignId]);

  const submitUrl = token ? `${window.location.origin}/c/${token}` : "";

  useEffect(() => {
    if (!open || body) return;
    setBody(
      `Hi,\n\nQuick update on ${campaignName}.\n\n• Post 4 videos a month${hashtag ? `, always using ${hashtag}` : ""}.\n• After each post goes live, submit the link here so it's tracked:\n${submitUrl || "(submission link)"}\n\nAsante,\nDaraja Pulse`
    );
  }, [open, submitUrl, campaignName, hashtag, body]);

  const batches = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < clean.length; i += BATCH) out.push(clean.slice(i, i + BATCH));
    return out;
  }, [clean]);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const openMail = (batch: string[]) => {
    const url = `mailto:?bcc=${encodeURIComponent(batch.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  const templateData = (name?: string | null) => ({
    greeting_name: (name || "").split(" ")[0] || "there",
    campaign_name: campaignName,
    meeting_day: meetingDay,
    meeting_time: meetingTime,
    meeting_link: meetingLink.trim() || undefined,
    submission_url: submitUrl || undefined,
    custom_note: note.trim() || undefined,
    rsvp_email: replyTo.trim() || undefined,
  });

  // Who has replied: any creator on the roster with an inbound email thread.
  const [replied, setReplied] = useState<{ email: string; name: string | null; at: string }[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  const loadReplies = async () => {
    if (!clean.length) return;
    setLoadingReplies(true);
    const found: { email: string; name: string | null; at: string }[] = [];
    for (let i = 0; i < clean.length; i += 100) {
      const chunk = clean.slice(i, i + 100);
      const { data } = await supabase
        .from("email_threads")
        .select("participant_email, participant_name, last_message_at")
        .in("participant_email", chunk);
      (data ?? []).forEach((t: any) =>
        found.push({ email: t.participant_email, name: t.participant_name ?? null, at: t.last_message_at }),
      );
    }
    const byEmail = new Map(namedRecipients.map((r) => [r.email, r.name]));
    setReplied(
      found
        .map((f) => ({ ...f, name: f.name || byEmail.get(f.email) || null }))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    );
    setLoadingReplies(false);
  };

  useEffect(() => {
    if (open) loadReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clean.length]);

  const loadPreview = async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-transactional-email", {
        body: { templateName: "royco-kickoff-invite", preview: true, templateData: templateData(namedRecipients[0]?.name ?? "Mary") },
      });
      if (error) throw error;
      setPreviewHtml((data as any)?.html ?? null);
      setPreviewSubject((data as any)?.subject ?? "");
    } catch (e: any) {
      toast.error(e?.message || "Could not build the preview");
    }
    setPreviewing(false);
  };

  const sendTest = async () => {
    const to = testEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return toast.error("Enter a valid test email address");
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "royco-kickoff-invite",
          recipientEmail: to,
          from: ROYCO_FROM,
          replyTo: replyTo.trim() || undefined,
          idempotencyKey: `kickoff-test-${campaignId}-${to}-${Date.now()}`,
          templateData: templateData("Test"),
        },
      });
      if (error) throw error;
      toast.success(`Test invite sent to ${to}`);
    } catch (e: any) {
      toast.error(e?.message || "Test send failed");
    }
    setTesting(false);
  };

  const sendInvites = async () => {
    if (!meetingLink.trim()) {
      const ok = window.confirm("No meeting link added yet — send the invite without it?");
      if (!ok) return;
    }
    setSending(true);
    setProgress({ done: 0, total: namedRecipients.length });
    let failed = 0;
    for (let i = 0; i < namedRecipients.length; i++) {
      const r = namedRecipients[i];
      try {
        const { error } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "royco-kickoff-invite",
            recipientEmail: r.email,
            from: ROYCO_FROM,
            replyTo: replyTo.trim() || undefined,
            idempotencyKey: `kickoff-${campaignId}-${r.email}`,
            templateData: {
              greeting_name: (r.name || "").split(" ")[0] || "there",
              campaign_name: campaignName,
              meeting_day: meetingDay,
              meeting_time: meetingTime,
              meeting_link: meetingLink.trim() || undefined,
              submission_url: submitUrl || undefined,
              custom_note: note.trim() || undefined,
            },
          },
        });
        if (error) failed++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: namedRecipients.length });
    }
    setSending(false);
    toast[failed ? "warning" : "success"](
      failed ? `Sent with ${failed} failure${failed > 1 ? "s" : ""}` : `Kick-off invite queued to ${namedRecipients.length} creators`
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="w-3 h-3 mr-1" /> Email creators
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Message all creators</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm mb-2">
          <Badge variant="secondary">{clean.length} contactable</Badge>
          <span className="text-xs text-muted-foreground">of {emails.length} on the roster</span>
        </div>

        <Tabs defaultValue="kickoff">
          <TabsList className="mb-4">
            <TabsTrigger value="kickoff">Kick-off invite</TabsTrigger>
            <TabsTrigger value="plain">Plain email</TabsTrigger>
          </TabsList>

          <TabsContent value="kickoff" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sends a branded Royco-red invite from Daraja Pulse — meeting details, what we'll cover, and a short intro to the
              platform for briefing, reporting and payments.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Day</Label>
                <Input value={meetingDay} onChange={(e) => setMeetingDay(e.target.value)} placeholder="Monday 10 August" />
              </div>
              <div>
                <Label>Time</Label>
                <Input value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} placeholder="5:00 PM EAT" />
              </div>
            </div>

            <div>
              <Label>Teams meeting link</Label>
              <Input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://teams.microsoft.com/l/meetup-join/..."
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Paste the Teams link here before sending — it becomes the "Join the meeting" button.
              </p>
            </div>

            <div>
              <Label>Extra note (optional)</Label>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else you want to add…" />
            </div>

            <div>
              <Label>Reply-to address</Label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="royco@reply.darajapulse.com" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Sent from <span className="font-mono">royco@darajapulse.com</span>. Creator replies land in whichever inbox you set here.
              </p>
            </div>



            <div className="rounded-lg border border-border p-3 bg-secondary/40 space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview &amp; test</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={loadPreview} disabled={previewing}>
                  {previewing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                  Preview email
                </Button>
                <Input
                  className="text-xs h-9 w-56"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@company.com"
                />
                <Button size="sm" variant="outline" onClick={sendTest} disabled={testing}>
                  {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  Send test
                </Button>
              </div>
              {previewHtml && (
                <div>
                  <div className="text-xs mb-1"><span className="text-muted-foreground">Subject:</span> {previewSubject}</div>
                  <iframe
                    title="Kick-off invite preview"
                    srcDoc={previewHtml}
                    className="w-full h-[420px] rounded-md border border-border bg-white"
                  />
                </div>
              )}
            </div>

            <Button className="bg-primary" disabled={sending || !namedRecipients.length} onClick={sendInvites}>
              {sending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
              {sending
                ? `Sending ${progress?.done ?? 0}/${progress?.total ?? 0}`
                : `Send branded invite to ${namedRecipients.length}`}
            </Button>
          </TabsContent>


          <TabsContent value="plain" className="space-y-4">
            {submitUrl && (
              <div className="rounded-lg border border-border p-3 bg-secondary/40">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Submission form</div>
                <div className="flex items-center gap-2 mt-1">
                  <Input readOnly value={submitUrl} className="text-xs" />
                  <Button size="sm" variant="outline" onClick={() => copy(submitUrl, "Link")}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(clean.join(", "), "Emails")}>
                <Copy className="w-3 h-3 mr-1" /> Copy all emails
              </Button>
              {batches.map((b, i) => (
                <Button key={i} size="sm" className="bg-primary" onClick={() => openMail(b)}>
                  <Send className="w-3 h-3 mr-1" />
                  {batches.length > 1 ? `Open batch ${i + 1} (${b.length})` : `Open in email (${b.length})`}
                </Button>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Recipients go in BCC so creators never see each other's addresses. Large rosters are split into batches of {BATCH}.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
