import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare, Inbox, Search, Sparkles, Send, EyeOff, Flag, Trash2,
  CheckCircle2, AlertTriangle, HelpCircle, Heart, Bot, User2, Clock, Link2, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";

type Platform = "tiktok" | "instagram" | "facebook" | "x" | "youtube";
type Sentiment = "praise" | "question" | "spam" | "toxic" | "neutral";
type Status = "open" | "replied" | "hidden" | "flagged" | "resolved";

interface Comment {
  id: string;
  platform: Platform;
  campaign: string;
  client: string;
  influencer: string;
  postCaption: string;
  author: string;
  authorAvatar?: string;
  body: string;
  sentiment: Sentiment;
  status: Status;
  createdAt: string;
  likes: number;
  replies: number;
  ownedByClient: boolean; // true => client/agency can directly moderate; false => influencer-owned post
  aiSuggestion?: string;
}

const MOCK: Comment[] = [
  { id: "c1", platform: "tiktok", campaign: "Vaseline · New Skin", client: "Unilever", influencer: "@wanjiku.k",
    postCaption: "My 7-day Vaseline glow-up routine ✨ #VaselineNewSkin",
    author: "@beauty_nai", body: "Where can I buy this in Nairobi? Is it at Naivas?",
    sentiment: "question", status: "open", createdAt: "2026-05-07T11:42:00Z",
    likes: 12, replies: 0, ownedByClient: true,
    aiSuggestion: "Hi! Yes — it's available at Naivas, Carrefour and Quickmart countrywide. You can also order on Jumia." },
  { id: "c2", platform: "instagram", campaign: "Royco Mtaani", client: "Unilever", influencer: "@chefmamake",
    postCaption: "Pilau night with Royco 🍛", author: "spam_bot_2025",
    body: "🔥🔥 FREE iPhone giveaway click my bio link now!!!", sentiment: "spam",
    status: "open", createdAt: "2026-05-07T10:15:00Z", likes: 0, replies: 0, ownedByClient: true },
  { id: "c3", platform: "tiktok", campaign: "Vaseline · New Skin", client: "Unilever", influencer: "@skin.with.amani",
    postCaption: "Real talk on my eczema journey", author: "@hater_acc",
    body: "This is a scam, you're paid to lie to us 🤡", sentiment: "toxic",
    status: "open", createdAt: "2026-05-07T09:02:00Z", likes: 1, replies: 3, ownedByClient: false },
  { id: "c4", platform: "facebook", campaign: "Safaricom · Fuliza Boost", client: "Safaricom", influencer: "@mc.jessy",
    postCaption: "How Fuliza saved my month-end", author: "Mary Wambui",
    body: "I've been using Fuliza for 2 years, never let me down 💚", sentiment: "praise",
    status: "open", createdAt: "2026-05-07T08:30:00Z", likes: 47, replies: 2, ownedByClient: true },
  { id: "c5", platform: "x", campaign: "Safaricom · Fuliza Boost", client: "Safaricom", influencer: "@kelvin_ke",
    postCaption: "Thread: 5 ways Fuliza beats overdrafts", author: "@questioner",
    body: "What's the interest rate now after the Nov update?", sentiment: "question",
    status: "open", createdAt: "2026-05-07T07:11:00Z", likes: 4, replies: 0, ownedByClient: true,
    aiSuggestion: "Great question! The current Fuliza access fee is 1.083% per day. Full breakdown at safaricom.co.ke/fuliza." },
  { id: "c6", platform: "instagram", campaign: "Vaseline · New Skin", client: "Unilever", influencer: "@wanjiku.k",
    postCaption: "My 7-day Vaseline glow-up", author: "@reginah_m",
    body: "Day 3 and my elbows are already smoother, asanteni!", sentiment: "praise",
    status: "replied", createdAt: "2026-05-06T22:40:00Z", likes: 22, replies: 1, ownedByClient: true },
  { id: "c7", platform: "tiktok", campaign: "Royco Mtaani", client: "Unilever", influencer: "@chefmamake",
    postCaption: "Pilau night with Royco", author: "@trolly99",
    body: "Royco ni MSG tu, mnatudanganya watu", sentiment: "toxic",
    status: "hidden", createdAt: "2026-05-06T19:12:00Z", likes: 0, replies: 0, ownedByClient: true },
];

