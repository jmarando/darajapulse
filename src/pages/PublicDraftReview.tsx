import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Download, FileVideo, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { downloadFile } from "@/lib/downloadFile";
import { DraftVideo } from "@/components/DraftVideo";


type Draft = {
  id: string;
  file_name: string | null;
  platform: string | null;
  caption: string | null;
  creator_note: string | null;
  status: string;
  review_note: string | null;
  reviewer_label: string | null;
  created_at: string;
  post_url: string | null;
  creator_name: string | null;
  creator_handle: string | null;
  video_url: string | null;
  has_video?: boolean;
  poster_url: string | null;
};

const TABS = [
  ["pending", "To review"],
  ["approved", "Approved"],
  ["changes_requested", "Changes requested"],
  ["all", "All"],
] as const;

const PublicDraftReview = () => {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pending");
  const [reviewer, setReviewer] = useState(localStorage.getItem("dp_reviewer") || "");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [visible, setVisible] = useState(9);
  const [confirmId, setConfirmId] = useState<string | null>(null);


  const load = async () => {
    const { data: res, error: err } = await supabase.functions.invoke("draft-review", { body: { token, action: "list" } });
    if (err) return setError("We couldn't open this review link.");
    if ((res as any)?.error) return setError((res as any).error);
    setData(res);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  /** Ask the server for a signed URL for one video, only when it is needed. */
  const signOne = async (draftId: string, download?: string): Promise<string | null> => {
    const { data: res, error: err } = await supabase.functions.invoke("draft-review", {
      body: { token, action: "sign", draft_id: draftId, download: download ?? null },
    });
    if (err || (res as any)?.error || !(res as any)?.url) return null;
    return (res as any).url as string;
  };

  const decide = async (d: Draft, decision: "approved" | "changes_requested") => {
    const note = (notes[d.id] || "").trim();
    if (decision === "changes_requested" && note.length < 3) return toast.error("Please say what needs changing");
    if (!reviewer.trim()) return toast.error("Add your name so the team knows who approved");
    localStorage.setItem("dp_reviewer", reviewer.trim());
    setBusy(d.id);
    const { data: res, error: err } = await supabase.functions.invoke("draft-review", {
      body: { token, action: "decide", draft_id: d.id, decision, note, reviewer: reviewer.trim() },
    });
    setBusy(null);
    if (err || (res as any)?.error) return toast.error((res as any)?.error || "Something went wrong");
    toast.success(decision === "approved" ? "Approved" : "Sent back to the creator");
    load();
  };

  if (error) return <div className="min-h-screen flex items-center justify-center p-10 text-center text-muted-foreground">{error}</div>;
  if (!data) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  const drafts: Draft[] = data.drafts ?? [];
  const counts = {
    pending: drafts.filter((d) => d.status === "pending").length,
    approved: drafts.filter((d) => d.status === "approved").length,
    changes_requested: drafts.filter((d) => d.status === "changes_requested").length,
    all: drafts.length,
  };
  const rows = tab === "all" ? drafts : drafts.filter((d) => d.status === tab);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {data.campaign?.client?.logo_url && <img src={data.campaign.client.logo_url} alt={data.campaign.client.name} loading="lazy" className="h-7 w-auto" />}
            <div className="min-w-0">
              <div className="font-display text-sm truncate">{data.campaign?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{counts.pending} waiting</div>
            </div>
          </div>
          <Input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="Your name"
            className="h-9 w-28 sm:w-52 shrink-0"
          />
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Watch each video before it goes live. Approve it and the creator can publish and share the live link —
          request changes and it goes straight back to them with your note.
        </p>

        <div className="flex gap-1 rounded-md border border-border p-1 overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setVisible(9); }}
              className={`px-3 h-8 rounded text-xs whitespace-nowrap transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <FileVideo className="w-6 h-6 mx-auto mb-2 opacity-60" />
            <div className="text-sm">Nothing here right now.</div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.slice(0, visible).map((d) => (
              <Card key={d.id} className="p-0 overflow-hidden flex flex-col">
                <DraftVideo getUrl={() => signOne(d.id)} poster={d.poster_url} label={d.creator_name} />

                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{d.creator_name || "Creator"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {d.creator_handle ? `@${String(d.creator_handle).replace(/^@/, "")}` : d.file_name}
                        {d.platform ? ` · ${d.platform}` : ""}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${d.status === "approved" ? "border-success/40 text-success" : d.status === "changes_requested" ? "border-destructive/40 text-destructive" : ""}`}
                    >
                      {d.status === "changes_requested" ? "changes" : d.status}
                    </Badge>
                  </div>

                  {d.caption && <p className="text-xs text-muted-foreground line-clamp-3">{d.caption}</p>}
                  {d.review_note && (
                    <p className="text-xs rounded-md bg-secondary/50 p-2">
                      <span className="text-muted-foreground">{d.reviewer_label || "Reviewer"}:</span> {d.review_note}
                    </p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full"
                    onClick={async () => {
                      const name = d.file_name || `${d.creator_name || "video"}.mp4`;
                      const u = await signOne(d.id, name);
                      if (!u) return toast.error("Video unavailable");
                      downloadFile(u, name);
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download video
                  </Button>

                  {data.can_decide && d.status !== "approved" && (
                    <div className="mt-auto space-y-2">
                      <Textarea
                        value={notes[d.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                        placeholder="Feedback for the creator…"
                        className="text-xs min-h-[60px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-10"
                          disabled={busy === d.id}
                          onClick={() => {
                            if (confirmId === d.id) return decide(d, "approved");
                            setConfirmId(d.id);
                            setTimeout(() => setConfirmId((c) => (c === d.id ? null : c)), 4000);
                          }}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> {confirmId === d.id ? "Tap again to confirm" : "Approve"}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-10" disabled={busy === d.id} onClick={() => decide(d, "changes_requested")}>
                          <MessageSquareWarning className="w-3.5 h-3.5 mr-1" /> Changes
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {rows.length > visible && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setVisible((v) => v + 9)}>
              Show more ({rows.length - visible} left)
            </Button>
          </div>
        )}

      </main>
    </div>
  );
};

export default PublicDraftReview;
