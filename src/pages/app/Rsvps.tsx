import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, Check, X, RefreshCw, Loader2, Download, Search } from "lucide-react";
import { toast } from "sonner";

type Row = {
  influencer_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  invited: boolean;
  inviteStatus: string | null;
  rsvp: "yes" | "no" | "maybe" | null;
  source: string | null;
  respondedAt: string | null;
};

const rsvpBadge = (r: Row["rsvp"]) => {
  if (r === "yes") return <Badge className="bg-success/15 text-success">Coming</Badge>;
  if (r === "no") return <Badge className="bg-destructive/15 text-destructive">Not coming</Badge>;
  if (r === "maybe") return <Badge className="bg-highlight/20 text-foreground">Maybe</Badge>;
  return <Badge variant="secondary">No reply</Badge>;
};

const Rsvps = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "yes" | "no" | "pending">("all");

  useEffect(() => {
    supabase
      .from("campaigns")
      .select("id,name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCampaigns(data ?? []);
        if (data?.length && !campaignId) setCampaignId(data[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    if (!campaignId) return;
    setLoading(true);

    const { data: ci } = await supabase
      .from("campaign_influencers")
      .select("influencer_id, influencers(id, full_name, email, phone_mpesa)")
      .eq("campaign_id", campaignId);

    const roster = (ci ?? [])
      .map((r: any) => r.influencers)
      .filter((i: any) => i?.email)
      .map((i: any) => ({
        influencer_id: i.id as string,
        name: (i.full_name || "") as string,
        email: String(i.email).trim().toLowerCase(),
        phone: (i.phone_mpesa || null) as string | null,
      }));

    const emails = roster.map((r) => r.email);

    // Invite delivery status from the email log
    const sent = new Map<string, string>();
    for (let i = 0; i < emails.length; i += 200) {
      const chunk = emails.slice(i, i + 200);
      const { data } = await supabase
        .from("email_send_log")
        .select("recipient_email, status, created_at")
        .in("recipient_email", chunk)
        .order("created_at", { ascending: true });
      (data ?? []).forEach((r: any) => sent.set(String(r.recipient_email).toLowerCase(), r.status));
    }

    const { data: rsvps } = await supabase
      .from("event_rsvps")
      .select("email, status, source, responded_at")
      .eq("campaign_id", campaignId);
    const rsvpMap = new Map((rsvps ?? []).map((r: any) => [String(r.email).toLowerCase(), r]));

    setRows(
      roster.map((r) => {
        const rv = rsvpMap.get(r.email);
        return {
          ...r,
          invited: sent.has(r.email),
          inviteStatus: sent.get(r.email) ?? null,
          rsvp: (rv?.status as any) ?? null,
          source: rv?.source ?? null,
          respondedAt: rv?.responded_at ?? null,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const setRsvp = async (row: Row, status: "yes" | "no" | "maybe" | null) => {
    if (!campaignId) return;
    if (status === null) {
      const { error } = await supabase.from("event_rsvps").delete().eq("campaign_id", campaignId).eq("email", row.email);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("event_rsvps").upsert(
        {
          campaign_id: campaignId,
          influencer_id: row.influencer_id,
          email: row.email,
          name: row.name,
          status,
          source: "manual",
          responded_at: new Date().toISOString(),
        },
        { onConflict: "campaign_id,email" },
      );
      if (error) return toast.error(error.message);
    }
    setRows((rs) => rs.map((r) => (r.email === row.email ? { ...r, rsvp: status, source: "manual" } : r)));
  };

  const stats = useMemo(() => {
    const yes = rows.filter((r) => r.rsvp === "yes").length;
    const no = rows.filter((r) => r.rsvp === "no").length;
    const maybe = rows.filter((r) => r.rsvp === "maybe").length;
    const invited = rows.filter((r) => r.invited).length;
    const failed = rows.filter((r) => r.inviteStatus && r.inviteStatus !== "sent" && r.inviteStatus !== "pending").length;
    return { total: rows.length, invited, failed, yes, no, maybe, pending: rows.length - yes - no - maybe };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "yes" && r.rsvp !== "yes") return false;
      if (filter === "no" && r.rsvp !== "no") return false;
      if (filter === "pending" && r.rsvp) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle) || r.email.includes(needle);
    });
  }, [rows, q, filter]);

  const exportCsv = () => {
    const header = ["Name", "Email", "Phone", "Invite", "RSVP", "Source", "Responded"];
    const lines = visible.map((r) =>
      [r.name, r.email, r.phone ?? "", r.inviteStatus ?? "not sent", r.rsvp ?? "no reply", r.source ?? "", r.respondedAt ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rsvps.csv";
    a.click();
  };

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <Card className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-semibold tabular-nums mt-1">{value}</p>
    </Card>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold flex items-center gap-2">
            <CalendarCheck className="w-7 h-7 text-accent" /> RSVPs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Who has confirmed for the kick-off. Replies to the campaign mailbox are captured automatically; you can also set a
            response by hand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-2" /> CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="On roster" value={stats.total} />
        <Stat label="Invites sent" value={stats.invited} />
        <Stat label="Coming" value={stats.yes} />
        <Stat label="Not coming" value={stats.no} />
        <Stat label="No reply" value={stats.pending} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {(["all", "yes", "no", "pending"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "yes" ? "Coming" : f === "no" ? "Not coming" : "No reply"}
          </Button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left">
            <tr>
              <th className="p-3 font-semibold">Creator</th>
              <th className="p-3 font-semibold">Invite</th>
              <th className="p-3 font-semibold">RSVP</th>
              <th className="p-3 font-semibold text-right">Set</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.email} className="border-t border-border">
                <td className="p-3">
                  <div className="font-medium">{r.name || r.email}</div>
                  <div className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                </td>
                <td className="p-3">
                  {r.invited ? (
                    <Badge variant="secondary" className="capitalize">{r.inviteStatus}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">not sent</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {rsvpBadge(r.rsvp)}
                    {r.source === "email" && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">auto</span>}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant={r.rsvp === "yes" ? "default" : "outline"} onClick={() => setRsvp(r, r.rsvp === "yes" ? null : "yes")}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant={r.rsvp === "no" ? "destructive" : "outline"} onClick={() => setRsvp(r, r.rsvp === "no" ? null : "no")}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">No creators match this view.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default Rsvps;
