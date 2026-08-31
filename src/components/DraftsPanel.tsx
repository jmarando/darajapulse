import { publicOrigin } from "@/lib/appUrl";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, Copy, ExternalLink, FileVideo, MessageSquareWarning, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Draft = {
  id: string;
  file_path: string;
  file_name: string | null;
  platform: string | null;
  caption: string | null;
  creator_note: string | null;
  status: string;
  review_note: string | null;
  reviewer_label: string | null;
  reviewed_at: string | null;
  created_at: string;
  post_url: string | null;
  influencers?: { full_name?: string | null; handle?: string | null } | null;
};

const TABS = [
  ["pending", "Awaiting approval"],
  ["approved", "Approved"],
  ["changes_requested", "Changes requested"],
  ["all", "All"],
] as const;

export const DraftsPanel = ({ campaignId }: { campaignId: string }) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewLink, setReviewLink] = useState<string | null>(null);
  const [required, setRequired] = useState(false);

  const load = async () => {
    const [{ data }, { data: link }, { data: camp }] = await Promise.all([
      supabase
        .from("creator_drafts" as any)
        .select("*, influencers(full_name, handle)")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      supabase.from("draft_links" as any).select("token").eq("campaign_id", campaignId).eq("is_active", true).limit(1).maybeSingle(),
      supabase.from("campaigns").select("require_draft_approval" as any).eq("id", campaignId).maybeSingle(),
    ]);
    const list = ((data as any) ?? []) as Draft[];
    setDrafts(list);
    setRequired(Boolean((camp as any)?.require_draft_approval));
    setReviewLink((link as any)?.token ? `${publicOrigin()}/d/${(link as any).token}` : null);

    const signed: Record<string, string> = {};
    await Promise.all(
      list.map(async (d) => {
        const { data: s } = await supabase.storage.from("creator-drafts").createSignedUrl(d.file_path, 60 * 60 * 6);
        if (s?.signedUrl) signed[d.id] = s.signedUrl;
      }),
    );
    setUrls(signed);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const counts = useMemo(() => ({
    pending: drafts.filter((d) => d.status === "pending").length,
    approved: drafts.filter((d) => d.status === "approved").length,
    changes_requested: drafts.filter((d) => d.status === "changes_requested").length,
    all: drafts.length,
  }), [drafts]);

  const rows = tab === "all" ? drafts : drafts.filter((d) => d.status === tab);

  const decide = async (d: Draft, decision: "approved" | "changes_requested") => {
    const note = (notes[d.id] || "").trim();
    if (decision === "changes_requested" && note.length < 3) return toast.error("Add a note so the creator knows what to fix");
    setBusy(d.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("creator_drafts" as any)
      .update({
        status: decision,
        review_note: note || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id ?? null,
        reviewer_label: user?.email ?? "Agency",
      })
      .eq("id", d.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Approved — the creator can now post and share the link" : "Sent back for changes");
    load();
  };

  const createLink = async () => {
    const { data, error } = await supabase
      .from("draft_links" as any)
      .insert({ campaign_id: campaignId, label: "Client review" })
      .select("token")
      .single();
    if (error) return toast.error(error.message);
    setReviewLink(`${publicOrigin()}/d/${(data as any).token}`);
    toast.success("Client review link created");
  };

  const toggleRequired = async (v: boolean) => {
    const { error } = await supabase.from("campaigns").update({ require_draft_approval: v } as any).eq("id", campaignId);
    if (error) return toast.error(error.message);
    setRequired(v);
    toast.success(v ? "Creators must get a video approved before posting" : "Draft approval is now optional");
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Step 1 · Before posting</div>
            <h3 className="font-display text-xl mt-1">Video approvals</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Creators upload the MP4 from their brief link. Approve it here — or share the client review link so
              Unilever can watch and sign off without logging in. Only once a video is approved can that creator
              submit the live post URL.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-md border border-border p-2 px-3">
            <Switch id="req" checked={required} onCheckedChange={toggleRequired} />
            <Label htmlFor="req" className="text-xs">Require an approved video before a live link</Label>
          </div>
          {reviewLink ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 p-2 px-3">
              <span className="text-xs text-muted-foreground">Client review link</span>
              <code className="text-xs break-all">{reviewLink}</code>
              <Button variant="outline" size="sm" className="h-7" onClick={() => { navigator.clipboard.writeText(reviewLink); toast.success("Copied"); }}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
              </Button>
              <a href={reviewLink} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" className="h-7"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open</Button>
              </a>
            </div>
          ) : (
            <Button size="sm" onClick={createLink}>Create client review link</Button>
          )}
        </div>
      </Card>

      <div className="flex gap-1 rounded-md border border-border p-1 w-fit">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 h-7 rounded text-xs transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <FileVideo className="w-6 h-6 mx-auto mb-2 opacity-60" />
          <div className="text-sm">No videos here yet.</div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => (
            <Card key={d.id} className="p-0 overflow-hidden flex flex-col">
              <div className="bg-black aspect-[9/16] max-h-[420px]">
                {urls[d.id] ? (
                  <video src={urls[d.id]} controls playsInline className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
                )}
              </div>
              <div className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.influencers?.full_name || "Unknown creator"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {d.influencers?.handle ? `@${String(d.influencers.handle).replace(/^@/, "")}` : d.file_name}
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
                {d.post_url && (
                  <a href={d.post_url} target="_blank" rel="noreferrer" className="text-xs text-accent inline-flex items-center gap-1 truncate">
                    <ExternalLink className="w-3 h-3" /> Live post submitted
                  </a>
                )}

                {d.status !== "approved" && (
                  <div className="mt-auto space-y-2">
                    <Textarea
                      value={notes[d.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                      placeholder="Feedback for the creator (required to request changes)…"
                      className="text-xs min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-8" disabled={busy === d.id} onClick={() => decide(d, "approved")}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-8" disabled={busy === d.id} onClick={() => decide(d, "changes_requested")}>
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
    </div>
  );
};

export default DraftsPanel;
