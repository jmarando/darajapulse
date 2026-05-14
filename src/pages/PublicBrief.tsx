import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Wallet, Calendar, CheckCircle2, XCircle, Music2, Check, X, AtSign, Link as LinkIcon, FileText, Clapperboard, Smartphone, Eye, Banknote, Instagram, Youtube, Twitter, Facebook } from "lucide-react";
import { toast } from "sonner";
import { normalizeBreakdown } from "@/components/DeliverablesEditor";

const PLATFORM_ICON: Record<string, any> = {
  tiktok: Music2, instagram: Instagram, youtube: Youtube, twitter: Twitter, facebook: Facebook,
};
const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", twitter: "X / Twitter", facebook: "Facebook",
};

const PublicBrief = () => {
  const { token } = useParams();
  const [b, setB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_brief_by_token", { _token: token });
    if (error) toast.error(error.message);
    setB(data); setLoading(false);
  };
  useEffect(() => { load(); }, [token]);

  const act = async (status: string) => {
    setActing(true);
    const { error } = await supabase.rpc("update_brief_status", { _token: token, _status: status });
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success(status === "confirmed" ? "Thanks — you're confirmed!" : status === "declined" ? "Declined." : "Updated");
    load();
  };

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!b) return <div className="p-10 text-center"><h1 className="font-display text-2xl">Brief not found</h1><p className="text-muted-foreground mt-2">This invite link is invalid or has been revoked.</p></div>;

  const final = ["confirmed","declined"].includes(b.status);

  const paymentSteps = [
    { icon: CheckCircle2, label: "Brief accepted", desc: "You confirm and connect TikTok" },
    { icon: Clapperboard, label: "Content created", desc: "You shoot and submit drafts" },
    { icon: Eye, label: "Approved & live", desc: "Brand reviews, you publish" },
    { icon: Smartphone, label: "Performance tracked", desc: "Daily metric updates" },
    { icon: Banknote, label: "M-Pesa payout", desc: "Net fee sent to your phone" },
  ];

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-10">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{b.client.name} · Creator brief</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">{b.campaign.name}</h1>
        <p className="text-muted-foreground mt-3">Hi {b.influencer.full_name?.split(" ")[0]}, you've been invited to collaborate.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden mt-8 border border-border">
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fee</div>
            <div className="font-display text-xl mt-1">KES {Number(b.fee_kes || 0).toLocaleString()}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables</div>
            <div className="font-display text-xl mt-1">{b.deliverables_count}</div>
            {b.deliverables_breakdown && Object.keys(b.deliverables_breakdown).length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {Object.entries(b.deliverables_breakdown).filter(([,n]: any) => Number(n) > 0).map(([t, n]: any) => `${n} ${t}${Number(n) === 1 ? "" : "s"}`).join(" · ")}
              </div>
            )}
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Hashtag</div>
            <div className="font-display text-xl mt-1 truncate">{b.campaign.hashtag || "—"}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Window</div>
            <div className="font-display text-base mt-1">{b.campaign.start_date || "—"} → {b.campaign.end_date || "—"}</div>
          </div>
        </div>

        {b.campaign.objective && (
          <Card className="p-6 mt-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Objective</div>
            <p className="mt-2 leading-relaxed">{b.campaign.objective}</p>
          </Card>
        )}
        {b.campaign.brief && (
          <Card className="p-6 mt-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">The brief</div>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap">{b.campaign.brief}</p>
          </Card>
        )}

        {(b.campaign.content_format || b.campaign.tone) && (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {b.campaign.content_format && (
              <Card className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Format</div>
                <p className="text-sm mt-1.5">{b.campaign.content_format}</p>
              </Card>
            )}
            {b.campaign.tone && (
              <Card className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tone of voice</div>
                <p className="text-sm mt-1.5">{b.campaign.tone}</p>
              </Card>
            )}
          </div>
        )}

        {((b.campaign.dos?.length ?? 0) > 0 || (b.campaign.donts?.length ?? 0) > 0) && (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {b.campaign.dos?.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-success/15 text-success flex items-center justify-center"><Check className="w-4 h-4" /></div>
                  <h3 className="font-display text-lg">Do's</h3>
                </div>
                <ul className="space-y-2">
                  {b.campaign.dos.map((d: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm"><Check className="w-4 h-4 text-success shrink-0 mt-0.5" /><span>{d}</span></li>
                  ))}
                </ul>
              </Card>
            )}
            {b.campaign.donts?.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-destructive/15 text-destructive flex items-center justify-center"><X className="w-4 h-4" /></div>
                  <h3 className="font-display text-lg">Don'ts</h3>
                </div>
                <ul className="space-y-2">
                  {b.campaign.donts.map((d: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm"><X className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>{d}</span></li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        {((b.campaign.mandatory_mentions?.length ?? 0) > 0 || (b.campaign.hashtags_extra?.length ?? 0) > 0) && (
          <Card className="p-5 mt-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Mandatory tags & mentions</div>
            <div className="flex flex-wrap gap-2">
              {b.campaign.mandatory_mentions?.map((m: string, i: number) => (
                <Badge key={`m${i}`} variant="secondary" className="text-sm"><AtSign className="w-3 h-3 mr-1" />{m.replace(/^@/, "")}</Badge>
              ))}
              {b.campaign.hashtags_extra?.map((h: string, i: number) => (
                <Badge key={`h${i}`} variant="outline" className="text-sm"><Hash className="w-3 h-3 mr-1" />{h.replace(/^#/, "")}</Badge>
              ))}
            </div>
          </Card>
        )}

        {b.campaign.references_urls?.length > 0 && (
          <Card className="p-5 mt-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">References & inspiration</div>
            <ul className="space-y-1.5">
              {b.campaign.references_urls.map((u: string, i: number) => (
                <li key={i}><a href={u} target="_blank" rel="noreferrer" className="text-sm text-accent inline-flex items-center gap-1.5 break-all"><LinkIcon className="w-3.5 h-3.5 shrink-0" />{u}</a></li>
              ))}
            </ul>
          </Card>
        )}

        {b.fee_kes > 0 && b.campaign.wht_percent > 0 && (
          <Card className="p-5 mt-4 bg-secondary/50">
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <div className="font-medium">Payment & withholding tax</div>
                <p className="text-muted-foreground mt-1">
                  Gross fee: KES {Number(b.fee_kes).toLocaleString()} · WHT ({b.campaign.wht_percent}%): KES {Math.round(Number(b.fee_kes) * Number(b.campaign.wht_percent) / 100).toLocaleString()} · <span className="text-foreground font-medium">Net to you: KES {Math.round(Number(b.fee_kes) * (1 - Number(b.campaign.wht_percent) / 100)).toLocaleString()}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Paid via M-Pesa after content goes live and is approved. We file WHT on your behalf.</p>
              </div>
            </div>
          </Card>
        )}

        {/* Payment timeline — content → payout */}
        <Card className="p-6 mt-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">How you get paid</div>
          <h3 className="font-display text-xl mt-1 mb-5">From acceptance to M-Pesa</h3>
          <ol className="relative">
            {paymentSteps.map((s, i) => {
              const Icon = s.icon;
              const isLast = i === paymentSteps.length - 1;
              return (
                <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  {!isLast && <span aria-hidden className="absolute left-[18px] top-9 bottom-0 w-px bg-border" />}
                  <div className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0 ring-4 ring-background">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Status indicator on page (sticky bar handles primary CTAs) */}
        <div className="mt-8 flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="capitalize">Status: {b.status}</Badge>
          {final && b.status === "confirmed" && <span className="text-sm text-success">You're confirmed — see next step below.</span>}
          {final && b.status === "declined" && <span className="text-sm text-muted-foreground">Thanks — your response has been recorded.</span>}
        </div>

        {b.status === "confirmed" && b.influencer?.id && (
          <Card className="p-6 mt-8 bg-gradient-ink text-primary-foreground border-0">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Music2 className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-widest opacity-70">One last step</div>
                <div className="font-display text-xl mt-0.5">Connect your TikTok</div>
                <p className="text-sm opacity-80 mt-1">So we can track your post performance for the brand and pay you accurately. Read-only access — we never post on your behalf.</p>
              </div>
              <Button
                onClick={() => { window.location.href = `/connect/tiktok/${b.influencer.id}`; }}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Music2 className="w-4 h-4 mr-2" /> Connect TikTok
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Sticky action bar — keeps Accept / Decline reachable on long briefs */}
      {!final && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="hidden sm:block min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">{b.campaign.name}</div>
              {b.fee_kes > 0 && (
                <div className="text-sm font-medium truncate">
                  Net: KES {Math.round(Number(b.fee_kes) * (1 - Number(b.campaign.wht_percent || 0) / 100)).toLocaleString()}
                </div>
              )}
            </div>
            <Button
              onClick={() => act("declined")}
              disabled={acting}
              variant="outline"
              size="lg"
              className="flex-1 sm:flex-initial h-12"
            >
              <XCircle className="w-4 h-4 mr-2" /> Decline
            </Button>
            <Button
              onClick={() => act("confirmed")}
              disabled={acting}
              size="lg"
              className="flex-1 sm:flex-initial h-12 bg-success text-success-foreground hover:bg-success/90"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Accept brief
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
export default PublicBrief;
