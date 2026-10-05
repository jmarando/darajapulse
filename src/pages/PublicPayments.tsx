import { useEffect, useMemo, useState } from "react";
import PublicFooter from "@/components/PublicFooter";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Hash, Wallet, Users } from "lucide-react";
import logo from "@/assets/logo-pulse-mark.png";
import { contractGrossForViews } from "@/lib/contractPayment";
import { resolveCampaignBrand } from "../../supabase/functions/_shared/campaign-brand";

const money = (value: number) => `KES ${Math.round(value).toLocaleString()}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const PublicPayments = () => {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    const { data: payload } = await (supabase as any).rpc("get_payments_public_data", { _token: token });
    if (!payload) { setNotFound(true); return; }
    setData(payload);
    setUpdatedAt(new Date());
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, [token]);

  const brand = useMemo(() => resolveCampaignBrand(data?.campaign?.name ?? "", data?.campaign?.client_name ?? null), [data]);
  const fixedFee = brand.kind === "omo";
  const whtPercent = Number(data?.campaign?.wht_percent || 0);
  const taxRate = fixedFee ? 5 : whtPercent;

  const rows = useMemo(() => {
    if (!data) return [];
    const latestByPost = new Map<string, any>();
    for (const metric of data.metrics ?? []) {
      const prev = latestByPost.get(metric.post_id);
      if (!prev || +new Date(metric.captured_at) > +new Date(prev.captured_at)) latestByPost.set(metric.post_id, metric);
    }
    return (data.creators ?? []).map((creator: any) => {
      const creatorPosts = (data.posts ?? []).filter((p: any) => p.influencer_id === creator.influencer_id);
      let bestPost: any = null; let bestMetric: any = null;
      for (const post of creatorPosts) {
        const metric = latestByPost.get(post.id);
        const perf = Math.max(Number(metric?.views || 0), Number(metric?.reach || 0));
        const cur = Math.max(Number(bestMetric?.views || 0), Number(bestMetric?.reach || 0));
        if (!bestPost || perf > cur) { bestPost = post; bestMetric = metric; }
      }
      const bestPerformance = Math.max(Number(bestMetric?.views || 0), Number(bestMetric?.reach || 0));
      const agreedFee = Number(creator.fee_kes);
      const target = Number(creator.deliverables_count);
      const approvedCount = (data.drafts ?? []).filter((d: any) => d.influencer_id === creator.influencer_id && d.post_url).length;
      const validAgreement = Number.isFinite(agreedFee) && agreedFee > 0 && Number.isInteger(target) && target > 0;
      const credited = validAgreement ? Math.min(approvedCount, target) : 0;
      const gross = fixedFee ? (validAgreement ? Math.round((agreedFee * credited / target) * 100) / 100 : 0) : contractGrossForViews(bestPerformance);
      const wht = Math.round(gross * (taxRate / 100) * 100) / 100;
      const latestAt = bestMetric?.captured_at ? new Date(bestMetric.captured_at) : null;
      const missing = creatorPosts.length === 0 || creatorPosts.some((p: any) => !latestByPost.has(p.id));
      const stale = !latestAt || Date.now() - latestAt.getTime() > 7 * 86_400_000;
      const payout = (data.payouts ?? []).find((p: any) => p.influencer_id === creator.influencer_id);
      return {
        creator, creatorPosts, bestPost, bestPerformance, gross, wht, net: gross - wht,
        credited, target, approvedCount,
        provisional: fixedFee ? !validAgreement || credited < target : missing || stale,
        payout,
      };
    }).sort((a: any, b: any) => b.net - a.net);
  }, [data, fixedFee]);

  const totals = rows.reduce((sum: any, row: any) => ({
    gross: sum.gross + row.gross, wht: sum.wht + row.wht, net: sum.net + row.net,
  }), { gross: 0, wht: 0, net: 0 });

  const exportCsv = () => {
    const header = fixedFee
      ? [["Creator", "Agreed fee KES", "Agreed Reels", "Approved Reels", "Earned gross KES", "WHT 5%", "Earned net KES", "Status", "Payment status"]]
      : [["Creator", "Best platform", "Best post", "Views / reach", "Gross KES", "WHT 5%", "Net KES", "Status", "Payment status"]];
    const body = rows.map((row: any) => fixedFee
      ? [row.creator.full_name, row.creator.fee_kes, row.target, row.approvedCount, row.gross, row.wht, row.net, row.provisional ? "Provisional" : "Complete", row.payout?.status === "paid" ? "Paid" : row.payout ? "Finalised" : "Not finalised"]
      : [row.creator.full_name, row.bestPost?.platform ?? "", row.bestPost?.post_url ?? "", row.bestPerformance, row.gross, row.wht, row.net, row.provisional ? "Provisional" : "Current", row.payout?.status === "paid" ? "Paid" : row.payout ? "Finalised" : "Not finalised"]);
    const csv = [...header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(data?.campaign?.name ?? "campaign").replace(/[^a-z0-9]+/gi, "_")}_payments.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (notFound) return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <img src={logo} alt="Daraja Pulse" className="h-16 w-auto mx-auto mb-6" />
          <h1 className="font-display text-3xl">Payments summary not found</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            This link may have expired or been revoked. Please contact the agency that shared it with you for a refreshed link.
          </p>
          <Button asChild variant="outline" className="mt-6"><a href="/">Back to home</a></Button>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading payments summary…</div>;

  const campaign = data.campaign ?? {};

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Daraja Pulse" className="h-10 md:h-12 w-auto" />
            <div className="hidden sm:block h-8 w-px bg-border" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live payment summary</div>
              <div className="text-xs text-muted-foreground">Auto-refreshes every minute</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button>
            {updatedAt && <span className="hidden lg:inline-flex items-center gap-2 text-xs text-muted-foreground ml-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> {updatedAt.toLocaleTimeString()}
            </span>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex justify-between items-start gap-6 mb-8">
          <div className="min-w-0 flex items-start gap-4 flex-1">
            {campaign.client_logo_url ? (
              <img src={campaign.client_logo_url} alt={`${campaign.client_name} logo`} className="w-16 h-16 rounded-md object-contain bg-white border border-border p-1.5 shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-md bg-secondary border border-border flex items-center justify-center font-display text-xl shrink-0">
                {(campaign.client_name ?? "—").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{campaign.client_name ?? "Client"}</div>
              <h1 className="font-display text-3xl md:text-5xl font-semibold mt-1 break-words">{campaign.name}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-sm text-muted-foreground">
                {campaign.hashtag && <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{campaign.hashtag.replace(/^#/, "")}</span>}
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{rows.length} signed creator{rows.length === 1 ? "" : "s"}</span>
                <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />Net payable {money(totals.net)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-3 max-w-2xl">
                {fixedFee
                  ? "Each creator earns their agreed fee in equal parts per approved and posted video, up to their agreed number of Reels. 5% withholding tax applies."
                  : "Payments use each creator's single best-performing reel by views or reach, per the signed agreement. 5% withholding tax applies. Cross-posted platforms are not added together."}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="capitalize">{campaign.status}</Badge>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 mb-6">
          <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Signed creators</div><div className="font-display text-2xl mt-1">{rows.length}</div></div>
          <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{fixedFee ? "Earned gross" : "Projected gross"}</div><div className="font-display text-2xl mt-1">{money(totals.gross)}</div></div>
          <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Withholding tax</div><div className="font-display text-2xl mt-1">{money(totals.wht)}</div></div>
          <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{fixedFee ? "Earned net" : "Projected net"}</div><div className="font-display text-2xl mt-1">{money(totals.net)}</div></div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 text-left">Creator</th>
                <th className="px-3 py-3 text-left">{fixedFee ? "Agreement" : "Best reel"}</th>
                <th className="px-3 py-3 text-right">{fixedFee ? "Posted / due" : "Views / reach"}</th>
                <th className="px-3 py-3 text-right">Gross</th>
                <th className="px-3 py-3 text-right">WHT</th>
                <th className="px-3 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">Payment</th>
              </tr></thead>
              <tbody>{rows.map((row: any) => <tr key={row.creator.campaign_influencer_id} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><div className="font-medium">{row.creator.full_name}</div><div className="text-xs text-muted-foreground">{fixedFee ? `${row.creatorPosts.length} publication(s)` : `${row.creatorPosts.length} publication${row.creatorPosts.length === 1 ? "" : "s"}`}</div></td>
                <td className="px-3 py-3">{fixedFee ? money(Number(row.creator.fee_kes)) : row.bestPost ? <a className="inline-flex items-center gap-1 text-accent" href={row.bestPost.post_url} target="_blank" rel="noreferrer">{row.bestPost.platform}<ExternalLink className="w-3 h-3" /></a> : "—"}
                  <div className="mt-1"><Badge variant="outline" className={row.provisional ? "text-highlight border-highlight/40" : "text-success border-success/40"}>{row.provisional ? "Provisional" : fixedFee ? "Complete" : "Current"}</Badge></div></td>
                <td className="px-3 py-3 text-right tabular-nums">{fixedFee ? `${row.credited} / ${row.target || "—"}` : row.bestPerformance.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(row.gross)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(row.wht)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.net)}</td>
                <td className="px-4 py-3 text-right">
                  {row.payout?.status === "paid"
                    ? <div><Badge className="bg-success/15 text-success border-success/30">Paid</Badge><div className="text-[10px] text-muted-foreground mt-1">{row.payout.mpesa_ref}</div></div>
                    : row.payout ? <Badge variant="outline">Finalised, unpaid</Badge>
                    : <Badge variant="outline" className="text-muted-foreground">Not finalised</Badge>}
                </td>
              </tr>)}</tbody>
            </table>
          </div>
        </Card>

        <p className="text-[11px] text-muted-foreground mt-4">
          Figures marked provisional are still updating — final amounts are confirmed once every post's statistics are current.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
};

export default PublicPayments;
