import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, Send, Search, Inbox as InboxIcon } from "lucide-react";

type Thread = {
  id: string;
  mailbox: string;
  participant_email: string;
  participant_name: string | null;
  subject: string | null;
  last_message_at: string;
  last_snippet: string | null;
  unread_count: number;
  status: string;
  influencer_id: string | null;
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

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const Inbox = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState("");

  const loadThreads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_threads")
      .select("id, mailbox, participant_email, participant_name, subject, last_message_at, last_snippet, unread_count, status, influencer_id")
      .order("last_message_at", { ascending: false })
      .limit(200);
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
  };

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  // Live updates when new mail lands
  useEffect(() => {
    const channel = supabase
      .channel("inbox-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, () => loadThreads())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, () => {
        if (activeId) loadMessages(activeId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((t) =>
      [t.participant_email, t.participant_name, t.subject, t.mailbox, t.last_snippet]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [threads, q]);

  const active = threads.find((t) => t.id === activeId) || null;
  const unreadTotal = threads.reduce((s, t) => s + (t.unread_count || 0), 0);

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
    loadMessages(active.id);
    loadThreads();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <InboxIcon className="w-5 h-5 text-accent" /> Inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Replies from creators land here. {unreadTotal > 0 ? `${unreadTotal} unread.` : "All caught up."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadThreads} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="p-3 h-[70vh] flex flex-col">
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="pl-8" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filtered.length === 0 && !loading && (
              <div className="text-sm text-muted-foreground p-4 text-center">No conversations yet.</div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                  activeId === t.id ? "bg-accent/15" : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{t.participant_name || t.participant_email}</span>
                  {t.unread_count > 0 && <Badge className="h-5 px-1.5 text-[10px]">{t.unread_count}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{t.subject || "(no subject)"}</div>
                <div className="text-[11px] text-muted-foreground/80 truncate">{t.last_snippet}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmt(t.last_message_at)}</div>
              </button>
            ))}
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
              <div className="pb-3 border-b">
                <div className="font-medium">{active.subject || "(no subject)"}</div>
                <div className="text-xs text-muted-foreground">
                  {active.participant_name ? `${active.participant_name} · ` : ""}
                  {active.participant_email} · via {active.mailbox}
                </div>
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
