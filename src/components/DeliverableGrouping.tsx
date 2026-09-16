import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Link2, Unlink, Sparkles, RefreshCw } from "lucide-react";
import { PublicationRow, byDeliverable, titleCase } from "@/lib/reporting";

type Suggestion = {
  id: string;
  post_id: string;
  other_post_id: string;
  reason: string | null;
  confidence: number | null;
};

const DeliverableGrouping = ({ rows, campaignId, onChanged }: {
  rows: PublicationRow[];
  campaignId: string | null;
  onChanged: () => void;
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.post_id, r])), [rows]);
  const groups = useMemo(() => byDeliverable(rows), [rows]);

  const loadSuggestions = async () => {
    if (!campaignId) return setSuggestions([]);
    const { data, error } = await supabase
      .from("deliverable_link_suggestions")
      .select("id, post_id, other_post_id, reason, confidence")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("confidence", { ascending: false })
      .limit(100);
    if (error) toast({ title: "Could not load suggestions", description: error.message, variant: "destructive" });
    setSuggestions((data as Suggestion[]) ?? []);
  };

  useEffect(() => { loadSuggestions(); }, [campaignId]);

  const scan = async () => {
    if (!campaignId) return;
    setBusy(true);
    const { error } = await supabase.rpc("refresh_deliverable_suggestions", { _campaign_id: campaignId } as any);
    setBusy(false);
    if (error) return toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    await loadSuggestions();
    toast({ title: "Scan complete", description: "Possible cross-posts are listed below for your confirmation." });
  };

  const accept = async (s: Suggestion) => {
    setBusy(true);
    const { error } = await supabase.rpc("merge_posts_into_deliverable", {
      _post_ids: [s.post_id, s.other_post_id], _target_deliverable_id: null,
    } as any);
    setBusy(false);
    if (error) return toast({ title: "Could not group these posts", description: error.message, variant: "destructive" });
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    onChanged();
  };

  const dismiss = async (s: Suggestion) => {
    await supabase.from("deliverable_link_suggestions").update({ status: "dismissed" }).eq("id", s.id);
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
  };

  const mergePicked = async () => {
    if (picked.length < 2) return;
    setBusy(true);
    const { error } = await supabase.rpc("merge_posts_into_deliverable", {
      _post_ids: picked, _target_deliverable_id: null,
    } as any);
    setBusy(false);
    if (error) return toast({ title: "Could not group these posts", description: error.message, variant: "destructive" });
    setPicked([]);
    onChanged();
    toast({ title: "Grouped", description: "These publications now count as one deliverable." });
  };

  const detach = async (postId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("detach_post_to_own_deliverable", { _post_id: postId } as any);
    setBusy(false);
    if (error) return toast({ title: "Could not separate this post", description: error.message, variant: "destructive" });
    onChanged();
  };

  const label = (id: string) => {
    const r = byId.get(id);
    if (!r) return "Publication";
    return `${r.influencer_name || "Creator"} · ${titleCase(r.platform)} · ${(r.posted_at || "").slice(0, 10)}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4" /> Grouping suggestions</CardTitle>
          <Button size="sm" variant="outline" onClick={scan} disabled={!campaignId || busy}>
            <RefreshCw className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Scan campaign
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!campaignId && <p className="text-sm text-muted-foreground">Pick a single campaign above to scan it for cross-posted content.</p>}
          {campaignId && !suggestions.length && <p className="text-sm text-muted-foreground">No pending suggestions. Run a scan to look for the same content posted on more than one platform.</p>}
          {suggestions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md p-3">
              <div className="text-sm">
                <div className="font-medium">{label(s.post_id)} &nbsp;↔&nbsp; {label(s.other_post_id)}</div>
                <div className="text-xs text-muted-foreground">{s.reason} {s.confidence ? `· ${Math.round(s.confidence * 100)}% confident` : ""}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => dismiss(s)} disabled={busy}>Keep separate</Button>
                <Button size="sm" onClick={() => accept(s)} disabled={busy}><Link2 className="w-4 h-4 mr-2" /> Same deliverable</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Manual grouping</CardTitle>
          <Button size="sm" onClick={mergePicked} disabled={picked.length < 2 || busy}>
            <Link2 className="w-4 h-4 mr-2" /> Group {picked.length || ""} selected
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
          {groups.slice(0, 80).map((g) => (
            <div key={g.key} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{g.label}</div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{g.publications} publication{g.publications > 1 ? "s" : ""}</Badge>
              </div>
              <div className="mt-2 space-y-1">
                {g.rows.map((r) => (
                  <div key={r.post_id} className="flex items-center justify-between gap-2 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={picked.includes(r.post_id)}
                        onCheckedChange={(c) => setPicked((prev) => (c ? [...prev, r.post_id] : prev.filter((x) => x !== r.post_id)))}
                      />
                      <span>{titleCase(r.platform)} · {(r.posted_at || "").slice(0, 10)} · {r.influencer_name || "Creator"}</span>
                    </label>
                    {g.publications > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => detach(r.post_id)} disabled={busy}>
                        <Unlink className="w-3 h-3 mr-1" /> Separate
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groups.length > 80 && <div className="text-xs text-muted-foreground">Showing the first 80 deliverables — narrow the filters to see more.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default DeliverableGrouping;
