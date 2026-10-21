import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckSquare, Clock, Film, Loader2, MessageSquareWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Draft = {
  id: string;
  campaign_id: string;
  platform: string | null;
  caption: string | null;
  creator_note: string | null;
  review_note: string | null;
  status: string;
  poster_path: string | null;
  created_at: string;
  updated_at: string;
  influencers: { full_name: string | null; handle: string | null } | null;
  campaigns: { name: string | null } | null;
};

const PLATFORMS: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", twitter: "X", x: "X" };

const ago = (iso: string) => {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** Every draft waiting on someone, across all campaigns. Reviewing happens in the campaign's Video approvals tab. */
const Approvals = () => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("creator_drafts")
        .select("id, campaign_id, platform, caption, creator_note, review_note, status, poster_path, created_at, updated_at, influencers(full_name, handle), campaigns(name)")
        .in("status", ["pending", "changes_requested"])
        .order("created_at", { ascending: true })
        .limit(500);
      const list = (data ?? []) as unknown as Draft[];
      setDrafts(list);
      setLoading(false);
      const paths = list.map((d) => d.poster_path).filter(Boolean) as string[];
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("creator-drafts").createSignedUrls(paths, 60 * 60);
        const map: Record<string, string> = {};
        (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl; });
        setPosters(map);
      }
    })();
  }, []);

  const pending = useMemo(() => drafts.filter((d) => d.status === "pending"), [drafts]);
  const waiting = useMemo(() => drafts.filter((d) => d.status === "changes_requested"), [drafts]);

  const list = (rows: Draft[], empty: string) =>
    rows.length === 0 ? (
      <Card className="p-10 text-center text-muted-foreground">{empty}</Card>
    ) : (
      <div className="flex flex-col gap-3">
        {rows.map((d) => (
          <Card key={d.id} className="p-4 flex items-center gap-4">
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted grid place-items-center">
              {d.poster_path && posters[d.poster_path]
                ? <img src={posters[d.poster_path]} alt="" className="h-full w-full object-cover" />
                : <Film className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {d.influencers?.full_name || d.influencers?.handle || "Creator"}
                {d.platform && <Badge variant="secondary" className="ml-2">{PLATFORMS[d.platform.toLowerCase()] ?? d.platform}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground truncate">{d.campaigns?.name}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {d.status === "changes_requested" ? d.review_note || "Changes requested" : d.creator_note || d.caption || "No caption"}
              </div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap hidden sm:flex items-center gap-1">
              <Clock className="w-3 h-3" /> {ago(d.status === "pending" ? d.created_at : d.updated_at)}
            </div>
            <Button asChild size="sm" variant={d.status === "pending" ? "default" : "outline"}>
              <Link to={`/app/campaigns/${d.campaign_id}?tab=drafts`}>{d.status === "pending" ? "Review" : "Open"}</Link>
            </Button>
          </Card>
        ))}
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold flex items-center gap-2">
          <CheckSquare className="w-7 h-7 text-accent" /> Approvals
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Creator drafts across all campaigns, oldest first.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">To review ({pending.length})</TabsTrigger>
            <TabsTrigger value="waiting">
              <MessageSquareWarning className="w-3.5 h-3.5 mr-1.5" /> Waiting on creator ({waiting.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">{list(pending, "Nothing to review. New drafts will show up here.")}</TabsContent>
          <TabsContent value="waiting" className="mt-4">{list(waiting, "No drafts are waiting on creators.")}</TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Approvals;
