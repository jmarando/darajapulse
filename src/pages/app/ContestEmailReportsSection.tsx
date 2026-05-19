import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Send, Trash2, Plus, Clock } from "lucide-react";

type ReportType = "contest_daily" | "draw_closed";

interface Schedule {
  id: string;
  campaign_id: string | null;
  contest_id: string | null;
  report_type: ReportType;
  enabled: boolean;
  send_hour: number;
  send_minute: number;
  send_dow: number | null;
  timezone: string;
  last_sent_at: string | null;
}

interface Recipient {
  id: string;
  campaign_id: string | null;
  contest_id: string | null;
  email: string;
  name: string | null;
  audience: "agency" | "client" | "extra";
  receives_contest_daily: boolean;
  receives_draw_closed: boolean;
  receives_campaign_weekly: boolean;
}

export default function ContestEmailReportsSection({
  contestId,
  campaignId,
}: {
  contestId: string;
  campaignId: string | null;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newAudience, setNewAudience] = useState<"agency" | "client" | "extra">("extra");

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from("report_schedules").select("*").eq("contest_id", contestId).order("report_type"),
      supabase.from("report_recipients").select("*").eq("contest_id", contestId).order("audience").order("email"),
    ]);
    setSchedules((s as Schedule[]) || []);
    setRecipients((r as Recipient[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [contestId]);

  const ensureSchedule = async (type: ReportType) => {
    const existing = schedules.find((x) => x.report_type === type);
    if (existing) return existing;
    const defaults: any = {
      campaign_id: campaignId,
      contest_id: contestId,
      report_type: type,
      enabled: true,
      send_hour: 8,
      send_minute: 0,
      send_dow: null,
      timezone: "Africa/Nairobi",
    };
    const { data, error } = await supabase.from("report_schedules").insert(defaults).select().single();
    if (error) { toast.error(error.message); return null; }
    setSchedules((p) => [...p, data as Schedule]);
    return data as Schedule;
  };

  const updateSchedule = async (id: string, patch: Partial<Schedule>) => {
    setSchedules((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await supabase.from("report_schedules").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const addRecipient = async () => {
    if (!newEmail.trim()) return;
    const { data, error } = await supabase.from("report_recipients").insert({
      contest_id: contestId,
      campaign_id: campaignId,
      email: newEmail.trim().toLowerCase(),
      name: newName.trim() || null,
      audience: newAudience,
      receives_campaign_weekly: false,
      receives_contest_daily: true,
      receives_draw_closed: true,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setRecipients((p) => [...p, data as Recipient]);
    setNewEmail(""); setNewName("");
    toast.success("Recipient added");
  };

  const removeRecipient = async (id: string) => {
    const { error } = await supabase.from("report_recipients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRecipients((p) => p.filter((r) => r.id !== id));
  };

  const toggleRecipient = async (r: Recipient, field: keyof Recipient) => {
    const next = { ...r, [field]: !r[field] };
    setRecipients((p) => p.map((x) => (x.id === r.id ? next : x)));
    const { error } = await supabase.from("report_recipients").update({ [field]: next[field] } as any).eq("id", r.id);
    if (error) toast.error(error.message);
  };

  const invokeSend = async (type: ReportType, extra: Record<string, any> = {}) => {
    if (!campaignId) {
      toast.error("This contest must be linked to a campaign to send reports for now.");
      return null;
    }
    return supabase.functions.invoke("send-campaign-report", {
      body: { campaign_id: campaignId, contest_id: contestId, report_type: type, ...extra },
    });
  };

  const sendTest = async (type: ReportType) => {
    const { data: user } = await supabase.auth.getUser();
    const me = user.user?.email;
    if (!me) { toast.error("Sign in required"); return; }
    setSending(type);
    const res = await invokeSend(type, { test_email: me });
    setSending(null);
    if (!res) return;
    if (res.error) { toast.error(res.error.message); return; }
    if ((res.data as any)?.error) { toast.error((res.data as any).error); return; }
    toast.success(`Test sent to ${me}`);
  };

  const sendNow = async (type: ReportType) => {
    setSending(`now-${type}`);
    const res = await invokeSend(type);
    setSending(null);
    if (!res) return;
    if (res.error) { toast.error(res.error.message); return; }
    const sent = (res.data as any)?.sent ?? 0;
    toast.success(`Sent to ${sent} recipient${sent === 1 ? "" : "s"}`);
  };

  const ScheduleCard = ({ type, title, description }: { type: ReportType; title: string; description: string }) => {
    const s = schedules.find((x) => x.report_type === type);
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />{title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <Switch
              checked={s?.enabled ?? false}
              onCheckedChange={async (v) => {
                const row = s || (await ensureSchedule(type));
                if (row) await updateSchedule(row.id, { enabled: v });
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {s && (
            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <Label className="text-xs">Hour (EAT)</Label>
                <Input type="number" min={0} max={23} value={s.send_hour}
                  onChange={(e) => updateSchedule(s.id, { send_hour: Math.max(0, Math.min(23, +e.target.value)) })} />
              </div>
              <div>
                <Label className="text-xs">Minute</Label>
                <Input type="number" min={0} max={59} step={15} value={s.send_minute}
                  onChange={(e) => updateSchedule(s.id, { send_minute: Math.max(0, Math.min(59, +e.target.value)) })} />
              </div>
            </div>
          )}
          {s?.last_sent_at && (
            <p className="text-xs text-muted-foreground">Last sent {new Date(s.last_sent_at).toLocaleString()}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={sending === type} onClick={() => sendTest(type)}>
              <Send className="h-3.5 w-3.5 mr-1.5" />{sending === type ? "Sending..." : "Send test to me"}
            </Button>
            {type === "contest_daily" && (
              <Button size="sm" variant="secondary" disabled={sending === `now-${type}`} onClick={() => sendNow(type)}>
                Send now to recipients
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />Contest email reports</h2>
        <p className="text-sm text-muted-foreground">Daily leaderboard summaries and the winners announcement, sent only to people on this contest's list.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ScheduleCard type="contest_daily" title="Daily contest summary" description="Sent every morning while the contest is live: leaderboard, new entries, prize reminder." />
        <ScheduleCard type="draw_closed" title="Winners announcement" description="Triggered manually when judging is complete. Toggle on to allow sending." />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contest recipients</CardTitle>
          <p className="text-xs text-muted-foreground">These people receive emails for this contest only — independent of the campaign's main list.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-[1fr_1fr_140px_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@brand.com" />
            </div>
            <div>
              <Label className="text-xs">Name (optional)</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={newAudience} onValueChange={(v: any) => setNewAudience(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="extra">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addRecipient}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </div>

          <div className="rounded-md border divide-y">
            {recipients.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">No recipients yet.</div>
            )}
            {recipients.map((r) => (
              <div key={r.id} className="p-3 grid md:grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-sm">
                <div>
                  <div className="font-medium">{r.name || r.email}</div>
                  {r.name && <div className="text-xs text-muted-foreground">{r.email}</div>}
                  <Badge variant="secondary" className="mt-1 text-[10px] uppercase">{r.audience}</Badge>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={r.receives_contest_daily} onCheckedChange={() => toggleRecipient(r, "receives_contest_daily")} />
                  Daily
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={r.receives_draw_closed} onCheckedChange={() => toggleRecipient(r, "receives_draw_closed")} />
                  Winners
                </label>
                <Button size="icon" variant="ghost" onClick={() => removeRecipient(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
    </div>
  );
}
