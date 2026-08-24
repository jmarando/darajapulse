import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Users, Wallet } from "lucide-react";
import PublicFooter from "@/components/PublicFooter";
import { breakdownSummary } from "@/components/DeliverablesEditor";

const PublicPlan = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [brief, setBrief] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: linkCampaignId } = await (supabase as any).rpc("get_plan_link_campaign", { _token: token! });
      const link = linkCampaignId ? { campaign_id: linkCampaignId as string } : null;
      if (!link) { setError("This plan link is no longer active."); setLoading(false); return; }

      const { data: c } = await supabase
        .from("campaigns")
        .select("*, clients(name, logo_url), brief_templates:brief_template_id(name, objective, brief)")
        .eq("id", link.campaign_id)
        .maybeSingle();
      setCampaign(c);
      setClient(c?.clients ?? null);
      setBrief(c?.brief_templates ?? null);

      const { data: ci } = await supabase
        .from("campaign_influencers")
        .select("id, fee_kes, deliverables_count, deliverables_breakdown, status, influencers(full_name, handle, primary_platform, follower_count, niche)")
        .eq("campaign_id", link.campaign_id);
      setRoster(ci ?? []);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (error || !campaign) return <div className="p-10 text-center text-muted-foreground">{error ?? "Not found"}</div>;

  const totals = roster.reduce(
    (a, r) => ({ fees: a.fees + Number(r.fee_kes ?? 0), deliv: a.deliv + Number(r.deliverables_count ?? 0) }),
    { fees: 0, deliv: 0 }
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 md:p-10">
        <div className="flex items-center gap-3 mb-6">
          {client?.logo_url && <img src={client.logo_url} alt={client.name} className="w-10 h-10 rounded object-contain bg-muted p-1" />}
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{client?.name}</div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold">{campaign.name}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground mb-6">
          {(campaign.hashtag || brief?.hashtag) && (
            <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{(campaign.hashtag || brief?.hashtag).replace(/^#/, "")}</span>
          )}
          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{roster.length} creators</span>
          <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />KES {totals.fees.toLocaleString()} fees</span>
          <span>{totals.deliv} deliverables</span>
        </div>

        {(brief?.objective || campaign.brief || brief?.brief) && (
          <Card className="p-5 mb-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Summary</div>
            <p className="text-sm leading-relaxed whitespace-pre-line line-clamp-6">
              {brief?.objective || campaign.brief || brief?.brief}
            </p>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 text-[11px] uppercase tracking-widest text-muted-foreground border-b">
            <div className="col-span-5">Creator</div>
            <div className="col-span-2">Platform</div>
            <div className="col-span-2 text-right">Deliverables</div>
            <div className="col-span-3 text-right">Fee (KES)</div>
          </div>
          <div className="divide-y">
            {roster.map((r) => {
              const summary = breakdownSummary(r.deliverables_breakdown as any);
              return (
              <div key={r.id} className="grid grid-cols-12 px-5 py-3 items-center text-sm">
                <div className="col-span-5">
                  <div className="font-medium">{r.influencers?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">@{r.influencers?.handle ?? "—"} {r.influencers?.niche ? `· ${r.influencers.niche}` : ""}</div>
                </div>
                <div className="col-span-2 capitalize">{r.influencers?.primary_platform ?? "—"}</div>
                <div className="col-span-2 text-right">
                  <div>{r.deliverables_count ?? 1}</div>
                  {summary && <div className="text-[10px] text-muted-foreground">{summary}</div>}
                </div>
                <div className="col-span-3 text-right tabular-nums">{Number(r.fee_kes ?? 0).toLocaleString()}</div>
              </div>
            );})}
            {roster.length === 0 && (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">No creators on this plan yet.</div>
            )}
          </div>
          <div className="grid grid-cols-12 px-5 py-3 text-sm font-medium border-t bg-muted/30">
            <div className="col-span-7">Total</div>
            <div className="col-span-2 text-right">{totals.deliv}</div>
            <div className="col-span-3 text-right tabular-nums">{totals.fees.toLocaleString()}</div>
          </div>
        </Card>

        <div className="text-center text-xs text-muted-foreground mt-8">
          Shared plan · view only · numbers may be revised before launch
        </div>
      </div>

      <PublicFooter />
    </div>
  );
};

export default PublicPlan;
