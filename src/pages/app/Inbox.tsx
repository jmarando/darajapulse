import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { refreshNavCounts } from "@/hooks/useNavCounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, RefreshCw, RotateCcw, Send, Search, Inbox as InboxIcon } from "lucide-react";

type Thread = {
  id: string;
  agency_id: string | null;
  mailbox: string;
  participant_email: string;
  participant_name: string | null;
  subject: string | null;
  last_message_at: string;
  last_snippet: string | null;
  unread_count: number;
  status: string;
  influencer_id: string | null;
  assigned_to: string | null;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  created_at: string;
};

type Teammate = { id: string; name: string };
type CreatorContext = { campaigns: { id: string; name: string }[]; drafts: Record<string, number> };
type View = "open" | "mine" | "unassigned" | "done";

const UNASSIGNED = "__unassigned__";
const DRAFT_LABELS: Record<string, string> = { pending: "awaiting review", changes_requested: "changes requested", approved: "approved" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

const Inbox = () => {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("open");
  const [mailbox, setMailbox] = useState("all");
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [context, setContext] = useState<CreatorContext | null>(null);

  const loadThreads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_threads")
      .select("id, agency_id, mailbox, participant_email, participant_name, subject, last_message_at, last_snippet, unread_count, status, influencer_id, assigned_to")
      .order("last_message_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setThreads((data as Thread[]) ?? []);
    setLoading(false);
  };

  const loadMessages = async (threadId: string) => {
    const { data, error } = await supabase
      .from("email_messages")
      .select("id, direction, from_email, from_name, subject, text_body, html_body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setMessages((data as Message[]) ?? []);
    await supabase.from("email_threads").update({ unread_count: 0 }).eq("id", threadId);
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)));
    refreshNavCounts();
  };

  // Staff who can pick up a conversation; names come from their profiles.
  const loadTeammates = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["agency_admin", "account_manager"]);
    const ids = Array.from(new Set([...(roles ?? []).map((r: any) => r.user_id as string), ...(user ? [user.id] : [])]));
    if (!ids.length) return;
    const { data: profs } = await (supabase as any).rpc("get_profiles_by_ids", { _ids: ids });
    const list = ids.map((id) => {
      const p = (profs ?? []).find((x: any) => x.id === id);
      return { id, name: p?.full_name || p?.email || (id === user?.id ? user?.email ?? "Me" : "Teammate") };
    });
    setTeammates(list.sort((a, b) => a.name.localeCompare(b.name)));
  };

  // What else is going on with this creator: their campaigns and drafts.
  const loadContext = async (influencerId: string) => {
    setContext(null);
    const [{ data: ci }, { data: drafts }] = await Promise.all([
      supabase.from("campaign_influencers").select("campaign_id, campaigns(id, name)").eq("influencer_id", influencerId),
      supabase.from("creator_drafts").select("status").eq("influencer_id", influencerId),
    ]);
    const campaigns = (ci ?? []).map((r: any) => r.campaigns).filter(Boolean) as { id: string; name: string }[];
    const counts: Record<string, number> = {};
    (drafts ?? []).forEach((d: any) => { counts[d.status] = (counts[d.status] ?? 0) + 1; });
    setContext({ campaigns, drafts: counts });
  };

  useEffect(() => {
    loadThreads();
    loadTeammates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  const active = threads.find((t) => t.id === activeId) || null;

  useEffect(() => {
    if (active?.influencer_id) loadContext(active.influencer_id);
    else setContext(null);
  }, [active?.influencer_id]);

  // Live updates when new mail lands
  useEffect(() => {
    const channel = supabase
      .channel("inbox-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, () => { loadThreads(); refreshNavCounts(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, () => {
        if (activeId) loadMessages(activeId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  const mailboxes = useMemo(() => Array.from(new Set(threads.map((t) => t.mailbox))).sort(), [threads]);
  const teammateName = (id: string | null) => (id ? teammates.find((t) => t.id === id)?.name ?? "Teammate" : null);

  const inView = (t: Thread, v: View) => {
    const done = t.status === "done";
    if (v === "done") return done;
    if (done) return false;
    if (v === "mine") return t.assigned_to === user?.id;
    if (v === "unassigned") return !t.assigned_to;
    return true;
  };

  const counts = useMemo(() => {
    const scoped = threads.filter((t) => mailbox === "all" || t.mailbox === mailbox);
    return (["open", "mine", "unassigned", "done"] as View[]).reduce(
      (acc, v) => ({ ...acc, [v]: scoped.filter((t) => inView(t, v)).length }),
      {} as Record<View, number>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, mailbox, user?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return threads.filter((t) => {
      if (mailbox !== "all" && t.mailbox !== mailbox) return false;
      if (!inView(t, view)) return false;
      if (!needle) return true;
      return [t.participant_email, t.participant_name, t.subject, t.mailbox, t.last_snippet]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, q, view, mailbox, user?.id]);

  const unreadTotal = threads.filter((t) => t.status !== "done").reduce((s, t) => s + (t.unread_count || 0), 0);

  const updateThread = async (id: string, patch: Partial<Pick<Thread, "status" | "assigned_to">>, message: string) => {
    const { error } = await supabase.from("email_threads").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    refreshNavCounts();
    toast.success(message);
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("email-reply", {
      body: { threadId: active.id, message: reply.trim() },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.details || (data as any)?.error || error?.message || "Could not send reply");
      return;
    }
    setReply("");
    toast.success("Reply sent");
    // Replying picks the conversation up if nobody had it yet.
    if (!active.assigned_to && user) await supabase.from("email_threads").update({ assigned_to: user.id }).eq("id", active.id);
    loadMessages(active.id);
    loadThreads();
  };

  const views: { key: View; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "mine", label: "Mine" },
    { key: "unassigned", label: "Unassigned" },
    { key: "done", label: "Done" },
  ];

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <InboxIcon className="w-5 h-5 text-accent" /> Inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Replies from creators land here. {unreadTotal > 0 ? `${unreadTotal} unread.` : "All caught up."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mailboxes.length > 1 && (
            <Select value={mailbox} onValueChange={setMailbox}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mailboxes</SelectItem>
                {mailboxes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={loadThreads} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="p-3 h-[70vh] flex flex-col">
          <div className="grid grid-cols-4 gap-1 mb-2 rounded-lg bg-muted/50 p-1">
            {views.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`whitespace-nowrap rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors ${view === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label} <span className="tabular-nums opacity-60">{counts[key] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="pl-8" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filtered.length === 0 && !loading && (
              <div className="text-sm text-muted-foreground p-4 text-center">
                {view === "done" ? "Nothing marked done yet." : view === "mine" ? "Nothing assigned to you." : "No conversations here."}
              </div>
            )}
            {filtered.map((t) => {
              const owner = teammateName(t.assigned_to);
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                    activeId === t.id ? "bg-accent/15" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${t.unread_count > 0 ? "font-semibold" : "font-medium"}`}>{t.participant_name || t.participant_email}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {owner && (
                        <span title={`Assigned to ${owner}`} className="grid size-5 place-items-center rounded-full bg-muted text-[9px] font-semibold">
                          {initials(owner)}
                        </span>
                      )}
                      {t.unread_count > 0 && <Badge className="h-5 px-1.5 text-[10px]">{t.unread_count}</Badge>}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{t.subject || "(no subject)"}</div>
                  <div className="text-[11px] text-muted-foreground/80 truncate">{t.last_snippet}</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmt(t.last_message_at)}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4 h-[70vh] flex flex-col">
          {!active ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              <div className="text-center">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Select a conversation to read and reply.
              </div>
            </div>
          ) : (
            <>
              <div className="pb-3 border-b space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{active.subject || "(no subject)"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {active.participant_name ? `${active.participant_name} · ` : ""}
                      {active.participant_email} · via {active.mailbox}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={active.assigned_to ?? UNASSIGNED}
                      onValueChange={(v) => {
                        const assigned_to = v === UNASSIGNED ? null : v;
                        updateThread(active.id, { assigned_to }, assigned_to ? `Assigned to ${teammateName(assigned_to)}` : "Unassigned");
                      }}
                    >
                      <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Assign" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {teammates.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.id === user?.id ? `${m.name} (me)` : m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {active.status === "done" ? (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => updateThread(active.id, { status: "open" }, "Reopened")}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reopen
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => updateThread(active.id, { status: "done" }, "Marked done")}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Done
                      </Button>
                    )}
                  </div>
                </div>
                {context && (context.campaigns.length > 0 || Object.keys(context.drafts).length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {context.campaigns.map((c) => (
                      <Link key={c.id} to={`/app/campaigns/${c.id}`} className="rounded-full border px-2 py-0.5 hover:bg-muted">
                        {c.name}
                      </Link>
                    ))}
                    {Object.entries(context.drafts).map(([status, n]) => (
                      <Badge key={status} variant={status === "pending" ? "default" : "secondary"} className="font-normal">
                        {n} {n === 1 ? "draft" : "drafts"} {DRAFT_LABELS[status] ?? status.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto py-3 space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${
                      m.direction === "inbound" ? "bg-muted/60" : "bg-accent/10 ml-8"
                    }`}
                  >
                    <div className="text-[11px] text-muted-foreground mb-1">
                      {m.direction === "inbound" ? m.from_name || m.from_email : "You"} · {fmt(m.created_at)}
                    </div>
                    {m.text_body ? (
                      m.text_body
                    ) : (
                      <span className="text-muted-foreground italic">(HTML message — no plain text)</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t space-y-2">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={`Reply to ${active.participant_name || active.participant_email}`}
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Send reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Inbox;
