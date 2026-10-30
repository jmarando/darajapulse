import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, ExternalLink, FileText, Link2, RefreshCw, Wallet } from "lucide-react";
import { publicOrigin } from "@/lib/appUrl";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { contractPeriodLabel, type ContractDates } from "@/lib/contractDates";
import { contractGrossForViews } from "@/lib/contractPayment";
import { resolveCampaignBrand } from "../../supabase/functions/_shared/campaign-brand";
import { canRaiseBii, isDetailsComplete, type DetailsLike, type InvoiceStatus } from "../../supabase/functions/_shared/payout-rules";
import { listPayoutDetails, markInvoicesRaised, recordInvoiceDecision, setPaymentTerms, setReportApprovedAt } from "@/lib/payouts/staffApi";
import { buildKraBatchCsv } from "@/lib/payouts/kraBatch";
import PayoutDetailsCell from "@/components/payouts/PayoutDetailsCell";
import PayoutDetailsDialog from "@/components/payouts/PayoutDetailsDialog";
import InvoiceControls, { ApproveInvoiceDialog, type PayoutInvoiceRow } from "@/components/payouts/InvoiceControls";
import CreatorInvoiceDialog from "@/components/payouts/CreatorInvoiceDialog";

type Props = {
  campaignId: string;
  agencyId: string;
  contractDates?: ContractDates;
  campaignName: string;
  clientName?: string | null;
  roster: any[];
  signatures: any[];
  posts: any[];
  metrics: any[];
  whtPercent: number;
  /** Days after both approvals that a creator becomes payable (campaigns.payment_terms_days), or null for none. */
  paymentTermsDays: number | null;
  onRefreshMetrics: () => Promise<unknown>;
};

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const money = (value: number) => `KES ${Math.round(value).toLocaleString()}`;

