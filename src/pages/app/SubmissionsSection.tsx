import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Copy, Inbox, RefreshCw, Check, X } from "lucide-react";
import { toast } from "sonner";

type Entry = {
  id: string;
  full_name?: string | null;
  handle?: string | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  platform?: string | null;
  post_url?: string | null;
  status?: string | null;
  source?: string | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  created_at?: string | null;
  posted_at?: string | null;
};

const csvCell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export const SubmissionsSection = ({
  entries,
  submissionToken,
  campaignName,
  onRefresh,
}: {
  entries: Entry[];
  submissionToken: string | null;
  campaignName?: string;
  onRefresh?: () => void;
}) => {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => ({
    pending: entries.filter((e) => (e.status || "pending") === "pending").length,
    approved: entries.filter((e) => e.status === "approved").length,
    rejected: entries.filter((e) => e.status === "rejected").length,
    all: entries.length,
  }), [entries]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = [...entries].sort(
      (a, b) => +new Date(b.created_at || 0) - +new Date(a.created_at || 0),
    );
    if (tab !== "all") list = list.filter((e) => (e.status || "pending") === tab);
    if (!needle) return list;
    return list.filter((e) =>
      [e.full_name, e.submitter_name, e.handle, e.platform, e.post_url, e.submitter_email]
        .some((f) => String(f || "").toLowerCase().includes(needle)),
    );
  }, [entries, q, tab]);

  const review = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase.rpc("review_contest_entry" as any, { _entry_id: id, _decision: decision });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Approved — post added to the campaign" : "Submission declined");
    onRefresh?.();
  };


  const publicUrl = submissionToken ? `${window.location.origin}/c/${submissionToken}` : null;

  const exportCsv = () => {
    const header = ["Creator", "Handle", "Email", "Platform", "Post URL", "Submitted", "Posted", "Views", "Likes", "Comments", "Source", "Status"];
    const body = rows.map((e) => [
      e.full_name || e.submitter_name || "",
      e.handle || "",
      e.submitter_email || "",
      e.platform || "",
      e.post_url || "",
      e.created_at ? new Date(e.created_at).toISOString().slice(0, 16).replace("T", " ") : "",
      e.posted_at ? new Date(e.posted_at).toISOString().slice(0, 10) : "",
      e.views ?? "",
      e.likes ?? "",
      e.comments ?? "",
      e.source || "",
      e.status || "",
    ]);
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(campaignName || "campaign").replace(/[^a-z0-9]+/gi, "_")}_submissions.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Where submissions land</div>
            <h3 className="font-display text-xl mt-1">Live submissions feed</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Every post link a creator submits — through the open form or their personal link in the brief —
              appears here instantly. Metrics fill in automatically on the next refresh, and you can export the
              whole list to CSV for Google Sheets at any time.
            </p>
          </div>
          <div className="flex gap-2">
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
            )}
            <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {publicUrl && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 p-3">
            <span className="text-xs text-muted-foreground">Open submission form</span>
            <code className="text-xs break-all">{publicUrl}</code>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copied"); }}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
            </Button>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" className="h-7"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open</Button>
            </a>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creator, handle or link…" className="max-w-sm h-9" />
          <span className="text-xs text-muted-foreground">{rows.length} submission{rows.length === 1 ? "" : "s"}</span>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Inbox className="w-6 h-6 mx-auto mb-2 opacity-60" />
            <div className="text-sm">No submissions yet. Share the link above or send briefs — entries appear here the moment a creator posts.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Creator</th>
                  <th className="text-left font-medium px-4 py-2">Platform</th>
                  <th className="text-left font-medium px-4 py-2">Post</th>
                  <th className="text-right font-medium px-4 py-2">Views</th>
                  <th className="text-left font-medium px-4 py-2">Submitted</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-border/60">
                    <td className="px-4 py-2">
                      <div className="font-medium truncate max-w-[220px]">{e.full_name || e.submitter_name || "—"}</div>
                      {e.handle && <div className="text-xs text-muted-foreground truncate max-w-[220px]">@{String(e.handle).replace(/^@/, "")}</div>}
                    </td>
                    <td className="px-4 py-2 capitalize">{e.platform || "—"}</td>
                    <td className="px-4 py-2">
                      {e.post_url ? (
                        <a href={e.post_url} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1 text-xs break-all max-w-[280px]">
                          <ExternalLink className="w-3 h-3 shrink-0" /> <span className="truncate">{e.post_url}</span>
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(e.views || 0).toLocaleString()}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {e.created_at ? new Date(e.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="capitalize text-[10px]">{e.status || "received"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SubmissionsSection;
