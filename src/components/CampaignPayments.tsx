import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Props = {
  campaignId: string;
  campaignName: string;
  roster: any[];
  signatures: any[];
  posts: any[];
  metrics: any[];
  whtPercent: number;
  onRefreshMetrics: () => Promise<void>;
};

export const contractGrossForViews = (views: number) => {
  if (views >= 900_000) return 75_000;
  if (views >= 800_000) return 70_000;
  if (views >= 700_000) return 65_000;
  if (views >= 600_000) return 60_000;
  if (views >= 500_000) return 55_000;
  if (views >= 300_000) return 50_000;
  if (views >= 200_000) return 45_000;
  if (views >= 100_000) return 40_000;
  if (views >= 70_000) return 35_000;
  if (views >= 50_000) return 30_000;
  if (views >= 30_000) return 25_000;
  if (views >= 20_000) return 17_000;
  if (views >= 10_000) return 12_000;
  if (views >= 5_000) return 7_000;
  if (views >= 1_000) return 5_000;
  return 0;
};

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const money = (value: number) => `KES ${Math.round(value).toLocaleString()}`;

const CampaignPayments = ({ campaignId, campaignName, roster, signatures, posts, metrics, whtPercent, onRefreshMetrics }: Props) => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPayouts = async () => {
    const { data, error } = await supabase.from("payouts").select("*").eq("campaign_id", campaignId);
    if (error) return toast.error(error.message);
    setPayouts(data ?? []);
  };
  useEffect(() => { void loadPayouts(); }, [campaignId]);

  const latestByPost = useMemo(() => {
    const map = new Map<string, any>();
    for (const metric of metrics) {
      const previous = map.get(metric.post_id);
      if (!previous || +new Date(metric.captured_at) > +new Date(previous.captured_at)) map.set(metric.post_id, metric);
    }
    return map;
  }, [metrics]);

  const signedIds = useMemo(() => new Set(signatures.map((signature) => signature.campaign_influencer_id)), [signatures]);
  const rows = useMemo(() => roster.filter((item) => signedIds.has(item.id)).map((item) => {
    const creatorPosts = posts.filter((post) => post.influencer_id === item.influencer_id);
    let bestPost: any = null;
    let bestMetric: any = null;
    for (const post of creatorPosts) {
      const metric = latestByPost.get(post.id);
      const performance = Math.max(Number(metric?.views || 0), Number(metric?.reach || 0));
      const current = Math.max(Number(bestMetric?.views || 0), Number(bestMetric?.reach || 0));
      if (!bestPost || performance > current) { bestPost = post; bestMetric = metric; }
    }
    const bestPerformance = Math.max(Number(bestMetric?.views || 0), Number(bestMetric?.reach || 0));
    const gross = contractGrossForViews(bestPerformance);
    const wht = Math.round(gross * (whtPercent / 100));
    const latestAt = bestMetric?.captured_at ? new Date(bestMetric.captured_at) : null;
    const missing = creatorPosts.length === 0 || creatorPosts.some((post) => !latestByPost.has(post.id));
    const stale = !latestAt || Date.now() - latestAt.getTime() > 7 * 86_400_000;
    return {
      item, creatorPosts, bestPost, bestPerformance, gross, wht, net: gross - wht,
      latestAt, provisional: missing || stale, payout: payouts.find((payout) => payout.influencer_id === item.influencer_id),
    };
  }), [roster, signedIds, posts, latestByPost, whtPercent, payouts]);

  const coverage = useMemo(() => {
    const current = posts.filter((post) => {
      const captured = latestByPost.get(post.id)?.captured_at;
      return captured && Date.now() - new Date(captured).getTime() <= 86_400_000;
    }).length;
    const never = posts.filter((post) => !latestByPost.has(post.id)).length;
    const latest = [...latestByPost.values()].sort((a, b) => +new Date(b.captured_at) - +new Date(a.captured_at))[0]?.captured_at;
    return { current, never, latest };
  }, [posts, latestByPost]);

  const finalize = async (row: typeof rows[number]) => {
    if (row.provisional) return toast.error("Refresh all of this creator’s post statistics before finalising payment.");
    setBusy(row.item.id);
    const { error } = await supabase.from("payouts").insert({
      campaign_id: campaignId,
      influencer_id: row.item.influencer_id,
      gross_kes: row.gross,
      wht_kes: row.wht,
      net_kes: row.net,
      status: "pending",
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Payment calculation finalised");
    await loadPayouts();
  };

  const markPaid = async (row: typeof rows[number]) => {
    const reference = window.prompt("Enter the M-Pesa or payment reference");
    if (!reference?.trim() || !row.payout) return;
    setBusy(row.item.id);
    const { error } = await supabase.from("payouts").update({ status: "paid", mpesa_ref: reference.trim(), paid_at: new Date().toISOString() }).eq("id", row.payout.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Payment marked as paid");
    await loadPayouts();
  };

  const exportCsv = () => {
    const data = [["Creator", "Best platform", "Best post", "Views / reach", "Gross KES", `WHT ${whtPercent}%`, "Net KES", "Metrics", "Payment status", "Reference"], ...rows.map((row) => [
      row.item.influencers?.full_name, row.bestPost?.platform, row.bestPost?.post_url, row.bestPerformance,
      row.gross, row.wht, row.net, row.provisional ? "Provisional" : "Current", row.payout?.status ?? "Not finalised", row.payout?.mpesa_ref ?? "",
    ])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + data.map((line) => line.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${campaignName.replace(/[^a-z0-9]+/gi, "_")}_payments.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const totals = rows.reduce((sum, row) => ({ gross: sum.gross + row.gross, wht: sum.wht + row.wht, net: sum.net + row.net }), { gross: 0, wht: 0, net: 0 });

  return <div className="space-y-5">
    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Signed creators</div><div className="font-display text-2xl mt-1">{rows.length}</div></div>
      <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Projected gross</div><div className="font-display text-2xl mt-1">{money(totals.gross)}</div></div>
      <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Withholding tax</div><div className="font-display text-2xl mt-1">{money(totals.wht)}</div></div>
      <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Projected net</div><div className="font-display text-2xl mt-1">{money(totals.net)}</div></div>
    </div>

    <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Statistics health</div>
        <div className="text-sm mt-1">{coverage.current} current · {coverage.never} never synced · latest {coverage.latest ? new Date(coverage.latest).toLocaleString() : "unavailable"}</div>
        <p className="text-xs text-muted-foreground mt-1">Payments use each creator’s single best reel by views or reach. Cross-posted platforms are not added together.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void onRefreshMetrics()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh statistics</Button>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
      </div>
    </Card>

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-3 text-left">Creator</th><th className="px-3 py-3 text-left">Best reel</th><th className="px-3 py-3 text-right">Views / reach</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">WHT</th><th className="px-3 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Payment</th>
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.item.id} className="border-b border-border last:border-0">
            <td className="px-4 py-3"><div className="font-medium">{row.item.influencers?.full_name}</div><div className="text-xs text-muted-foreground">{row.creatorPosts.length} publication{row.creatorPosts.length === 1 ? "" : "s"}</div></td>
            <td className="px-3 py-3 capitalize">{row.bestPost ? <a className="inline-flex items-center gap-1 text-accent" href={row.bestPost.post_url} target="_blank" rel="noreferrer">{row.bestPost.platform}<ExternalLink className="w-3 h-3" /></a> : "—"}<div className="mt-1"><Badge variant="outline" className={row.provisional ? "text-highlight border-highlight/40" : "text-success border-success/40"}>{row.provisional ? "Provisional" : "Current"}</Badge></div></td>
            <td className="px-3 py-3 text-right tabular-nums">{row.bestPerformance.toLocaleString()}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.gross)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.wht)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.net)}</td>
            <td className="px-4 py-3 text-right">{row.payout?.status === "paid" ? <div><Badge className="bg-success/15 text-success border-success/30">Paid</Badge><div className="text-[10px] text-muted-foreground mt-1">{row.payout.mpesa_ref}</div></div> : row.payout ? <Button size="sm" variant="outline" disabled={busy === row.item.id} onClick={() => void markPaid(row)}>Mark paid</Button> : <Button size="sm" disabled={row.provisional || busy === row.item.id} onClick={() => void finalize(row)}><Wallet className="w-3.5 h-3.5 mr-1.5" /> Finalise</Button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>
  </div>;
};

export default CampaignPayments;