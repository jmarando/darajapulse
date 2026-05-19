import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, ExternalLink, Trophy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { ContestsSection } from "./ContestsSection";
import ContestEmailReportsSection from "./ContestEmailReportsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ContestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase
      .from("contests")
      .select("*, campaigns(id, name, clients(id, name, logo_url)), clients(id, name, logo_url)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => { setContest(data); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!contest) return <div className="p-8">Contest not found. <Link className="underline" to="/app/contests">Back to contests</Link></div>;

  const client = contest.clients ?? contest.campaigns?.clients;
  const submitUrl = `${window.location.origin}/c/${contest.submission_token}`;
  const reportUrl = `${window.location.origin}/rc/${contest.submission_token}`;
  const today = new Date();
  const isLive = today >= new Date(contest.start_date) && today <= new Date(contest.end_date);

  const copy = (s: string, label: string) => {
    navigator.clipboard.writeText(s);
    toast.success(`${label} copied`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to="/app/contests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> All contests
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div className="flex items-start gap-4 min-w-0">
          {client?.logo_url ? (
            <img src={client.logo_url} alt={`${client?.name} logo`} className="w-16 h-16 rounded-md object-contain bg-white border border-border p-1.5 shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
              <Trophy className="w-7 h-7 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {client?.name ?? "Standalone contest"}
              {contest.campaigns?.name && (
                <> · <Link to={`/app/campaigns/${contest.campaigns.id}`} className="hover:underline normal-case tracking-normal">{contest.campaigns.name}</Link></>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold mt-1 break-words">{contest.name}</h1>
            <div className="mt-2 text-sm text-muted-foreground font-mono">{contest.hashtag}</div>
          </div>
        </div>
        <Badge variant={isLive ? "default" : "outline"} className={`${isLive ? "bg-success text-success-foreground hover:bg-success" : ""}`}>
          {isLive ? "Live" : (today > new Date(contest.end_date) ? "Ended" : "Scheduled")}
        </Badge>
      </div>

      {/* Share links */}
      <Card className="p-4 mb-6">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 w-24">Public report</div>
            <code className="text-xs bg-secondary px-2 py-1 rounded truncate flex-1">{reportUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(reportUrl, "Report link")}><Copy className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" asChild><a href={reportUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a></Button>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 w-24">Submission</div>
            <code className="text-xs bg-secondary px-2 py-1 rounded truncate flex-1">{submitUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(submitUrl, "Submission link")}><Copy className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" asChild><a href={submitUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a></Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="emails">Email reports</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <ContestsSection contestId={id!} />
        </TabsContent>
        <TabsContent value="emails" className="mt-6">
          <ContestEmailReportsSection contestId={id!} campaignId={contest.campaign_id ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContestDetail;