const platformDot: Record<Platform, string> = {
  tiktok: "bg-foreground", instagram: "bg-pink-500", facebook: "bg-blue-600",
  x: "bg-foreground", youtube: "bg-red-600",
};

const sentimentMeta: Record<Sentiment, { label: string; cls: string; Icon: any }> = {
  praise:   { label: "Praise",   cls: "bg-success/15 text-success border-success/30",       Icon: Heart },
  question: { label: "Question", cls: "bg-accent/20 text-accent-foreground border-accent/40", Icon: HelpCircle },
  spam:     { label: "Spam",     cls: "bg-muted text-muted-foreground border-border",       Icon: AlertTriangle },
  toxic:    { label: "Toxic",    cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
  neutral:  { label: "Neutral",  cls: "bg-muted text-muted-foreground border-border",       Icon: MessageSquare },
};

const timeAgo = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

const Moderation = ({ readOnly = false }: { readOnly?: boolean }) => {
  const [items, setItems] = useState<Comment[]>(MOCK);
  const [tab, setTab] = useState<"all" | "open" | "questions" | "toxic" | "praise" | "resolved">("open");
  const [campaign, setCampaign] = useState<string>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(MOCK[0].id);
  const [reply, setReply] = useState("");
  const [shareToken] = useState<string>(() => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10));
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/m/${shareToken}` : "";
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); toast.success("Share link copied"); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Could not copy"); }
  };

  const campaigns = useMemo(() => Array.from(new Set(MOCK.map(m => m.campaign))), []);

  const filtered = useMemo(() => items.filter(c => {
    if (tab === "open" && c.status !== "open") return false;
    if (tab === "questions" && c.sentiment !== "question") return false;
    if (tab === "toxic" && c.sentiment !== "toxic") return false;
    if (tab === "praise" && c.sentiment !== "praise") return false;
    if (tab === "resolved" && !["replied","resolved","hidden"].includes(c.status)) return false;
    if (campaign !== "all" && c.campaign !== campaign) return false;
    if (platform !== "all" && c.platform !== platform) return false;
    if (search && !(c.body.toLowerCase().includes(search.toLowerCase()) || c.author.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [items, tab, campaign, platform, search]);

  const selected = filtered.find(c => c.id === selectedId) ?? filtered[0];

  const counts = useMemo(() => ({
    open: items.filter(i => i.status === "open").length,
    questions: items.filter(i => i.sentiment === "question" && i.status === "open").length,
    toxic: items.filter(i => i.sentiment === "toxic" && i.status === "open").length,
    praise: items.filter(i => i.sentiment === "praise").length,
  }), [items]);

  const setStatus = (id: string, status: Status) =>
    setItems(prev => prev.map(c => c.id === id ? { ...c, status } : c));

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Listening</div>
          <h1 className="font-display text-3xl flex items-center gap-2"><Inbox className="w-6 h-6" /> Moderation inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All comments across every campaign post — auto-classified, ready to reply, hide or escalate.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="bg-accent/20 border-accent/40">{counts.open} open</Badge>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">{counts.toxic} toxic</Badge>
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">{counts.praise} praise</Badge>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={copyShare} className="ml-2 h-7">
              {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
              {copied ? "Copied" : "Share link"}
            </Button>
          )}
        </div>
      </header>

      {!readOnly && (
        <div className="mb-4 p-3 rounded-md border border-border bg-muted/30 flex items-center gap-2 text-xs">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <code className="flex-1 truncate text-muted-foreground">{shareUrl}</code>
          <Button size="sm" variant="ghost" onClick={copyShare} className="h-7 text-xs">
            <Copy className="w-3 h-3 mr-1" />Copy
          </Button>
          <span className="text-muted-foreground hidden sm:inline">Read-only public view</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="open">Open · {counts.open}</TabsTrigger>
            <TabsTrigger value="questions">Questions · {counts.questions}</TabsTrigger>
            <TabsTrigger value="toxic">Toxic · {counts.toxic}</TabsTrigger>
            <TabsTrigger value="praise">Praise</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <Select value={campaign} onValueChange={setCampaign}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="x">X</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search comments…" className="pl-8 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* List */}
        <Card className="p-0 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
            {filtered.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No comments match these filters.</div>
            )}
            {filtered.map(c => {
              const meta = sentimentMeta[c.sentiment];
              const active = selected?.id === c.id;
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${active ? "bg-secondary/40" : ""}`}>
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 mt-2 rounded-full ${platformDot[c.platform]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium truncate">{c.author}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground capitalize">{c.platform}</span>
                        <span className="text-muted-foreground ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(c.createdAt)}</span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2">{c.body}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${meta.cls}`}>
                          <meta.Icon className="w-2.5 h-2.5 mr-1" />{meta.label}
                        </Badge>
                        {c.status !== "open" && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize">{c.status}</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto truncate">{c.campaign}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Detail */}
        {selected ? (
          <Card className="p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{selected.client} · {selected.campaign}</div>
                <div className="font-display text-lg mt-0.5">{selected.postCaption}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Posted by <span className="font-medium text-foreground">{selected.influencer}</span> on <span className="capitalize">{selected.platform}</span>
                  {!selected.ownedByClient && (
                    <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 bg-muted">Influencer-owned · read-only</Badge>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={sentimentMeta[selected.sentiment].cls}>
                {sentimentMeta[selected.sentiment].label}
              </Badge>
            </div>

            <div className="py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                  {selected.author.replace(/[@_.]/g, "").slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{selected.author}</span> · {timeAgo(selected.createdAt)} ago · ❤ {selected.likes} · 💬 {selected.replies}
                  </div>
                  <p className="text-sm mt-1.5 leading-relaxed">{selected.body}</p>
                </div>
              </div>

              {selected.aiSuggestion && (
                <div className="mt-4 p-3 rounded-md border border-accent/40 bg-accent/10">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-accent-foreground mb-1.5">
                    <Sparkles className="w-3 h-3" /> AI suggested reply
                  </div>
                  <p className="text-sm">{selected.aiSuggestion}</p>
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setReply(selected.aiSuggestion!)}>
                    Use this reply
                  </Button>
                </div>
              )}
            </div>

            {!readOnly && <div className="mt-auto border-t border-border pt-4 space-y-3">
              <div className="space-y-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder={selected.ownedByClient ? "Write a reply…" : "Note for influencer (will be sent via WhatsApp)…"}
                  className="w-full text-sm border border-border rounded-md p-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" disabled={!reply.trim()} onClick={() => { setStatus(selected.id, "replied"); setReply(""); }}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {selected.ownedByClient ? "Reply" : "Send to influencer"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selected.ownedByClient} onClick={() => setStatus(selected.id, "hidden")}>
                    <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, "flagged")}>
                    <Flag className="w-3.5 h-3.5 mr-1.5" /> Flag
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selected.ownedByClient} onClick={() => setStatus(selected.id, "resolved")}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => setStatus(selected.id, "resolved")}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark resolved
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Bot className="w-3 h-3" /> Auto-rules: hide spam · auto-reply praise · escalate toxic to account manager
                <span className="ml-auto flex items-center gap-1"><User2 className="w-3 h-3" /> Assign</span>
              </div>
            </div>}
          </Card>
        ) : (
          <Card className="p-10 flex items-center justify-center text-sm text-muted-foreground">
            Select a comment to moderate.
          </Card>
        )}
      </div>
    </div>
  );
};

export default Moderation;
