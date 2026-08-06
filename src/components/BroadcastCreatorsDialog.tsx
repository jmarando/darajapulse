import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Mail, Send } from "lucide-react";
import { toast } from "sonner";

type Props = {
  campaignId: string;
  campaignName: string;
  emails: string[];
  hashtag?: string | null;
};

const BATCH = 80;

export const BroadcastCreatorsDialog = ({ campaignId, campaignName, emails, hashtag }: Props) => {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [subject, setSubject] = useState(`${campaignName} — update`);
  const [body, setBody] = useState("");

  const clean = useMemo(
    () => Array.from(new Set(emails.map((e) => (e || "").trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))),
    [emails]
  );

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="w-3 h-3 mr-1" /> Email creators
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Message all creators</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">{clean.length} contactable</Badge>
            <span className="text-xs text-muted-foreground">of {emails.length} on the roster</span>
          </div>

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
            Recipients go in BCC so creators never see each other's addresses. Large rosters are split into batches of {BATCH} to stay
            within mail client limits — paste into your mail tool of choice if you prefer.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
