import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Wallet, Calendar, CheckCircle2, XCircle, Music2, Check, X, AtSign, Link as LinkIcon, FileText, Clapperboard, Smartphone, Eye, Banknote, Instagram, Youtube, Twitter, Facebook, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { normalizeBreakdown } from "@/components/DeliverablesEditor";
import ContractSign from "@/components/ContractSign";


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

  const paymentSteps: Array<{ icon: any; label: string; desc: string }> = [];

  const breakdown = normalizeBreakdown(b.deliverables_breakdown, DEFAULT_PLATFORMS);
  // Group items by platform for display; cross-posted items appear under every platform with a "cross-post" badge.
  const byPlatform: Record<string, { type: string; count: number; crossWith: string[] }[]> = {};
  for (const it of breakdown.items) {
    for (const p of it.platforms) {
      (byPlatform[p] ||= []).push({ type: it.type, count: it.count, crossWith: it.platforms.filter(x => x !== p) });
    }
  }
  const platforms = Object.keys(byPlatform);
  // For the Connect step we always want at least one option, even when the
  // deliverables breakdown is empty — fall back to the influencer's primary platform.
  const connectPlatforms = platforms.length > 0
    ? platforms
    : DEFAULT_PLATFORMS;
  const hasTikTok = platforms.includes("tiktok");

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-10">
      {/* Branded top bar */}
      <div className="border-b border-border bg-gradient-to-r from-accent/10 via-background to-highlight/10">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-4 flex items-center gap-3">
          {b.client.logo_url ? (
            <div className="w-10 h-10 rounded-md bg-white border border-border shrink-0 flex items-center justify-center overflow-hidden">
              <img src={b.client.logo_url} alt={`${b.client.name} logo`} className="max-w-[80%] max-h-[80%] object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-md bg-secondary border border-border shrink-0 flex items-center justify-center font-display text-sm">
              {(b.client.name || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground truncate">{b.client.name}</div>
            <div className="text-[11px] text-muted-foreground/80">Creator brief</div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <div className="inline-flex items-center gap-2">
          <span className="inline-block w-8 h-px bg-accent" />
          <span className="text-[10px] uppercase tracking-widest text-accent font-medium">For {b.influencer.full_name?.split(" ")[0]}</span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mt-3">{b.campaign.name}</h1>
        <p className="text-muted-foreground mt-3">Hi {b.influencer.full_name?.split(" ")[0]}, you've been invited to collaborate{platforms.length > 1 ? ` across ${platforms.map(p => PLATFORM_LABEL[p] || p).join(" & ")}` : ""}.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden mt-8 border border-border">
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fee</div>
            <div className="font-display text-xl mt-1">KES {Number(b.fee_kes || 0).toLocaleString()}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables</div>
            <div className="font-display text-xl mt-1">{b.deliverables_count}</div>
            {platforms.length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {platforms.length} platform{platforms.length === 1 ? "" : "s"}
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

        {/* Per-platform deliverables breakdown — one brief covers everything */}
        {platforms.length > 0 && (
          <Card className="p-6 mt-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables by platform</div>
            <h3 className="font-display text-xl mt-1 mb-4">{platforms.length === 1 ? "What we need from you" : "One brief, multiple platforms"}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {platforms.map((plat) => {
                const Icon = PLATFORM_ICON[plat] || Music2;
                const items = byPlatform[plat] || [];
                const total = items.reduce((a, it) => a + it.count, 0);
                return (
                  <div key={plat} className="rounded-md border border-border p-4 bg-secondary/30">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-card flex items-center justify-center"><Icon className="w-4 h-4" /></div>
                        <div className="font-medium">{PLATFORM_LABEL[plat] || plat}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{total} piece{total === 1 ? "" : "s"}</Badge>
                    </div>
                    <ul className="mt-3 space-y-1 text-sm">
                      {items.map((it, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                          <span><span className="text-foreground font-medium">{it.count}</span> {it.type}{it.count === 1 ? "" : "s"}</span>
                          {it.crossWith.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">also on {it.crossWith.map(p => PLATFORM_LABEL[p] || p).join(" + ")}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {platforms.length > 1 && (
              <p className="text-xs text-muted-foreground mt-4">This is your single brief — please don't expect a separate invite per platform. Confirm once and you're booked across all of the above.</p>
            )}
          </Card>
        )}

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

        {/* Contract — must be signed before any post can be submitted */}
        <ContractSign token={String(b.brief_token || token)} creatorName={b.influencer?.full_name} onSigned={load} />

        {/* Personal submission link — how the creator sends us their post */}
        {b.submission_token && (
          <Card className={`p-6 mt-6 border-accent/40 bg-accent/5 ${b.contract_required && !b.contract_signed ? "opacity-60" : ""}`}>
            <div className="text-[10px] uppercase tracking-widest text-accent">After you post</div>
            <h3 className="font-display text-xl mt-1">Send us your post link</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Once each piece of content is live, come back and drop the link on your personal submission page below.
              It already knows who you are — you only need to paste the post URL. This is how we track your views and
              engagement for the brand, and how your work counts towards your {b.deliverables_count} deliverable
              {b.deliverables_count === 1 ? "" : "s"}. Submit one link per post, right after publishing.
            </p>
            {b.contract_required && !b.contract_signed ? (
              <p className="text-sm text-accent mt-4 font-medium">
                Sign the agreement above to unlock your submission link.
              </p>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a href={`/c/${b.submission_token}?k=${b.brief_token || token}`} target="_blank" rel="noreferrer">
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                      <Send className="w-4 h-4 mr-2" /> Submit a post link
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/c/${b.submission_token}?k=${b.brief_token || token}`);
                      toast.success("Your submission link is copied — save it for later");
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" /> Copy my link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3 break-all">
                  Bookmark it: {window.location.origin}/c/{b.submission_token}?k={b.brief_token || token}
                </p>
              </>
            )}
          </Card>
        )}


        {/* Status indicator on page (sticky bar handles primary CTAs) */}
        <div className="mt-8 flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="capitalize">Status: {b.status}</Badge>
          {final && b.status === "confirmed" && <span className="text-sm text-success">You're confirmed — see next step below.</span>}
          {final && b.status === "declined" && <span className="text-sm text-muted-foreground">Thanks — your response has been recorded.</span>}
        </div>


        {b.status === "confirmed" && b.influencer?.id && connectPlatforms.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">One last step</div>
            <div className="font-display text-xl">Connect your {connectPlatforms.length === 1 ? PLATFORM_LABEL[connectPlatforms[0]] || connectPlatforms[0] : "accounts"}</div>
            <p className="text-sm text-muted-foreground">So we can track your post performance for the brand. Read-only access — we never post on your behalf.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {connectPlatforms.map((p) => {
                const Icon = PLATFORM_ICON[p] || Music2;
                const label = PLATFORM_LABEL[p] || p;
                return (
                  <Card key={p} className="p-4 bg-gradient-ink text-primary-foreground border-0 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-xs opacity-70">Read-only access</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { window.location.href = `/connect/${p}/${b.influencer.id}`; }}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      Connect
                    </Button>
                  </Card>
                );
              })}
            </div>
          </div>
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