const CampaignPayments = ({ contractDates, campaignId, agencyId, campaignName, clientName, roster, signatures, posts, metrics, whtPercent, paymentTermsDays, onRefreshMetrics }: Props) => {
  const fixedFee = resolveCampaignBrand(campaignName, clientName).kind === "omo";
  const [payouts, setPayouts] = useState<any[]>([]);
  const [approvedDrafts, setApprovedDrafts] = useState<{ id: string; influencer_id: string | null; post_url: string | null }[]>([]);
  const [draftsReady, setDraftsReady] = useState(false);
  const [paymentLink, setPaymentLink] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"name" | "performance" | "gross" | "net">("net");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"all" | "provisional" | "ready" | "finalised" | "paid" | "missing_details" | "invoice_pending">("all");
  const [terms, setTerms] = useState<number | null>(paymentTermsDays);
  const [termsText, setTermsText] = useState(paymentTermsDays === null ? "" : String(paymentTermsDays));
  useEffect(() => { setTerms(paymentTermsDays); setTermsText(paymentTermsDays === null ? "" : String(paymentTermsDays)); }, [paymentTermsDays]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<{ payoutId: string; name: string; number: string } | null>(null);
  const [ownInvoice, setOwnInvoice] = useState<{ payoutId: string; name: string } | null>(null);

  const loadPayouts = async () => {
    const { data, error } = await supabase.from("payouts").select("*").eq("campaign_id", campaignId);
    if (error) return toast.error(error.message);
    setPayouts(data ?? []);
  };
  useEffect(() => { void loadPayouts(); }, [campaignId]);

  const [details, setDetails] = useState<DetailsLike[]>([]);
  const [detailsUnavailable, setDetailsUnavailable] = useState(false);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [editing, setEditing] = useState<{ influencerId: string; name: string } | null>(null);
  const rosterIds = useMemo(() => roster.map((item) => item.influencer_id).filter(Boolean).sort().join(","), [roster]);
  useEffect(() => {
    if (!agencyId || !rosterIds) return;
    let active = true;
    listPayoutDetails(agencyId, rosterIds.split(","))
      .then((loaded) => { if (active) { setDetails(loaded); setDetailsUnavailable(false); } })
      .catch(() => { if (active) setDetailsUnavailable(true); }); // for example before the payout details migration is applied
    return () => { active = false; };
  }, [agencyId, rosterIds, detailsVersion]);
  const detailsByCreator = useMemo(() => new Map(details.map((d) => [d.influencerId, d])), [details]);
  useEffect(() => {
    if (!fixedFee) return;
    let active = true;
    setDraftsReady(false);
    supabase.from("creator_drafts").select("id, influencer_id, post_url").eq("campaign_id", campaignId).eq("status", "approved")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast.error("Could not load approved videos: " + error.message);
        setApprovedDrafts(data ?? []);
        setDraftsReady(!error);
      });
    return () => { active = false; };
  }, [campaignId, fixedFee]);

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
    const agreedFee = Number(item.fee_kes);
    const target = Number(item.deliverables_count);
    const approvedCount = approvedDrafts.filter((draft) => draft.influencer_id === item.influencer_id && draft.post_url).length;
    const validAgreement = Number.isFinite(agreedFee) && agreedFee > 0 && Number.isInteger(target) && target > 0;
    const credited = validAgreement ? Math.min(approvedCount, target) : 0;
    const gross = fixedFee ? (validAgreement ? Math.round((agreedFee * credited / target) * 100) / 100 : 0) : contractGrossForViews(bestPerformance);
    const taxRate = fixedFee ? 5 : whtPercent;
    const wht = Math.round(gross * (taxRate / 100) * 100) / 100;
    const latestAt = bestMetric?.captured_at ? new Date(bestMetric.captured_at) : null;
    const missing = creatorPosts.length === 0 || creatorPosts.some((post) => !latestByPost.has(post.id));
    const stale = !latestAt || Date.now() - latestAt.getTime() > 7 * 86_400_000;
    return {
      item, creatorPosts, bestPost, bestPerformance, gross, wht, net: gross - wht,
      credited, target, agreedFee, approvedCount,
      latestAt, provisional: fixedFee ? !draftsReady || !validAgreement || credited < target : missing || stale,
      payout: payouts.find((payout) => payout.influencer_id === item.influencer_id),
    };
  }), [roster, signedIds, posts, latestByPost, whtPercent, payouts, fixedFee, approvedDrafts, draftsReady]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "provisional") return row.provisional;
      if (statusFilter === "ready") return !row.provisional && !row.payout;
      if (statusFilter === "finalised") return !!row.payout && row.payout.status !== "paid";
      if (statusFilter === "missing_details") return !isDetailsComplete(detailsByCreator.get(row.item.influencer_id));
      if (statusFilter === "invoice_pending") return row.payout?.invoice_status === "raised";
      return row.payout?.status === "paid";
    });
    const value = (row: typeof rows[number]) =>
      sortKey === "name" ? (row.item.influencers?.full_name ?? "").toLowerCase()
      : sortKey === "performance" ? (fixedFee ? row.credited : row.bestPerformance)
      : sortKey === "gross" ? row.gross : row.net;
    return [...filtered].sort((a, b) => {
      const va = value(a); const vb = value(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, statusFilter, fixedFee, detailsByCreator]);

  // Before the invoices migration is applied, payout rows have no invoice columns: leave invoicing out rather than fail.
  const invoicesAvailable = payouts.every((payout) => "invoice_status" in payout);
  const invoiceEligibility = useMemo(() => new Map(payouts.map((payout) => [payout.id as string, canRaiseBii({
    grossKes: Number(payout.gross_kes),
    invoiceStatus: (payout.invoice_status ?? "not_raised") as InvoiceStatus,
    details: detailsByCreator.get(payout.influencer_id),
  })])), [payouts, detailsByCreator]);
  const eligibleVisible = visibleRows.filter((row) => row.payout && invoiceEligibility.get(row.payout.id)?.ok);
  const allEligibleSelected = eligibleVisible.length > 0 && eligibleVisible.every((row) => selected.has(row.payout.id));
  useEffect(() => {
    setSelected((current) => {
      const kept = new Set([...current].filter((id) => invoiceEligibility.get(id)?.ok));
      return kept.size === current.size ? current : kept;
    });
  }, [invoiceEligibility]);
  const toggleSelected = (payoutId: string, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(payoutId); else next.delete(payoutId);
    return next;
  });
  const toggleAllEligible = (on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const row of eligibleVisible) { if (on) next.add(row.payout.id); else next.delete(row.payout.id); }
    return next;
  });

  const nameOf = (payoutId: string) => rows.find((row) => row.payout?.id === payoutId)?.item.influencers?.full_name ?? "a creator";

  const downloadKraFile = async () => {
    const chosen = rows.filter((row) => row.payout && selected.has(row.payout.id));
    const { csv, included, skipped } = buildKraBatchCsv(chosen.map((row) => {
      const details = detailsByCreator.get(row.item.influencer_id);
      return {
        payoutId: row.payout.id,
        legalName: details?.legalName ?? "",
        idNumber: details?.idNumber ?? "",
        phone: details?.mpesaNumber ?? "",
        grossKes: Number(row.payout.gross_kes),
        itemName: `Content creation: ${campaignName}`,
      };
    }), new Date());
    if (skipped.length) toast.error(`Left out of the file: ${skipped.map((s) => `${nameOf(s.payoutId)} (${s.reason})`).join(", ")}`);
    if (!included.length) return;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaignName.replace(/[^a-z0-9]+/gi, "_")}_KRA_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    try {
      await markInvoicesRaised(included);
      toast.success(`${included.length} invoice${included.length === 1 ? "" : "s"} marked raised. Upload the file in eCitizen's Batch Invoices.`);
      setSelected(new Set());
    } catch (err) {
      toast.error(`The file downloaded, but these weren't marked raised: ${included.map(nameOf).join(", ")}. ${err instanceof Error ? err.message : ""} Try again.`);
    }
    await loadPayouts();
  };

  const invoiceAction = async (payoutId: string, action: () => Promise<void>, done: string) => {
    setBusy(payoutId);
    try {
      await action();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(null);
    }
    await loadPayouts();
  };

  const saveTerms = async () => {
    const text = termsText.trim();
    const days = text === "" ? null : Number(text);
    if (days !== null && !(Number.isInteger(days) && days >= 0 && days <= 365)) {
      toast.error("Payment terms are whole days, from 0 to 365.");
      setTermsText(terms === null ? "" : String(terms));
      return;
    }
    if (days === terms) return;
    try {
      await setPaymentTerms(campaignId, days);
      setTerms(days);
      toast.success(days === null ? "Payment terms cleared" : `Payment terms set to ${days} days`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the payment terms.");
      setTermsText(terms === null ? "" : String(terms));
    }
  };

  const coverage = useMemo(() => {
    const current = posts.filter((post) => {
      const captured = latestByPost.get(post.id)?.captured_at;
      return captured && Date.now() - new Date(captured).getTime() <= 86_400_000;
    }).length;
    const never = posts.filter((post) => !latestByPost.has(post.id)).length;
    const latest = [...latestByPost.values()].sort((a, b) => +new Date(b.captured_at) - +new Date(a.captured_at))[0]?.captured_at;
    return { current, never, latest };
  }, [posts, latestByPost]);

  const loadPaymentLink = async () => {
    const { data, error } = await (supabase as any).from("payment_links").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!error) setPaymentLink(data ?? null);
  };
  useEffect(() => { void loadPaymentLink(); }, [campaignId]);

  const generatePaymentLink = async () => {
    let link = paymentLink;
    if (!link) {
      const { data, error } = await (supabase as any).from("payment_links").insert({ campaign_id: campaignId }).select().single();
      if (error) return toast.error(error.message || "Could not create payments link");
      link = data;
      setPaymentLink(link);
    }
    try { await navigator.clipboard.writeText(`${publicOrigin()}/payments/${link.token}`); } catch {}
    toast.success("Payments link ready — copied to clipboard");
  };

  const finalize = async (row: typeof rows[number]) => {
    if (row.provisional) return toast.error(fixedFee ? "All agreed videos must be approved and posted before finalising the full payment." : "Refresh all of this creator’s post statistics before finalising payment.");
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
    const data = fixedFee
      ? [["Creator", "Agreed fee KES", "Agreed Reels", "Approved Reels", "Earned gross KES", "WHT 5%", "Earned net KES", "Status", "Payment status", "Reference"], ...visibleRows.map((row) => [row.item.influencers?.full_name, row.agreedFee, row.target, row.approvedCount, row.gross, row.wht, row.net, row.provisional ? "Provisional" : "Complete", row.payout?.status ?? "Not finalised", row.payout?.mpesa_ref ?? ""])]
      : [["Creator", "Best platform", "Best post", "Views / reach", "Gross KES", `WHT ${whtPercent}%`, "Net KES", "Metrics", "Payment status", "Reference"], ...visibleRows.map((row) => [row.item.influencers?.full_name, row.bestPost?.platform, row.bestPost?.post_url, row.bestPerformance, row.gross, row.wht, row.net, row.provisional ? "Provisional" : "Current", row.payout?.status ?? "Not finalised", row.payout?.mpesa_ref ?? ""])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + data.map((line) => line.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${campaignName.replace(/[^a-z0-9]+/gi, "_")}_payments.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const totals = rows.reduce((sum, row) => ({ gross: sum.gross + row.gross, wht: sum.wht + row.wht, net: sum.net + row.net }), { gross: 0, wht: 0, net: 0 });

  return <div className="space-y-5">
    {contractDates && contractPeriodLabel(contractDates) && <p className="text-xs text-muted-foreground">Contract period: {contractPeriodLabel(contractDates)} · Historical posts and existing payment eligibility preserved</p>}
    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Signed creators</div><div className="font-display text-2xl mt-1">{rows.length}</div></div>
        <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{fixedFee ? "Earned gross" : "Projected gross"}</div><div className="font-display text-2xl mt-1">{money(totals.gross)}</div></div>
      <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Withholding tax</div><div className="font-display text-2xl mt-1">{money(totals.wht)}</div></div>
        <div className="bg-card p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{fixedFee ? "Earned net" : "Projected net"}</div><div className="font-display text-2xl mt-1">{money(totals.net)}</div></div>
    </div>

    <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
      <div>
         <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{fixedFee ? "Delivery status" : "Statistics health"}</div>
        {fixedFee ? <><div className="text-sm mt-1">{approvedDrafts.filter((draft) => draft.post_url).length} approved, posted videos</div><p className="text-xs text-muted-foreground mt-1">Each creator earns their agreed fee in equal parts per approved and posted video, up to their agreed number of Reels. 5% withholding applies. Full payment can be finalised once all videos are delivered.</p></> : <><div className="text-sm mt-1">{coverage.current} current · {coverage.never} never synced · latest {coverage.latest ? new Date(coverage.latest).toLocaleString() : "unavailable"}</div><p className="text-xs text-muted-foreground mt-1">Payments use each creator’s single best reel by views or reach. Cross-posted platforms are not added together.</p></>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {invoicesAvailable && <div className="mr-2">
          <Label htmlFor="payment-terms" className="text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Payment terms (days)</Label>
          <Input id="payment-terms" type="number" min={0} max={365} inputMode="numeric" placeholder="None" className="mt-1 h-9 w-24"
            value={termsText} onChange={(e) => setTermsText(e.target.value)} onBlur={() => void saveTerms()} />
        </div>}
        {fixedFee ? <Button variant="outline" size="sm" onClick={() => { setDraftsReady(false); supabase.from("creator_drafts").select("id, influencer_id, post_url").eq("campaign_id", campaignId).eq("status", "approved").then(({ data, error }) => { if (error) toast.error(error.message); else { setApprovedDrafts(data ?? []); setDraftsReady(true); } }); }}><RefreshCw className="w-4 h-4 mr-2" /> Refresh deliveries</Button> : <Button variant="outline" size="sm" onClick={() => void onRefreshMetrics()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh statistics</Button>}
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
        <Button variant="outline" size="sm" onClick={() => void generatePaymentLink()}><Link2 className="w-4 h-4 mr-2" /> {paymentLink ? "Copy payments link" : "Create payments link"}</Button>
      </div>
    </Card>

    <div className="flex flex-wrap items-center gap-2">
      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All creators</SelectItem>
          <SelectItem value="provisional">Provisional only</SelectItem>
          <SelectItem value="ready">Ready to finalise</SelectItem>
          <SelectItem value="finalised">Finalised, unpaid</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="missing_details">Missing details</SelectItem>
          <SelectItem value="invoice_pending">Raised, not yet approved</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Sort by name</SelectItem>
          <SelectItem value="performance">{fixedFee ? "Sort by videos posted" : "Sort by views / reach"}</SelectItem>
          <SelectItem value="gross">Sort by gross amount</SelectItem>
          <SelectItem value="net">Sort by net amount</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} title={sortDir === "asc" ? "Ascending" : "Descending"}>
        {sortDir === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
      </Button>
      <span className="text-xs text-muted-foreground">{visibleRows.length} of {rows.length} shown</span>
      {invoicesAvailable && <Button variant="outline" size="sm" className="ml-auto" disabled={selected.size === 0} onClick={() => void downloadKraFile()}>
        <FileText className="w-4 h-4 mr-2" /> Download KRA invoice file ({selected.size})
      </Button>}
    </div>
    {detailsUnavailable && <p className="text-xs text-muted-foreground">Payout details aren't available yet.</p>}
    {!invoicesAvailable && <p className="text-xs text-muted-foreground">eTIMS invoice tracking isn't available yet.</p>}

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="pl-4 py-3 w-8 text-left">{invoicesAvailable && <Checkbox aria-label="Select all eligible creators" checked={allEligibleSelected} disabled={eligibleVisible.length === 0} onCheckedChange={(on) => toggleAllEligible(on === true)} />}</th>
              <th className="px-4 py-3 text-left">Creator</th><th className="px-3 py-3 text-left">{fixedFee ? "Agreement" : "Best reel"}</th><th className="px-3 py-3 text-right">{fixedFee ? "Posted / due" : "Views / reach"}</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">WHT</th><th className="px-3 py-3 text-right">Net</th><th className="px-3 py-3 text-left">Payout details</th><th className="px-3 py-3 text-left">eTIMS invoice</th><th className="px-4 py-3 text-right">Payment</th>
          </tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={row.item.id} className="border-b border-border last:border-0">
             <td className="pl-4 py-3 align-top">{invoicesAvailable && row.payout && (() => {
               const eligibility = invoiceEligibility.get(row.payout.id);
               return <Checkbox title={eligibility?.ok === false ? eligibility.reason : "Add to the KRA invoice file"} disabled={!eligibility?.ok}
                 checked={selected.has(row.payout.id)} onCheckedChange={(on) => toggleSelected(row.payout.id, on === true)} />;
             })()}</td>
             <td className="px-4 py-3"><div className="font-medium">{row.item.influencers?.full_name}</div><div className="text-xs text-muted-foreground">{fixedFee ? `${row.creatorPosts.length} publication(s)` : `${row.creatorPosts.length} publication${row.creatorPosts.length === 1 ? "" : "s"}`}</div></td>
             <td className="px-3 py-3 capitalize">{fixedFee ? money(row.agreedFee) : row.bestPost ? <a className="inline-flex items-center gap-1 text-accent" href={row.bestPost.post_url} target="_blank" rel="noreferrer">{row.bestPost.platform}<ExternalLink className="w-3 h-3" /></a> : "—"}<div className="mt-1"><Badge variant="outline" className={row.provisional ? "text-highlight border-highlight/40" : "text-success border-success/40"}>{row.provisional ? "Provisional" : fixedFee ? "Complete" : "Current"}</Badge></div></td>
             <td className="px-3 py-3 text-right tabular-nums">{fixedFee ? `${row.credited} / ${row.target || "—"}` : row.bestPerformance.toLocaleString()}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.gross)}</td><td className="px-3 py-3 text-right tabular-nums">{money(row.wht)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{money(row.net)}</td>
            <td className="px-3 py-3">{detailsUnavailable ? <span className="text-muted-foreground">—</span> : <PayoutDetailsCell details={detailsByCreator.get(row.item.influencer_id)} onEdit={() => setEditing({ influencerId: row.item.influencer_id, name: row.item.influencers?.full_name ?? "Creator" })} />}</td>
            <td className="px-3 py-3 align-top min-w-[13rem]">{!invoicesAvailable ? <span className="text-muted-foreground">—</span> : row.payout ? <InvoiceControls
              payout={row.payout as PayoutInvoiceRow}
              liveGrossKes={row.gross}
              paymentTermsDays={terms}
              busy={busy === row.payout.id}
              onApprove={() => setApproving({ payoutId: row.payout.id, name: row.item.influencers?.full_name ?? "Creator", number: row.payout.invoice_number ?? "" })}
              onDecide={(status) => void invoiceAction(row.payout.id, () => recordInvoiceDecision(row.payout.id, { status, decidedAt: new Date().toISOString() }), status === "declined" ? "Marked declined" : "Marked expired")}
              onUploadOwn={() => setOwnInvoice({ payoutId: row.payout.id, name: row.item.influencers?.full_name ?? "Creator" })}
              onReportApprovedChange={(day) => void invoiceAction(row.payout.id, () => setReportApprovedAt(row.payout.id, day), "Report approval date saved")}
            /> : <span className="text-xs text-muted-foreground">Finalise first</span>}</td>
            <td className="px-4 py-3 text-right">{row.payout?.status === "paid" ? <div><Badge className="bg-success/15 text-success border-success/30">Paid</Badge><div className="text-[10px] text-muted-foreground mt-1">{row.payout.mpesa_ref}</div></div> : row.payout ? <Button size="sm" variant="outline" disabled={busy === row.item.id} onClick={() => void markPaid(row)}>Mark paid</Button> : <Button size="sm" disabled={row.provisional || busy === row.item.id} onClick={() => void finalize(row)}><Wallet className="w-3.5 h-3.5 mr-1.5" /> Finalise</Button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>
    {editing && <PayoutDetailsDialog open onOpenChange={(isOpen) => { if (!isOpen) setEditing(null); }} agencyId={agencyId} influencerId={editing.influencerId} creatorName={editing.name} existing={detailsByCreator.get(editing.influencerId)} onSaved={() => setDetailsVersion((v) => v + 1)} />}
    {approving && <ApproveInvoiceDialog open onOpenChange={(isOpen) => { if (!isOpen) setApproving(null); }} creatorName={approving.name} initialNumber={approving.number}
      onSave={async (invoiceNumber) => {
        await recordInvoiceDecision(approving.payoutId, { status: "approved", invoiceNumber, decidedAt: new Date().toISOString() });
        toast.success("Invoice approval saved");
        await loadPayouts();
      }} />}
    {ownInvoice && <CreatorInvoiceDialog open onOpenChange={(isOpen) => { if (!isOpen) setOwnInvoice(null); }} payoutId={ownInvoice.payoutId} agencyId={agencyId} creatorName={ownInvoice.name}
      onSaved={() => { toast.success("Their invoice is saved. Check it, then mark it approved."); void loadPayouts(); }} />}
  </div>;
};

export default CampaignPayments;